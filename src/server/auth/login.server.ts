import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mutationOriginAllowed } from "../middleware/access-auth";
import { logServerError } from "../logging.ts";
import { deliverTransactionalEmail } from "../email/delivery.server";
import { ResendDeliveryError } from "../email/resend.server";
import { verificationCodeEmail } from "../email/templates";
import { generateSixDigitCode, hashAuthValue } from "./auth-crypto";
import { appSessionTokenHash, parseSupabaseSessionClaims } from "./session-token";
import type { LiveAuthDatabase } from "./live-auth-database";
const OTP_TTL = 10 * 60 * 1000,
  TRUST_DAYS = 90 * 24 * 60 * 60 * 1000,
  SESSION_SHORT = 24 * 60 * 60 * 1000;
type LoginPayload = {
  email?: unknown;
  password?: unknown;
  deviceToken?: unknown;
  rememberDevice?: unknown;
  challengeId?: unknown;
  code?: unknown;
};
function json(body: unknown, status = 200, headers?: HeadersInit) {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: h });
}
function secret() {
  const v = process.env["AUTH_CRYPTO_SECRET"]?.trim();
  if (!v || v.length < 32) throw new Error("AUTH_CRYPTO_SECRET missing");
  return v;
}
function ip(r: Request) {
  return (
    r.headers.get("x-nf-client-connection-ip") ??
    r.headers.get("cf-connecting-ip") ??
    r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}
function parse(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const v = input as LoginPayload;
  const email = typeof v.email === "string" ? v.email.trim().toLowerCase() : "",
    password = typeof v.password === "string" ? v.password : "",
    deviceToken = typeof v.deviceToken === "string" ? v.deviceToken.trim() : "",
    remember = v.rememberDevice !== false;
  return email && password.length >= 8 && deviceToken.length >= 16 && deviceToken.length <= 256
    ? { email, password, deviceToken, remember }
    : null;
}
function authClient() {
  const u = process.env["SUPABASE_URL"],
    k = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!u || !k) throw new Error("Supabase environment missing");
  return createClient(u, k, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function db() {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server");
  return { supabaseAdmin, authDb: supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase> };
}
async function isGloballySuspended(authDb: SupabaseClient<LiveAuthDatabase>, userId: string) {
  const { data, error } = await authDb
    .from("system_user_controls")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.status === "suspended";
}
async function findOrCreateDevice(
  authDb: SupabaseClient<LiveAuthDatabase>,
  userId: string,
  rawToken: string,
  request: Request,
) {
  const tokenHash = hashAuthValue(secret(), "device-token", `${userId}\0${rawToken}`);
  const { data: initialDevice, error } = await authDb
    .from("user_devices")
    .select("*")
    .eq("user_id", userId)
    .eq("device_token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  let device = initialDevice;
  const now = new Date().toISOString();
  if (device) {
    const { data: updated, error: e } = await authDb
      .from("user_devices")
      .update({
        last_seen_at: now,
        last_ip: ip(request),
        user_agent: request.headers.get("user-agent"),
      })
      .eq("id", device.id)
      .select("*")
      .single();
    if (e) throw e;
    device = updated;
  } else {
    const { data: created, error: e } = await authDb
      .from("user_devices")
      .insert({
        user_id: userId,
        device_token_hash: tokenHash,
        user_agent: request.headers.get("user-agent"),
        first_ip: ip(request),
        last_ip: ip(request),
        metadata: { source: "web" },
      })
      .select("*")
      .single();
    if (e) throw e;
    device = created;
  }
  return device;
}
async function createAppSession(
  authDb: SupabaseClient<LiveAuthDatabase>,
  input: {
    userId: string;
    deviceId: string;
    accessToken: string;
    remember: boolean;
    request: Request;
  },
) {
  const claims = parseSupabaseSessionClaims(input.accessToken);
  if (!claims) throw new Error("Supabase session_id missing");
  const expiresAt = new Date(
    Date.now() + (input.remember ? TRUST_DAYS : SESSION_SHORT),
  ).toISOString();
  const { data, error } = await authDb
    .from("user_sessions")
    .insert({
      user_id: input.userId,
      device_id: input.deviceId,
      token_hash: appSessionTokenHash(secret(), claims.sessionId),
      expires_at: expiresAt,
      last_ip: ip(input.request),
      user_agent: input.request.headers.get("user-agent"),
      metadata: { supabase_access_exp: claims.expiresAt },
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
async function renewTrustedDevice(
  authDb: SupabaseClient<LiveAuthDatabase>,
  userId: string,
  deviceId: string,
) {
  // A remembered device is a rolling trust window. Keep the window alive
  // while the device is actively used, but never resurrect a device revoked
  // by the user (the predicate makes a concurrent revoke fail closed).
  const { data, error } = await authDb
    .from("user_devices")
    .update({
      trusted_until: new Date(Date.now() + TRUST_DAYS).toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", deviceId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("trusted device was revoked during login");
}
function tokens(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
}) {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
  };
}
export async function startLogin(request: Request, payload: unknown) {
  if (!mutationOriginAllowed(request)) return json({ error: "Origem não permitida" }, 403);
  const p = parse(payload);
  if (!p) return json({ error: "Credenciais inválidas" }, 400);
  try {
    const client = authClient(),
      { authDb } = await db();
    const { data, error } = await client.auth.signInWithPassword({
      email: p.email,
      password: p.password,
    });
    if (error || !data.user || !data.session)
      return json({ error: "E-mail ou senha inválidos" }, 401);
    if (await isGloballySuspended(authDb, data.user.id))
      return json({ error: "Acesso suspenso pela administração" }, 403);
    const device = await findOrCreateDevice(authDb, data.user.id, p.deviceToken, request);
    const trusted = Boolean(
      !device.revoked_at &&
      device.trusted_until &&
      new Date(device.trusted_until).getTime() > Date.now(),
    );
    if (trusted) {
      if (p.remember) await renewTrustedDevice(authDb, data.user.id, device.id);
      const appSessionId = await createAppSession(authDb, {
        userId: data.user.id,
        deviceId: device.id,
        accessToken: data.session.access_token,
        remember: p.remember,
        request,
      });
      await authDb.from("security_events").insert({
        user_id: data.user.id,
        session_id: appSessionId,
        device_id: device.id,
        event_type: "login.success",
        severity: "info",
        ip: ip(request),
        user_agent: request.headers.get("user-agent"),
        metadata: { trusted_device: true },
      });
      return json({ success: true, requiresOtp: false, ...tokens(data.session) });
    }
    const code = generateSixDigitCode();
    const { data: challenge, error: ce } = await authDb
      .from("email_challenges")
      .insert({
        user_id: data.user.id,
        purpose: "login_device",
        target_email: p.email,
        target_email_hash: hashAuthValue(secret(), "email", p.email),
        code_hash: hashAuthValue(secret(), "login-device-code", `${data.user.id}\0${code}`),
        device_scope_hash: hashAuthValue(
          secret(),
          "device-token",
          `${data.user.id}\0${p.deviceToken}`,
        ),
        request_ip: ip(request),
        user_agent: request.headers.get("user-agent"),
        expires_at: new Date(Date.now() + OTP_TTL).toISOString(),
        metadata: { remember_device: p.remember },
      })
      .select("id")
      .single();
    if (ce || !challenge) throw ce ?? new Error("challenge failed");
    const mail = verificationCodeEmail({ code, purpose: "login_device" });
    try {
      await deliverTransactionalEmail({
        to: p.email,
        ...mail,
        idempotencyKey: `login-device:${challenge.id}:1`,
        eventType: "auth.login_device.code_sent",
        templateKey: "verification_code",
        userId: data.user.id,
        subjectType: "email_challenge",
        subjectId: challenge.id,
        payload: { purpose: "login_device", send_count: 1 },
      });
    } catch (mailError) {
      // Do not leave an unusable OTP challenge behind when the provider rejects
      // the sender or is temporarily unavailable. The user can retry cleanly
      // after the email integration is repaired.
      await authDb.from("email_challenges").delete().eq("id", challenge.id);
      throw mailError;
    }
    return json(
      { success: true, requiresOtp: true, challengeId: challenge.id, resendAfterSeconds: 60 },
      202,
    );
  } catch (e) {
    logServerError("[auth/login/start]", e);
    if (e instanceof ResendDeliveryError && [401, 403].includes(e.status ?? 0)) {
      return json(
        {
          error:
            "O serviço de verificação está temporariamente indisponível. Tente novamente em instantes.",
        },
        503,
        { "Retry-After": "60" },
      );
    }
    if (e instanceof ResendDeliveryError && (e.status === 429 || (e.status ?? 0) >= 500)) {
      return json(
        { error: "O serviço de verificação está ocupado. Tente novamente em instantes." },
        503,
        { "Retry-After": "60" },
      );
    }
    return json({ error: "Não foi possível entrar" }, 500);
  }
}
export async function verifyLogin(request: Request, payload: unknown) {
  if (!mutationOriginAllowed(request)) return json({ error: "Origem não permitida" }, 403);
  if (!payload || typeof payload !== "object") return json({ error: "Dados inválidos" }, 400);
  const v = payload as LoginPayload,
    p = parse(v),
    challengeId = typeof v.challengeId === "string" ? v.challengeId.trim() : "",
    code = typeof v.code === "string" ? v.code.replace(/\D/g, "") : "";
  if (!p || !challengeId || !/^\d{6}$/.test(code)) return json({ error: "Dados inválidos" }, 400);
  try {
    const client = authClient(),
      { authDb } = await db();
    const { data: c, error } = await authDb
      .from("email_challenges")
      .select("*")
      .eq("id", challengeId)
      .eq("purpose", "login_device")
      .maybeSingle();
    if (error) throw error;
    if (!c || !c.user_id || c.consumed_at || new Date(c.expires_at).getTime() <= Date.now())
      return json({ error: "Código inválido ou expirado" }, 400);
    const expected = hashAuthValue(secret(), "login-device-code", `${c.user_id}\0${code}`);
    const { data: claimed, error: claimError } = await authDb.rpc("claim_email_challenge", {
      p_challenge_id: c.id,
      p_code_hash: expected,
    });
    if (claimError) throw claimError;
    if (!claimed) return json({ error: "Código inválido ou expirado" }, 400);
    const { data, error: loginError } = await client.auth.signInWithPassword({
      email: p.email,
      password: p.password,
    });
    if (loginError || !data.user || !data.session || data.user.id !== c.user_id)
      return json({ error: "Credenciais inválidas" }, 401);
    if (await isGloballySuspended(authDb, data.user.id))
      return json({ error: "Acesso suspenso pela administração" }, 403);
    const device = await findOrCreateDevice(authDb, data.user.id, p.deviceToken, request);
    const now = new Date().toISOString(),
      trustedUntil = p.remember ? new Date(Date.now() + TRUST_DAYS).toISOString() : null;
    const { error: trustError } = await authDb
      .from("user_devices")
      .update({
        trusted_until: trustedUntil,
        revoked_at: null,
        revoke_reason: null,
        last_seen_at: now,
      })
      .eq("id", device.id)
      .eq("user_id", data.user.id);
    if (trustError) throw trustError;
    const appSessionId = await createAppSession(authDb, {
      userId: data.user.id,
      deviceId: device.id,
      accessToken: data.session.access_token,
      remember: p.remember,
      request,
    });
    await Promise.all([
      authDb.from("email_challenges").update({ consumed_at: now }).eq("id", c.id),
      authDb.from("security_events").insert({
        user_id: data.user.id,
        session_id: appSessionId,
        device_id: device.id,
        event_type: "login.device_verified",
        severity: "info",
        ip: ip(request),
        user_agent: request.headers.get("user-agent"),
        metadata: { remember_device: p.remember },
      }),
    ]);
    return json({ success: true, requiresOtp: false, ...tokens(data.session) });
  } catch (e) {
    logServerError("[auth/login/verify]", e);
    return json({ error: "Não foi possível confirmar o acesso" }, 500);
  }
}

export async function resendLoginCode(request: Request, payload: unknown) {
  if (!mutationOriginAllowed(request)) return json({ error: "Origem não permitida" }, 403);
  if (!payload || typeof payload !== "object") return json({ error: "Dados inválidos" }, 400);
  const v = payload as LoginPayload,
    p = parse(v),
    challengeId = typeof v.challengeId === "string" ? v.challengeId.trim() : "";
  if (!p || !challengeId) return json({ error: "Dados inválidos" }, 400);
  try {
    const client = authClient(),
      { authDb } = await db();
    const { data: login, error: loginError } = await client.auth.signInWithPassword({
      email: p.email,
      password: p.password,
    });
    if (loginError || !login.user) return json({ error: "Credenciais inválidas" }, 401);
    const { data: c, error } = await authDb
      .from("email_challenges")
      .select("*")
      .eq("id", challengeId)
      .eq("purpose", "login_device")
      .eq("user_id", login.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!c || c.consumed_at) return json({ error: "Desafio inválido" }, 400);
    const expectedDeviceHash = hashAuthValue(
      secret(),
      "device-token",
      `${login.user.id}\0${p.deviceToken}`,
    );
    if (c.device_scope_hash !== expectedDeviceHash) return json({ error: "Desafio inválido" }, 400);
    const now = Date.now(),
      elapsed = now - new Date(c.last_sent_at).getTime();
    if (elapsed < 60_000)
      return json(
        {
          error: "Aguarde antes de reenviar",
          retryAfterSeconds: Math.ceil((60_000 - elapsed) / 1000),
        },
        429,
      );
    if (c.send_count >= 5) return json({ error: "Limite de reenvios atingido" }, 429);
    const code = generateSixDigitCode(),
      count = c.send_count + 1;
    const { error: update } = await authDb
      .from("email_challenges")
      .update({
        code_hash: hashAuthValue(secret(), "login-device-code", `${login.user.id}\0${code}`),
        send_count: count,
        last_sent_at: new Date().toISOString(),
        expires_at: new Date(now + OTP_TTL).toISOString(),
        failed_attempts: 0,
      })
      .eq("id", c.id)
      .is("consumed_at", null);
    if (update) throw update;
    const mail = verificationCodeEmail({ code, purpose: "login_device" });
    await deliverTransactionalEmail({
      to: c.target_email,
      ...mail,
      idempotencyKey: `login-device:${c.id}:${count}`,
      eventType: "auth.login_device.code_resent",
      templateKey: "verification_code",
      userId: login.user.id,
      subjectType: "email_challenge",
      subjectId: c.id,
      payload: { purpose: "login_device", send_count: count },
    });
    return json({ success: true, challengeId: c.id, resendAfterSeconds: 60 });
  } catch (e) {
    logServerError("[auth/login/resend]", e);
    return json({ error: "Não foi possível reenviar o código" }, 500);
  }
}
