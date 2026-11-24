import { recoveryCodeIsVerified } from "./password-recovery-policy";
import { enforceSensitiveChallengeVerifyLimit } from "./sensitive-challenge-rate";
import { extractTurnstileToken, verifyTurnstileToken } from "./turnstile.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mutationOriginAllowed } from "../middleware/access-auth";
import { logServerError } from "../logging.ts";
import { deliverTransactionalEmail } from "../email/delivery.server";
import { verificationCodeEmail } from "../email/templates";
import {
  generateOpaqueToken,
  generateSixDigitCode,
  hashAuthValue,
  passwordHistoryFingerprint,
  secureStringEquals,
} from "./auth-crypto";
import type { LiveAuthDatabase } from "./live-auth-database";
const GENERIC = "Se o e-mail estiver cadastrado, enviaremos um código de seis dígitos.",
  OTP = 600000,
  GRANT = 10 * 60 * 1000;
type RecoveryPayload = {
  email?: unknown;
  challengeId?: unknown;
  code?: unknown;
  grantToken?: unknown;
  newPassword?: unknown;
  revokeOtherSessions?: unknown;
  deliverable?: unknown;
};
type RecoveryMetadata = { deliverable?: unknown };
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
function ip(r: Request) {
  return (
    r.headers.get("x-nf-client-connection-ip") ??
    r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}
async function clients() {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server");
  return { admin: supabaseAdmin, db: supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase> };
}
function emailOf(x: unknown) {
  return x && typeof x === "object" && typeof (x as RecoveryPayload).email === "string"
    ? String((x as RecoveryPayload).email)
        .trim()
        .toLowerCase()
    : "";
}
export async function startPasswordRecovery(request: Request, payload: unknown) {
  if (!mutationOriginAllowed(request)) return json({ message: GENERIC }, 200);

  // Cloudflare Turnstile verification (skip if not configured).
  // Always return the generic message to avoid leaking account existence.
  const turnstileToken = extractTurnstileToken(payload);
  const turnstileResult = await verifyTurnstileToken(turnstileToken, ip(request));
  if (!turnstileResult.success) {
    return json({ message: GENERIC }, 200);
  }

  const email = emailOf(payload),
    started = Date.now();
  let challengeId: string | null = null;
  try {
    if (email) {
      const s = secret(),
        { db } = await clients(),
        scope = hashAuthValue(s, "password-reset-start", `${email}\0${ip(request) ?? "unknown"}`);
      const { data: limit, error: limitError } = await db.rpc("consume_auth_rate_limit", {
        p_action: "password-reset-start",
        p_scope_hash: scope,
        p_limit: 5,
        p_window_seconds: 7200,
        p_block_seconds: 7200,
      });
      if (limitError || limit?.[0]?.allowed !== true)
        return genericPasswordRecoveryResponse(started, null);
      const { data: user } = await db.rpc("lookup_auth_user_by_email", { p_email: email });
      const row = user?.[0],
        code = generateSixDigitCode(),
        subject = row?.user_id ?? "anonymous";
      const { data: c, error } = await db
        .from("email_challenges")
        .insert({
          user_id: row?.user_id ?? null,
          purpose: "password_reset",
          target_email: email,
          target_email_hash: hashAuthValue(s, "email", email),
          code_hash: hashAuthValue(s, "password-reset-code", `${subject}\0${code}`),
          request_ip: ip(request),
          user_agent: request.headers.get("user-agent"),
          expires_at: new Date(Date.now() + OTP).toISOString(),
          metadata: {
            channel: "email",
            deliverable: Boolean(row?.user_id && row.email_confirmed_at),
          },
        })
        .select("id")
        .single();
      if (error) throw error;
      challengeId = c.id;
      if (row?.user_id && row.email_confirmed_at) {
        const mail = verificationCodeEmail({ code, purpose: "password_reset" });
        await deliverTransactionalEmail({
          to: email,
          ...mail,
          idempotencyKey: `password-reset:${c.id}:1`,
          eventType: "auth.password_reset.code_sent",
          templateKey: "verification_code",
          userId: row.user_id,
          subjectType: "email_challenge",
          subjectId: c.id,
          payload: { purpose: "password_reset", send_count: 1 },
        });
      }
    }
  } catch (e) {
    logServerError("[auth/password/start]", e);
  }
  return genericPasswordRecoveryResponse(started, challengeId);
}
async function genericPasswordRecoveryResponse(started: number, challengeId: string | null) {
  const wait = Math.max(0, 250 - (Date.now() - started));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  return json({ message: GENERIC, challengeId }, 200);
}
function challengeInput(x: unknown) {
  if (!x || typeof x !== "object") return null;
  const v = x as RecoveryPayload,
    id = typeof v.challengeId === "string" ? v.challengeId.trim() : "",
    code = typeof v.code === "string" ? v.code.replace(/\D/g, "") : "";
  return id && /^\d{6}$/.test(code) ? { id, code } : null;
}
export async function verifyPasswordRecovery(request: Request, payload: unknown) {
  if (!mutationOriginAllowed(request)) return json({ error: "Origem não permitida" }, 403);
  const p = challengeInput(payload);
  if (!p) return json({ error: "Código inválido" }, 400);
  try {
    const s = secret(),
      { db } = await clients();
    const limit = await enforceSensitiveChallengeVerifyLimit(db, s, p.id, "password-reset-verify");
    if (!limit.allowed)
      return json(
        {
          error: limit.status === 429 ? "Muitas tentativas" : "Limitador indisponível",
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        limit.status,
      );
    const { data: c, error } = await db
      .from("email_challenges")
      .select("*")
      .eq("id", p.id)
      .eq("purpose", "password_reset")
      .maybeSingle();
    if (error) throw error;
    if (!c || !c.user_id || c.consumed_at || new Date(c.expires_at).getTime() <= Date.now())
      return json({ error: "Código inválido ou expirado" }, 400);
    const h = hashAuthValue(s, "password-reset-code", `${c.user_id}\0${p.code}`);
    const { data: ok, error: claim } = await db.rpc("claim_email_challenge", {
      p_challenge_id: c.id,
      p_code_hash: h,
    });
    if (claim) throw claim;
    if (!recoveryCodeIsVerified(ok === true, c.verified_at, h, c.code_hash))
      return json({ error: "Código inválido ou expirado" }, 400);
    const grant = generateOpaqueToken();
    await db
      .from("email_challenges")
      .update({
        grant_token_hash: hashAuthValue(s, "password-reset-grant", grant),
        grant_expires_at: new Date(Date.now() + GRANT).toISOString(),
      })
      .eq("id", c.id);
    return json({
      success: true,
      challengeId: c.id,
      grantToken: grant,
      grantExpiresInSeconds: 600,
    });
  } catch (e) {
    logServerError("[auth/password/verify]", e);
    return json({ error: "Não foi possível validar o código" }, 500);
  }
}
export async function resetPassword(request: Request, payload: unknown) {
  if (!mutationOriginAllowed(request)) return json({ error: "Origem não permitida" }, 403);
  if (!payload || typeof payload !== "object") return json({ error: "Dados inválidos" }, 400);
  const v = payload as RecoveryPayload,
    id = typeof v.challengeId === "string" ? v.challengeId.trim() : "",
    grant = typeof v.grantToken === "string" ? v.grantToken : "",
    password = typeof v.newPassword === "string" ? v.newPassword : "",
    revoke = v.revokeOtherSessions !== false;
  if (password.length < 8 || !id || !grant) return json({ error: "Dados inválidos" }, 400);
  try {
    const s = secret(),
      { admin, db } = await clients();
    const { data: c, error } = await db
      .from("email_challenges")
      .select("*")
      .eq("id", id)
      .eq("purpose", "password_reset")
      .maybeSingle();
    if (error) throw error;
    if (
      !c ||
      !c.user_id ||
      !c.verified_at ||
      c.consumed_at ||
      !c.grant_token_hash ||
      !c.grant_expires_at ||
      new Date(c.grant_expires_at).getTime() <= Date.now() ||
      !secureStringEquals(c.grant_token_hash, hashAuthValue(s, "password-reset-grant", grant))
    )
      return json({ error: "Autorização expirada" }, 400);
    const fingerprint = passwordHistoryFingerprint(s, c.user_id, password);
    const { data: history, error: he } = await db
      .from("password_history")
      .select("password_hash,created_at")
      .eq("user_id", c.user_id)
      .order("created_at", { ascending: false })
      .limit(3);
    if (he) throw he;
    if (history?.some((h) => secureStringEquals(h.password_hash, fingerprint)))
      return json({ error: "Escolha uma senha diferente das três últimas" }, 400);
    const now = new Date().toISOString();
    const { data: consumed, error: consumeError } = await db
      .from("email_challenges")
      .update({ consumed_at: now })
      .eq("id", c.id)
      .eq("grant_token_hash", c.grant_token_hash)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (consumeError) throw consumeError;
    if (!consumed) return json({ error: "Autorização já utilizada" }, 409);
    const { error: update } = await admin.auth.admin.updateUserById(c.user_id, { password });
    if (update) throw update;
    const { error: historyError } = await db
      .from("password_history")
      .insert({ user_id: c.user_id, password_hash: fingerprint });
    if (historyError) throw historyError;
    if (revoke) {
      const { error: revokeError } = await db
        .from("user_sessions")
        .update({ revoked_at: now, revoke_reason: "password_reset" })
        .eq("user_id", c.user_id)
        .is("revoked_at", null);
      if (revokeError) throw revokeError;
    }
    const { error: eventError } = await db.from("security_events").insert({
      user_id: c.user_id,
      event_type: "password.changed",
      severity: "warning",
      ip: ip(request),
      user_agent: request.headers.get("user-agent"),
      metadata: { revoke_other_sessions: revoke },
    });
    if (eventError) throw eventError;
    return json({ success: true });
  } catch (e) {
    logServerError("[auth/password/reset]", e);
    return json({ error: "Não foi possível alterar a senha" }, 500);
  }
}

export async function resendPasswordRecoveryCode(request: Request, payload: unknown) {
  if (!mutationOriginAllowed(request)) return json({ message: GENERIC }, 200);
  const id =
    payload &&
    typeof payload === "object" &&
    typeof (payload as RecoveryPayload).challengeId === "string"
      ? String((payload as RecoveryPayload).challengeId).trim()
      : "";
  if (!id) return json({ message: GENERIC }, 200);
  try {
    const s = secret(),
      { db } = await clients();
    const { data: c, error } = await db
      .from("email_challenges")
      .select("*")
      .eq("id", id)
      .eq("purpose", "password_reset")
      .maybeSingle();
    if (error) throw error;
    if (!c || c.consumed_at) return json({ message: GENERIC }, 200);
    const now = Date.now(),
      elapsed = now - new Date(c.last_sent_at).getTime();
    if (elapsed < 60_000)
      return json(
        {
          message: GENERIC,
          challengeId: c.id,
          retryAfterSeconds: Math.ceil((60_000 - elapsed) / 1000),
        },
        429,
      );
    if (c.send_count >= 5 || (c.blocked_until && new Date(c.blocked_until).getTime() > now))
      return json({ message: GENERIC, challengeId: c.id }, 200);
    const limit = await db.rpc("consume_auth_rate_limit", {
      p_action: "password-reset-resend",
      p_scope_hash: hashAuthValue(
        s,
        "password-reset-resend",
        `${c.target_email}\0${ip(request) ?? "unknown"}`,
      ),
      p_limit: 5,
      p_window_seconds: 7200,
      p_block_seconds: 7200,
    });
    if (limit.error || !limit.data?.[0]?.allowed)
      return json({ message: GENERIC, challengeId: c.id }, 200);
    const code = generateSixDigitCode(),
      subject = c.user_id ?? "anonymous",
      count = c.send_count + 1;
    const { error: update } = await db
      .from("email_challenges")
      .update({
        code_hash: hashAuthValue(s, "password-reset-code", `${subject}\0${code}`),
        send_count: count,
        last_sent_at: new Date().toISOString(),
        expires_at: new Date(now + OTP).toISOString(),
        failed_attempts: 0,
      })
      .eq("id", c.id)
      .is("consumed_at", null);
    if (update) throw update;
    const meta =
      c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
        ? (c.metadata as RecoveryMetadata)
        : {};
    if (c.user_id && meta.deliverable === true) {
      const mail = verificationCodeEmail({ code, purpose: "password_reset" });
      await deliverTransactionalEmail({
        to: c.target_email,
        ...mail,
        idempotencyKey: `password-reset:${c.id}:${count}`,
        eventType: "auth.password_reset.code_resent",
        templateKey: "verification_code",
        userId: c.user_id,
        subjectType: "email_challenge",
        subjectId: c.id,
        payload: { purpose: "password_reset", send_count: count },
      });
    }
    return json({ message: GENERIC, challengeId: c.id, resendAfterSeconds: 60 }, 200);
  } catch (e) {
    logServerError("[auth/password/resend]", e);
    return json({ message: GENERIC, challengeId: id }, 200);
  }
}
