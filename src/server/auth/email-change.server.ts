import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middleware/auth";
import { logServerError } from "../logging.ts";
import { deliverTransactionalEmail } from "../email/delivery.server";
import { securityAlertEmail, verificationCodeEmail } from "../email/templates";
import {
  generateOpaqueToken,
  generateSixDigitCode,
  hashAuthValue,
  secureStringEquals,
} from "./auth-crypto";
import type { LiveAuthDatabase } from "./live-auth-database";
import type { Json } from "../../integrations/supabase/types";
import { recoveryCodeIsVerified } from "./password-recovery-policy";
import {
  enforceSensitiveChallengeRateLimit,
  enforceSensitiveChallengeVerifyLimit,
} from "./sensitive-challenge-rate";
const TTL = 600000;
type EmailChangePayload = {
  challengeId?: unknown;
  code?: unknown;
  oldChallengeId?: unknown;
  grantToken?: unknown;
  newEmail?: unknown;
  newChallengeId?: unknown;
};
type EmailChallengeMetadata = {
  old_challenge_id?: unknown;
  old_email?: unknown;
};
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
async function db() {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server");
  return { supabaseAdmin, authDb: supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase> };
}
async function challenge(
  authDb: SupabaseClient<LiveAuthDatabase>,
  input: {
    userId: string;
    purpose: "email_change_old" | "email_change_new";
    email: string;
    code: string;
    request: Request;
    metadata?: Json;
  },
) {
  const { data, error } = await authDb
    .from("email_challenges")
    .insert({
      user_id: input.userId,
      purpose: input.purpose,
      target_email: input.email,
      target_email_hash: hashAuthValue(secret(), "email", input.email),
      code_hash: hashAuthValue(secret(), `${input.purpose}-code`, `${input.userId}\0${input.code}`),
      request_ip: ip(input.request),
      user_agent: input.request.headers.get("user-agent"),
      expires_at: new Date(Date.now() + TTL).toISOString(),
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
export async function startOldEmailChallenge(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!auth.user.email) return json({ error: "Conta sem e-mail" }, 400);
  try {
    const { authDb } = await db();
    const limit = await enforceSensitiveChallengeRateLimit(
      authDb,
      secret(),
      auth.user.id,
      "email-change-old-start",
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
      id = await challenge(authDb, {
        userId: auth.user.id,
        purpose: "email_change_old",
        email: auth.user.email,
        code,
        request,
      });
    const mail = verificationCodeEmail({ code, purpose: "email_change_old" });
    await deliverTransactionalEmail({
      to: auth.user.email,
      ...mail,
      idempotencyKey: `email-change-old:${id}:1`,
      eventType: "auth.email_change.old_code_sent",
      templateKey: "verification_code",
      userId: auth.user.id,
      subjectType: "email_challenge",
      subjectId: id,
      payload: { purpose: "email_change_old", send_count: 1 },
    });
    return json({ challengeId: id, expiresInSeconds: 600 });
  } catch (e) {
    logServerError("[email-change/old/start]", e);
    return json({ error: "Não foi possível iniciar a troca de e-mail" }, 500);
  }
}
export async function verifyOldEmailChallenge(request: Request, payload: unknown) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!payload || typeof payload !== "object") return json({ error: "Dados inválidos" }, 400);
  const v = payload as EmailChangePayload,
    id = typeof v.challengeId === "string" ? v.challengeId : "",
    code = typeof v.code === "string" ? v.code.replace(/\D/g, "") : "";
  if (!id || !/^\d{6}$/.test(code)) return json({ error: "Código inválido" }, 400);
  try {
    const { authDb } = await db();
    const limit = await enforceSensitiveChallengeVerifyLimit(
      authDb,
      secret(),
      id,
      "email-change-old-verify",
    );
    if (!limit.allowed)
      return json(
        {
          error: limit.status === 429 ? "Muitas tentativas" : "Limitador indisponível",
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        limit.status,
      );
    const { data: c, error } = await authDb
      .from("email_challenges")
      .select("*")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .eq("purpose", "email_change_old")
      .maybeSingle();
    if (error) throw error;
    if (
      !c ||
      c.consumed_at ||
      new Date(c.expires_at).getTime() <= Date.now() ||
      (c.blocked_until && new Date(c.blocked_until).getTime() > Date.now())
    )
      return json({ error: "Código inválido ou expirado" }, 400);
    const h = hashAuthValue(secret(), "email_change_old-code", `${auth.user.id}\0${code}`),
      { data: ok, error: claim } = await authDb.rpc("claim_email_challenge", {
        p_challenge_id: id,
        p_code_hash: h,
      });
    if (claim) throw claim;
    if (!recoveryCodeIsVerified(ok === true, c.verified_at, h, c.code_hash))
      return json({ error: "Código inválido ou expirado" }, 400);
    const grant = generateOpaqueToken();
    const { error: grantError } = await authDb
      .from("email_challenges")
      .update({
        grant_token_hash: hashAuthValue(secret(), "email-change-old-grant", grant),
        grant_expires_at: new Date(Date.now() + TTL).toISOString(),
      })
      .eq("id", id);
    if (grantError) throw grantError;
    return json({ oldChallengeId: id, grantToken: grant, expiresInSeconds: 600 });
  } catch (e) {
    logServerError("[email-change/old/verify]", e);
    return json({ error: "Não foi possível confirmar o e-mail atual" }, 500);
  }
}
export async function startNewEmailChallenge(request: Request, payload: unknown) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!payload || typeof payload !== "object") return json({ error: "Dados inválidos" }, 400);
  const v = payload as EmailChangePayload,
    oldId = typeof v.oldChallengeId === "string" ? v.oldChallengeId : "",
    grant = typeof v.grantToken === "string" ? v.grantToken : "",
    newEmail = typeof v.newEmail === "string" ? v.newEmail.trim().toLowerCase() : "";
  if (
    !oldId ||
    !grant ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) ||
    newEmail === auth.user.email?.toLowerCase()
  )
    return json({ error: "Novo e-mail inválido" }, 400);
  try {
    const { authDb } = await db();
    const { data: old, error } = await authDb
      .from("email_challenges")
      .select("*")
      .eq("id", oldId)
      .eq("user_id", auth.user.id)
      .eq("purpose", "email_change_old")
      .maybeSingle();
    if (error) throw error;
    if (
      !old?.verified_at ||
      old.consumed_at ||
      !old.grant_token_hash ||
      !old.grant_expires_at ||
      new Date(old.grant_expires_at).getTime() <= Date.now() ||
      !secureStringEquals(
        old.grant_token_hash,
        hashAuthValue(secret(), "email-change-old-grant", grant),
      )
    )
      return json({ error: "Autorização expirada" }, 400);
    const limit = await enforceSensitiveChallengeRateLimit(
      authDb,
      secret(),
      auth.user.id,
      "email-change-new-start",
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
      id = await challenge(authDb, {
        userId: auth.user.id,
        purpose: "email_change_new",
        email: newEmail,
        code,
        request,
        metadata: { old_challenge_id: oldId, old_email: auth.user.email },
      });
    const mail = verificationCodeEmail({ code, purpose: "email_change_new" });
    await deliverTransactionalEmail({
      to: newEmail,
      ...mail,
      idempotencyKey: `email-change-new:${id}:1`,
      eventType: "auth.email_change.new_code_sent",
      templateKey: "verification_code",
      userId: auth.user.id,
      subjectType: "email_challenge",
      subjectId: id,
      payload: { purpose: "email_change_new", send_count: 1 },
    });
    return json({ newChallengeId: id, expiresInSeconds: 600 });
  } catch (e) {
    logServerError("[email-change/new/start]", e);
    return json({ error: "Não foi possível validar o novo e-mail" }, 500);
  }
}
export async function verifyNewEmailChallenge(request: Request, payload: unknown) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!payload || typeof payload !== "object") return json({ error: "Dados inválidos" }, 400);
  const v = payload as EmailChangePayload,
    id = typeof v.newChallengeId === "string" ? v.newChallengeId : "",
    code = typeof v.code === "string" ? v.code.replace(/\D/g, "") : "";
  if (!id || !/^\d{6}$/.test(code)) return json({ error: "Código inválido" }, 400);
  try {
    const { authDb, supabaseAdmin } = await db();
    const limit = await enforceSensitiveChallengeVerifyLimit(
      authDb,
      secret(),
      id,
      "email-change-new-verify",
    );
    if (!limit.allowed)
      return json(
        {
          error: limit.status === 429 ? "Muitas tentativas" : "Limitador indisponível",
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        limit.status,
      );
    const { data: c, error } = await authDb
      .from("email_challenges")
      .select("*")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .eq("purpose", "email_change_new")
      .maybeSingle();
    if (error) throw error;
    if (
      !c ||
      c.consumed_at ||
      new Date(c.expires_at).getTime() <= Date.now() ||
      (c.blocked_until && new Date(c.blocked_until).getTime() > Date.now())
    )
      return json({ error: "Código inválido ou expirado" }, 400);
    const h = hashAuthValue(secret(), "email_change_new-code", `${auth.user.id}\0${code}`);
    const { data: ok, error: claim } = await authDb.rpc("claim_email_challenge", {
      p_challenge_id: id,
      p_code_hash: h,
    });
    if (claim) throw claim;
    if (!recoveryCodeIsVerified(ok === true, c.verified_at, h, c.code_hash))
      return json({ error: "Código inválido ou expirado" }, 400);
    const oldEmail = auth.user.email ?? "",
      newEmail = c.target_email;
    const metadata =
      c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
        ? (c.metadata as EmailChallengeMetadata)
        : {};
    const oldId = typeof metadata.old_challenge_id === "string" ? metadata.old_challenge_id : "";
    if (!oldId || !oldEmail) return json({ error: "Desafio anterior não encontrado" }, 400);
    const { data: oldChallenge, error: oldChallengeError } = await authDb
      .from("email_challenges")
      .select("id,verified_at,consumed_at,grant_expires_at,target_email")
      .eq("id", oldId)
      .eq("user_id", auth.user.id)
      .eq("purpose", "email_change_old")
      .maybeSingle();
    if (oldChallengeError) throw oldChallengeError;
    if (
      !oldChallenge?.verified_at ||
      oldChallenge.consumed_at ||
      !oldChallenge.grant_expires_at ||
      new Date(oldChallenge.grant_expires_at).getTime() <= Date.now() ||
      oldChallenge.target_email.toLowerCase() !== oldEmail.toLowerCase()
    )
      return json({ error: "Autorização anterior inválida ou expirada" }, 400);
    const now = new Date().toISOString();
    // First claim the old proof once. Multiple 'new email' challenges may have
    // been created from the same proof, but only one may change the identity.
    const { data: consumedOld, error: oldConsumeError } = await authDb
      .from("email_challenges")
      .update({ consumed_at: now })
      .eq("id", oldId)
      .eq("user_id", auth.user.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (oldConsumeError) throw oldConsumeError;
    if (!consumedOld) return json({ error: "Autorização anterior já utilizada" }, 409);
    const { data: consumedNew, error: newConsumeError } = await authDb
      .from("email_challenges")
      .update({ consumed_at: now })
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (newConsumeError) throw newConsumeError;
    if (!consumedNew) return json({ error: "Código já utilizado" }, 409);
    const { error: updateAuth } = await supabaseAdmin.auth.admin.updateUserById(auth.user.id, {
      email: newEmail,
      email_confirm: true,
    });
    if (updateAuth) throw updateAuth;
    const { error: updateProfile } = await authDb
      .from("profiles")
      .update({ email: newEmail, updated_at: new Date().toISOString() })
      .eq("user_id", auth.user.id);
    if (updateProfile) {
      await supabaseAdmin.auth.admin.updateUserById(auth.user.id, {
        email: oldEmail,
        email_confirm: true,
      });
      throw updateProfile;
    }
    await authDb.from("security_events").insert({
      user_id: auth.user.id,
      session_id: auth.session.id,
      device_id: auth.session.deviceId,
      event_type: "email.changed",
      severity: "warning",
      ip: ip(request),
      user_agent: request.headers.get("user-agent"),
      metadata: { new_email: newEmail },
    });
    if (oldEmail) {
      const alert = securityAlertEmail({
        title: "Seu e-mail foi alterado",
        message: `O e-mail da sua conta foi alterado para ${newEmail}.`,
      });
      await deliverTransactionalEmail({
        to: oldEmail,
        ...alert,
        idempotencyKey: `email-changed:${auth.user.id}:${Date.now()}`,
        eventType: "auth.email_change.completed_alert",
        templateKey: "security_alert",
        userId: auth.user.id,
        subjectType: "user",
        subjectId: auth.user.id,
        payload: { new_email: newEmail },
      }).catch((e) => logServerError("[email-change/alert]", e));
    }
    return json({ success: true, email: newEmail });
  } catch (e) {
    logServerError("[email-change/new/verify]", e);
    return json({ error: "Não foi possível concluir a troca de e-mail" }, 500);
  }
}
export async function cancelEmailChange(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { authDb } = await db(),
    now = new Date().toISOString();
  await authDb
    .from("email_challenges")
    .update({ consumed_at: now })
    .eq("user_id", auth.user.id)
    .in("purpose", ["email_change_old", "email_change_new"])
    .is("consumed_at", null);
  return json({ success: true });
}
