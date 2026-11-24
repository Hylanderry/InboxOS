import type { SupabaseClient } from "@supabase/supabase-js";
import { mutationOriginAllowed } from "../middleware/access-auth";
import { normalizePermissionOverrides } from "../middleware/auth-policy";
import { logServerError } from "../logging.ts";
import { deliverTransactionalEmail } from "../email/delivery.server";
import { ResendDeliveryError } from "../email/resend.server";
import { verificationCodeEmail } from "../email/templates";
import {
  generateSixDigitCode,
  hashAuthValue,
  passwordHistoryFingerprint,
  secureStringEquals,
} from "./auth-crypto";
import { registrationRateLimitKeys, validateRegistrationPayload } from "./registration-policy";
import { extractTurnstileToken, verifyTurnstileToken } from "./turnstile.server";
import type { LiveAuthDatabase } from "./live-auth-database";
const OTP = 600000,
  PENDING = 86400000,
  COOLDOWN = 60000,
  BLOCK = 7200000,
  MAX = 5;
function json(body: unknown, status = 200, headers?: HeadersInit) {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: h });
}
function secret() {
  const s = process.env["AUTH_CRYPTO_SECRET"]?.trim();
  if (!s || s.length < 32) throw new Error("AUTH_CRYPTO_SECRET missing");
  return s;
}
function ip(r: Request) {
  return (
    r.headers.get("x-nf-client-connection-ip") ??
    r.headers.get("cf-connecting-ip") ??
    r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}
function device(r: Request) {
  const d = r.headers.get("x-device-token")?.trim();
  return d && d.length <= 256 ? d : null;
}
async function clients() {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server");
  return { admin: supabaseAdmin, db: supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase> };
}
async function cleanupRegistrationArtifacts(
  db: SupabaseClient<LiveAuthDatabase>,
  admin: Awaited<ReturnType<typeof clients>>["admin"],
  input: { authUserId: string; pendingId?: string | null; challengeId?: string | null },
) {
  // Registration is all-or-nothing: a provider failure must not leave an unusable
  // Auth user or stale OTP rows that prevent a clean retry.
  await Promise.allSettled([
    input.challengeId
      ? db.from("email_challenges").delete().eq("id", input.challengeId)
      : Promise.resolve(),
    input.pendingId
      ? db.from("pending_registrations").delete().eq("id", input.pendingId)
      : Promise.resolve(),
    admin.auth.admin.deleteUser(input.authUserId),
  ]);
}
async function legal(db: SupabaseClient<LiveAuthDatabase>, workspaceId?: string | null) {
  const { data, error } = await db
    .from("legal_documents")
    .select("id,workspace_id,slug,version,required,active,published_at")
    .eq("active", true)
    .eq("required", true);
  if (error) throw error;
  const selected = new Map<string, NonNullable<typeof data>[number]>();
  for (const document of data ?? []) {
    if (document.workspace_id !== null && document.workspace_id !== workspaceId) continue;
    const current = selected.get(document.slug);
    if (
      !current ||
      (workspaceId && document.workspace_id === workspaceId && current.workspace_id === null) ||
      (document.published_at > current.published_at &&
        document.workspace_id === current.workspace_id)
    ) {
      selected.set(document.slug, document);
    }
  }
  const terms = selected.get("terms-of-use"),
    privacy = selected.get("privacy-policy");
  if (!terms || !privacy) throw new Error("Required legal docs missing");
  return { terms, privacy, ids: [...selected.values()].map((d) => d.id) };
}
async function rate(
  db: SupabaseClient<LiveAuthDatabase>,
  action: string,
  scope: string,
  limit = MAX,
) {
  const { data, error } = await db.rpc("consume_auth_rate_limit", {
    p_action: action,
    p_scope_hash: scope,
    p_limit: limit,
    p_window_seconds: 7200,
    p_block_seconds: 7200,
  });
  if (error) throw error;
  return data?.[0] ?? { allowed: false, retry_after_seconds: 7200, attempt_count: limit + 1 };
}
export async function startRegistration(request: Request, payload: unknown) {
  if (!mutationOriginAllowed(request)) return json({ error: "Origem não permitida" }, 403);

  // Cloudflare Turnstile verification (skip if not configured)
  const turnstileToken = extractTurnstileToken(payload);
  const turnstileResult = await verifyTurnstileToken(turnstileToken, ip(request));
  if (!turnstileResult.success) {
    return json({ error: turnstileResult.error || "Verificação de segurança falhou" }, 403);
  }

  const v = validateRegistrationPayload(payload);
  if (!v.ok) return json({ error: "Dados de cadastro inválidos", fields: v.errors }, 400);
  try {
    const s = secret(),
      { admin, db } = await clients();
    const scopes = registrationRateLimitKeys(s, {
      email: v.value.email,
      deviceToken: device(request),
      ip: ip(request),
    });
    const limits = await Promise.all(scopes.map((scope) => rate(db, "register-start", scope)));
    const blocked = limits.find((result) => !result.allowed);
    if (blocked)
      return json(
        { error: "Muitas tentativas", retryAfterSeconds: blocked.retry_after_seconds },
        429,
        { "Retry-After": String(blocked.retry_after_seconds) },
      );
    let validatedInvitationId: string | null = null;
    let validatedWorkspaceId: string | null = null;
    if (v.value.invitationId || v.value.invitationToken) {
      if (!v.value.invitationId || !v.value.invitationToken)
        return json({ error: "Convite inválido" }, 400);
      const { data: invite, error: inviteError } = await db
        .from("workspace_invitations")
        .select("id,workspace_id,email,token_hash,expires_at,accepted_at,revoked_at")
        .eq("id", v.value.invitationId)
        .maybeSingle();
      if (inviteError) throw inviteError;
      if (
        !invite ||
        invite.accepted_at ||
        invite.revoked_at ||
        new Date(invite.expires_at).getTime() <= Date.now() ||
        invite.email.toLowerCase() !== v.value.email ||
        !secureStringEquals(
          invite.token_hash,
          hashAuthValue(s, "workspace-invite", v.value.invitationToken),
        )
      )
        return json({ error: "Convite inválido ou expirado" }, 400);
      validatedInvitationId = invite.id;
      validatedWorkspaceId = invite.workspace_id;
    }
    const l = await legal(db, validatedWorkspaceId);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: v.value.email,
      password: v.value.password,
      email_confirm: false,
      user_metadata: { registration_pending: true },
    });
    if (createError || !created.user)
      return json({ error: "Não foi possível iniciar o cadastro com estes dados" }, 409);
    const ph = passwordHistoryFingerprint(s, created.user.id, v.value.password);
    const { data: pending, error: pe } = await db
      .from("pending_registrations")
      .insert({
        auth_user_id: created.user.id,
        email: v.value.email,
        account_kind: v.value.accountKind,
        first_name: v.value.firstName,
        last_name: v.value.lastName,
        company_name: v.value.companyName,
        tax_country: v.value.taxCountry,
        tax_id_type: v.value.taxIdType,
        tax_id: v.value.taxId,
        tax_id_normalized: v.value.taxIdNormalized,
        phone_e164: v.value.phoneE164,
        country_code: v.value.countryCode,
        initial_password_hash: ph,
        terms_document_id: l.terms.id,
        privacy_document_id: l.privacy.id,
        invitation_id: validatedInvitationId,
        expires_at: new Date(Date.now() + PENDING).toISOString(),
        metadata: { legal_versions: { terms: l.terms.version, privacy: l.privacy.version } },
      })
      .select("id")
      .single();
    if (pe || !pending) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw pe ?? new Error("pending registration failed");
    }
    const code = generateSixDigitCode(),
      codeHash = hashAuthValue(s, "register-code", `${v.value.email}\0${code}`);
    const { data: challenge, error: ce } = await db
      .from("email_challenges")
      .insert({
        user_id: created.user.id,
        pending_registration_id: pending.id,
        purpose: "register",
        target_email: v.value.email,
        target_email_hash: hashAuthValue(s, "email", v.value.email),
        code_hash: codeHash,
        device_scope_hash: device(request) ? hashAuthValue(s, "device", device(request)!) : null,
        request_ip: ip(request),
        user_agent: request.headers.get("user-agent"),
        expires_at: new Date(Date.now() + OTP).toISOString(),
        metadata: { channel: "email" },
      })
      .select("id")
      .single();
    if (ce || !challenge) {
      await cleanupRegistrationArtifacts(db, admin, {
        authUserId: created.user.id,
        pendingId: pending.id,
      });
      throw ce ?? new Error("challenge failed");
    }
    const email = verificationCodeEmail({ code, purpose: "register" });
    try {
      await deliverTransactionalEmail({
        to: v.value.email,
        ...email,
        idempotencyKey: `register:${challenge.id}:1`,
        eventType: "auth.registration.code_sent",
        templateKey: "verification_code",
        userId: created.user.id,
        subjectType: "email_challenge",
        subjectId: challenge.id,
        payload: { purpose: "register", send_count: 1 },
      });
    } catch (mailError) {
      await cleanupRegistrationArtifacts(db, admin, {
        authUserId: created.user.id,
        pendingId: pending.id,
        challengeId: challenge.id,
      });
      throw mailError;
    }
    return json(
      { success: true, challengeId: challenge.id, expiresInSeconds: 600, resendAfterSeconds: 60 },
      202,
    );
  } catch (e) {
    logServerError("[auth/register/start]", e);
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
    return json({ error: "Não foi possível iniciar o cadastro" }, 500);
  }
}
function verifyPayload(x: unknown) {
  if (!x || typeof x !== "object") return null;
  const v = x as { challengeId?: unknown; code?: unknown },
    id = typeof v.challengeId === "string" ? v.challengeId.trim() : "",
    code = typeof v.code === "string" ? v.code.replace(/\D/g, "") : "";
  return /^[0-9a-f-]{36}$/i.test(id) && /^\d{6}$/.test(code) ? { challengeId: id, code } : null;
}
export async function verifyRegistration(request: Request, payload: unknown) {
  if (!mutationOriginAllowed(request)) return json({ error: "Origem não permitida" }, 403);
  const p = verifyPayload(payload);
  if (!p) return json({ error: "Código ou desafio inválido" }, 400);
  try {
    const s = secret(),
      { admin, db } = await clients(),
      lim = await rate(db, "register-verify", hashAuthValue(s, "verify-register", p.challengeId));
    if (!lim.allowed)
      return json({ error: "Muitas tentativas", retryAfterSeconds: lim.retry_after_seconds }, 429);
    const { data: c, error: ce } = await db
      .from("email_challenges")
      .select(
        "id,user_id,pending_registration_id,purpose,target_email,code_hash,failed_attempts,expires_at,blocked_until,verified_at,consumed_at",
      )
      .eq("id", p.challengeId)
      .eq("purpose", "register")
      .maybeSingle();
    if (ce) throw ce;
    if (!c || !c.user_id || !c.pending_registration_id || c.consumed_at)
      return json({ error: "Código inválido ou expirado" }, 400);
    const now = Date.now();
    if (
      new Date(c.expires_at).getTime() <= now ||
      (c.blocked_until && new Date(c.blocked_until).getTime() > now)
    )
      return json({ error: "Código inválido ou expirado" }, 400);
    const h = hashAuthValue(s, "register-code", `${c.target_email}\0${p.code}`);
    let claimed = c.verified_at !== null && secureStringEquals(c.code_hash, h);
    if (!claimed) {
      const { data, error } = await db.rpc("claim_email_challenge", {
        p_challenge_id: c.id,
        p_code_hash: h,
      });
      if (error) throw error;
      claimed = data === true;
    }
    if (!claimed) {
      const n = c.failed_attempts + 1;
      await db
        .from("email_challenges")
        .update({
          failed_attempts: n,
          blocked_until: n >= MAX ? new Date(now + BLOCK).toISOString() : null,
        })
        .eq("id", c.id);
      return json({ error: "Código inválido ou expirado" }, 400);
    }
    const { data: pr, error: pre } = await db
      .from("pending_registrations")
      .select("*")
      .eq("id", c.pending_registration_id)
      .eq("auth_user_id", c.user_id)
      .maybeSingle();
    if (pre) throw pre;
    if (!pr || new Date(pr.expires_at).getTime() <= now)
      return json({ error: "Cadastro expirado" }, 400);
    // Re-resolve the invitation workspace at verification time. The first
    // request is not a trusted source of tenant identity and the invitation
    // may have been revoked or changed while the OTP was pending. Use the
    // same workspace-specific legal catalog used during registration start.
    let invitedWorkspaceId: string | null = null;
    let invitedPermissions: Record<string, boolean> = {};
    if (pr.invitation_id) {
      const { data: invitation, error: invitationError } = await db
        .from("workspace_invitations")
        .select("workspace_id,permissions")
        .eq("id", pr.invitation_id)
        .maybeSingle();
      if (invitationError) throw invitationError;
      invitedWorkspaceId = invitation?.workspace_id ?? null;
      invitedPermissions = normalizePermissionOverrides(invitation?.permissions);
      if (!invitedWorkspaceId) return json({ error: "Convite inválido ou expirado" }, 400);
    }
    const l = await legal(db, invitedWorkspaceId);
    const { error: confirm } = await admin.auth.admin.updateUserById(pr.auth_user_id, {
      email_confirm: true,
      user_metadata: { registration_pending: false },
    });
    if (confirm) throw confirm;
    const { data: workspaceId, error: prov } = await db.rpc("provision_verified_account_v2", {
      p_user_id: pr.auth_user_id,
      p_email: pr.email,
      p_account_kind: pr.account_kind,
      p_first_name: pr.first_name,
      p_last_name: pr.last_name,
      p_phone_e164: pr.phone_e164,
      p_country_code: pr.country_code,
      p_company_name: pr.company_name,
      p_tax_country: pr.tax_country,
      p_tax_id_type: pr.tax_id_type,
      p_tax_id: pr.tax_id,
      p_tax_id_normalized: pr.tax_id_normalized,
      p_invitation_id: pr.invitation_id,
      p_legal_document_ids: l.ids,
      p_accept_ip: ip(request),
      p_user_agent: request.headers.get("user-agent"),
    });
    if (prov || !workspaceId) throw prov ?? new Error("provision failed");

    if (pr.invitation_id && invitedWorkspaceId) {
      const { error: permissionError } = await db
        .from("workspace_members")
        .update({ permissions: invitedPermissions })
        .eq("workspace_id", invitedWorkspaceId)
        .eq("user_id", pr.auth_user_id);
      if (permissionError) throw permissionError;
    }

    // Older production databases briefly had a trigger that granted every
    // signup membership in the legacy default workspace. Remove that stale
    // grant for ordinary registrations while preserving an explicit invite to
    // that workspace. This is intentionally server-side and scoped by user id
    // so a client cannot choose which tenant gets cleaned up.
    const defaultWorkspaceId = "00000000-0000-0000-0000-000000000001";
    if (workspaceId !== defaultWorkspaceId && invitedWorkspaceId !== defaultWorkspaceId) {
      const { error: staleMembershipError } = await db
        .from("workspace_members")
        .delete()
        .eq("user_id", pr.auth_user_id)
        .eq("workspace_id", defaultWorkspaceId);
      if (staleMembershipError) throw staleMembershipError;
    }
    const { data: hist } = await db
      .from("password_history")
      .select("id")
      .eq("user_id", pr.auth_user_id)
      .eq("password_hash", pr.initial_password_hash)
      .limit(1)
      .maybeSingle();
    if (!hist)
      await db
        .from("password_history")
        .insert({ user_id: pr.auth_user_id, password_hash: pr.initial_password_hash });
    const done = new Date().toISOString();
    await Promise.all([
      db.from("pending_registrations").update({ completed_at: done }).eq("id", pr.id),
      db.from("email_challenges").update({ consumed_at: done }).eq("id", c.id),
    ]);
    await db.from("security_events").insert({
      user_id: pr.auth_user_id,
      event_type: "registration.completed",
      severity: "info",
      ip: ip(request),
      user_agent: request.headers.get("user-agent"),
      metadata: { workspace_id: workspaceId },
    });
    return json({ success: true, workspaceId });
  } catch (e) {
    logServerError("[auth/register/verify]", e);
    return json({ error: "Não foi possível concluir o cadastro" }, 500);
  }
}
export async function resendRegistrationCode(request: Request, payload: unknown) {
  if (!mutationOriginAllowed(request)) return json({ error: "Origem não permitida" }, 403);
  const id =
    payload &&
    typeof payload === "object" &&
    typeof (payload as { challengeId?: unknown }).challengeId === "string"
      ? String((payload as { challengeId?: unknown }).challengeId)
      : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Desafio inválido" }, 400);
  try {
    const s = secret(),
      { db } = await clients();
    const { data: c, error } = await db
      .from("email_challenges")
      .select(
        "id,target_email,code_hash,send_count,last_sent_at,expires_at,blocked_until,consumed_at,pending_registration_id",
      )
      .eq("id", id)
      .eq("purpose", "register")
      .maybeSingle();
    if (error) throw error;
    if (!c || c.consumed_at) return json({ error: "Desafio inválido" }, 400);
    const now = Date.now(),
      elapsed = now - new Date(c.last_sent_at).getTime();
    if (elapsed < COOLDOWN)
      return json(
        {
          error: "Aguarde antes de reenviar",
          retryAfterSeconds: Math.ceil((COOLDOWN - elapsed) / 1000),
        },
        429,
      );
    if (c.send_count >= MAX) {
      await db
        .from("email_challenges")
        .update({ blocked_until: new Date(now + BLOCK).toISOString() })
        .eq("id", c.id);
      return json({ error: "Limite de reenvios atingido" }, 429);
    }
    for (const x of registrationRateLimitKeys(s, {
      email: c.target_email,
      deviceToken: device(request),
      ip: ip(request),
    })) {
      const lim = await rate(db, "register-resend", x);
      if (!lim.allowed) return json({ error: "Muitas tentativas de reenvio" }, 429);
    }
    const code = generateSixDigitCode(),
      count = c.send_count + 1;
    await db
      .from("email_challenges")
      .update({
        code_hash: hashAuthValue(s, "register-code", `${c.target_email}\0${code}`),
        send_count: count,
        last_sent_at: new Date().toISOString(),
        expires_at: new Date(now + OTP).toISOString(),
      })
      .eq("id", c.id);
    const mail = verificationCodeEmail({ code, purpose: "register" });
    await deliverTransactionalEmail({
      to: c.target_email,
      ...mail,
      idempotencyKey: `register:${c.id}:${count}`,
      eventType: "auth.registration.code_resent",
      templateKey: "verification_code",
      subjectType: "email_challenge",
      subjectId: c.id,
      payload: { purpose: "register", send_count: count },
    });
    return json({
      success: true,
      challengeId: c.id,
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
    });
  } catch (e) {
    logServerError("[auth/register/resend]", e);
    return json({ error: "Não foi possível reenviar o código" }, 500);
  }
}
