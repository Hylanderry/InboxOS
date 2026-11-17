import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneE164, type SupportedCountryCode } from "../../features/auth/auth-validation";
import { requireAuth } from "../middleware/auth";
import { logServerError } from "../logging.ts";
import { deliverTransactionalEmail } from "../email/delivery.server";
import { verificationCodeEmail } from "../email/templates";
import { generateSixDigitCode, hashAuthValue } from "./auth-crypto";
import type { LiveAuthDatabase } from "./live-auth-database";
import { recoveryCodeIsVerified } from "./password-recovery-policy";
import {
  enforceSensitiveChallengeRateLimit,
  enforceSensitiveChallengeVerifyLimit,
} from "./sensitive-challenge-rate";
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });
}
function secret() {
  const s = process.env["AUTH_CRYPTO_SECRET"]?.trim();
  if (!s || s.length < 32) throw new Error("AUTH_CRYPTO_SECRET missing");
  return s;
}
type PhoneChangePayload = {
  countryCode?: unknown;
  phone?: unknown;
  challengeId?: unknown;
  code?: unknown;
};
type PhoneChangeMetadata = { new_phone_e164?: unknown; country_code?: unknown };
async function db() {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase>;
}
export async function startPhoneChange(request: Request, payload: unknown) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!auth.user.email || !payload || typeof payload !== "object")
    return json({ error: "Dados inválidos" }, 400);
  const v = payload as PhoneChangePayload,
    country = typeof v.countryCode === "string" ? (v.countryCode as SupportedCountryCode) : "BR",
    phone = typeof v.phone === "string" ? v.phone : "",
    normalized = normalizePhoneE164(country, phone);
  if (!normalized) return json({ error: "Telefone inválido" }, 400);
  try {
    const d = await db();
    const limit = await enforceSensitiveChallengeRateLimit(
      d,
      secret(),
      auth.user.id,
      "phone-change-start",
    );
    if (!limit.allowed)
      return json(
        {
          error: limit.status === 429 ? "Muitas solicitações de código" : "Limitador indisponível",
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        limit.status,
      );
    const code = generateSixDigitCode(),
      { data: c, error } = await d
        .from("email_challenges")
        .insert({
          user_id: auth.user.id,
          purpose: "phone_change",
          target_email: auth.user.email,
          target_email_hash: hashAuthValue(secret(), "email", auth.user.email),
          code_hash: hashAuthValue(secret(), "phone_change-code", `${auth.user.id}\0${code}`),
          user_agent: request.headers.get("user-agent"),
          expires_at: new Date(Date.now() + 600000).toISOString(),
          metadata: { new_phone_e164: normalized, country_code: country },
        })
        .select("id")
        .single();
    if (error) throw error;
    const mail = verificationCodeEmail({ code, purpose: "phone_change" });
    await deliverTransactionalEmail({
      to: auth.user.email,
      ...mail,
      idempotencyKey: `phone-change:${c.id}:1`,
      eventType: "auth.phone_change.code_sent",
      templateKey: "verification_code",
      userId: auth.user.id,
      subjectType: "email_challenge",
      subjectId: c.id,
      payload: { purpose: "phone_change", send_count: 1 },
    });
    return json({ challengeId: c.id, expiresInSeconds: 600 });
  } catch (e) {
    logServerError("[phone-change/start]", e);
    return json({ error: "Não foi possível iniciar a alteração" }, 500);
  }
}
export async function verifyPhoneChange(request: Request, payload: unknown) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!payload || typeof payload !== "object") return json({ error: "Dados inválidos" }, 400);
  const v = payload as PhoneChangePayload,
    id = typeof v.challengeId === "string" ? v.challengeId : "",
    code = typeof v.code === "string" ? v.code.replace(/\D/g, "") : "";
  if (!id || !/^\d{6}$/.test(code)) return json({ error: "Código inválido" }, 400);
  try {
    const d = await db();
    const limit = await enforceSensitiveChallengeVerifyLimit(
      d,
      secret(),
      id,
      "phone-change-verify",
    );
    if (!limit.allowed)
      return json(
        {
          error: limit.status === 429 ? "Muitas tentativas" : "Limitador indisponível",
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        limit.status,
      );
    const { data: c, error } = await d
      .from("email_challenges")
      .select("*")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .eq("purpose", "phone_change")
      .maybeSingle();
    if (error) throw error;
    if (
      !c ||
      c.consumed_at ||
      new Date(c.expires_at).getTime() <= Date.now() ||
      (c.blocked_until && new Date(c.blocked_until).getTime() > Date.now())
    )
      return json({ error: "Código inválido ou expirado" }, 400);
    const h = hashAuthValue(secret(), "phone_change-code", `${auth.user.id}\0${code}`),
      { data: ok, error: claim } = await d.rpc("claim_email_challenge", {
        p_challenge_id: id,
        p_code_hash: h,
      });
    if (claim) throw claim;
    if (!recoveryCodeIsVerified(ok === true, c.verified_at, h, c.code_hash))
      return json({ error: "Código inválido ou expirado" }, 400);
    const meta = c.metadata as PhoneChangeMetadata,
      newPhone = typeof meta.new_phone_e164 === "string" ? meta.new_phone_e164 : "",
      country = typeof meta.country_code === "string" ? meta.country_code : "";
    if (!newPhone || !country) return json({ error: "Desafio inválido" }, 400);
    const now = new Date().toISOString(),
      { data: consumed, error: consumeError } = await d
        .from("email_challenges")
        .update({ consumed_at: now })
        .eq("id", id)
        .is("consumed_at", null)
        .select("id")
        .maybeSingle();
    if (consumeError) throw consumeError;
    if (!consumed) return json({ error: "Autorização já utilizada" }, 409);
    const { error: update } = await d
      .from("profiles")
      .update({ phone_e164: newPhone, country_code: country, updated_at: now })
      .eq("user_id", auth.user.id);
    if (update) throw update;
    await d.from("security_events").insert({
      user_id: auth.user.id,
      session_id: auth.session.id,
      device_id: auth.session.deviceId,
      event_type: "phone.changed",
      severity: "info",
      metadata: { country_code: country },
    });
    return json({ success: true, phoneE164: newPhone });
  } catch (e) {
    logServerError("[phone-change/verify]", e);
    return json({ error: "Não foi possível alterar o telefone" }, 500);
  }
}
