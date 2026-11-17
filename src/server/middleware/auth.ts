import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  InstanceContext,
  Permission,
  UserAuthContext,
  WorkspaceContext,
  WorkspaceRole,
} from "../auth-context";
import {
  extractBearerToken,
  isWorkspaceRole,
  normalizePermissionOverrides,
  requestedWorkspaceId,
  roleHasPermission,
  roleRank,
} from "./auth-policy";
import { mutationOriginAllowed } from "./access-auth";
import { appSessionTokenHash, parseSupabaseSessionClaims } from "../auth/session-token";
import type { LiveAuthDatabase } from "../auth/live-auth-database";
import { hashAuthValue } from "../auth/auth-crypto";
import { logServerError, logServerWarning } from "../logging.ts";
export interface AuthenticatedUser {
  id: string;
  email?: string;
  workspaceId: string;
  role: WorkspaceRole;
}
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function authClient() {
  const u = process.env["SUPABASE_URL"],
    k = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!u || !k) throw new Error("Supabase server auth environment variables missing");
  return createClient<Database>(u, k, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function requireAuth(request: Request): Promise<UserAuthContext | Response> {
  if (!mutationOriginAllowed(request))
    return json({ error: "Forbidden: origem da mutação não permitida" }, 403);
  const token = extractBearerToken(request);
  if (!token) return json({ error: "Unauthorized: autenticação necessária" }, 401);
  try {
    const s = authClient();
    const {
      data: { user },
      error,
    } = await s.auth.getUser(token);
    if (error || !user) return json({ error: "Unauthorized: sessão inválida ou expirada" }, 401);
    const claims = parseSupabaseSessionClaims(token);
    if (!claims) return json({ error: "Unauthorized: sessão inválida" }, 401);
    const secret = process.env["AUTH_CRYPTO_SECRET"]?.trim();
    if (!secret || secret.length < 32) throw new Error("AUTH_CRYPTO_SECRET missing");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase>;
    const { data: appSession, error: sessionError } = await db
      .from("user_sessions")
      .select("id,device_id,expires_at,revoked_at,last_seen_at")
      .eq("user_id", user.id)
      .eq("token_hash", appSessionTokenHash(secret, claims.sessionId))
      .is("revoked_at", null)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!appSession || new Date(appSession.expires_at).getTime() <= Date.now())
      return json({ error: "Unauthorized: sessão revogada ou expirada" }, 401);
    const { data: control, error: controlError } = await db
      .from("system_user_controls")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (controlError) throw controlError;
    if (control?.status === "suspended")
      return json({ error: "Forbidden: usuário suspenso pela administração" }, 403);
    if (
      !appSession.last_seen_at ||
      !Number.isFinite(Date.parse(appSession.last_seen_at)) ||
      Date.now() - Date.parse(appSession.last_seen_at) > 300_000
    ) {
      const sessionActivity = await db
        .from("user_sessions")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", appSession.id);
      if (sessionActivity.error) logServerWarning("[auth] session activity update failed");
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
      // Rate limiting must not depend on caller-controlled proxy headers.
      const scope = hashAuthValue(secret, "api-mutation", user.id);
      const { data: limited, error: limitError } = await db.rpc("consume_auth_rate_limit", {
        p_action: "api-mutation",
        p_scope_hash: scope,
        p_limit: 300,
        p_window_seconds: 60,
        p_block_seconds: 60,
      });
      if (limitError || (limited?.[0]?.allowed !== true && limited?.[0]?.allowed !== false)) {
        logServerError("[auth] mutation rate limit unavailable", limitError);
        return json({ error: "Limitador indisponível; tente novamente" }, 503);
      } else if (limited[0].allowed === false)
        return json(
          {
            error: "Muitas requisições",
            retryAfterSeconds: Number(limited[0].retry_after_seconds ?? 60),
          },
          429,
        );
    }
    return {
      user: user.email ? { id: user.id, email: user.email } : { id: user.id },
      session: { id: appSession.id, deviceId: appSession.device_id },
    };
  } catch {
    return json({ error: "Internal Server Error durante autenticação" }, 500);
  }
}
export async function requireWorkspace(
  request: Request,
  requiredRole?: WorkspaceRole,
): Promise<WorkspaceContext | Response> {
  const a = await requireAuth(request);
  if (a instanceof Response) return a;
  const wid = requestedWorkspaceId(request);
  if (!wid) return json({ error: "Bad Request: workspace explícito é obrigatório" }, 400);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m, error } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, role, status, permissions")
      .eq("user_id", a.user.id)
      .eq("workspace_id", wid)
      .eq("status", "active")
      .maybeSingle();
    if (error) return json({ error: "Internal Server Error durante autorização" }, 500);
    if (!m) return json({ error: "Forbidden: acesso ao workspace negado" }, 403);
    const db = supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase>;
    const { data: space, error: spaceError } = await db
      .from("workspaces")
      .select("status")
      .eq("id", wid)
      .maybeSingle();
    if (spaceError) return json({ error: "Internal Server Error durante autorização" }, 500);
    if (!space || space.status !== "active")
      return json({ error: "Forbidden: workspace inativo" }, 403);
    if (!isWorkspaceRole(m.role))
      return json({ error: "Forbidden: papel de workspace inválido" }, 403);
    const role = m.role;
    if (requiredRole && roleRank[role] < roleRank[requiredRole])
      return json({ error: "Forbidden: papel insuficiente" }, 403);
    return {
      ...a,
      workspace: {
        id: m.workspace_id,
        role,
        permissions: normalizePermissionOverrides(m.permissions),
      },
    };
  } catch {
    return json({ error: "Internal Server Error durante autorização" }, 500);
  }
}
export async function requirePermission(request: Request, p: Permission) {
  const c = await requireWorkspace(request);
  if (c instanceof Response) return c;
  return roleHasPermission(c.workspace.role, p, c.workspace.permissions)
    ? c
    : json({ error: "Forbidden: permissão insuficiente" }, 403);
}
export async function resolveInstanceContext(
  c: WorkspaceContext,
  r: { instanceId?: string | null; instanceName?: string | null },
): Promise<InstanceContext | Response> {
  const id = r.instanceId?.trim() || null,
    n = r.instanceName?.trim() || null;
  if (!id && !n) return json({ error: "Bad Request: instância explícita é obrigatória" }, 400);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("whatsapp_instances")
    .select("id, workspace_id, instance_name")
    .eq("workspace_id", c.workspace.id);
  if (id) q = q.eq("id", id);
  if (n) q = q.eq("instance_name", n);
  const { data, error } = await q.maybeSingle();
  if (error) return json({ error: "Internal Server Error ao resolver instância" }, 500);
  if (!data) return json({ error: "Not Found: instância não encontrada" }, 404);
  return { workspaceId: c.workspace.id, instanceId: data.id, instanceName: data.instance_name };
}
export async function requireApiUser(
  request: Request,
  requiredRole?: WorkspaceRole,
): Promise<AuthenticatedUser | Response> {
  const c = await requireWorkspace(request, requiredRole);
  if (c instanceof Response) return c;
  return {
    id: c.user.id,
    ...(c.user.email ? { email: c.user.email } : {}),
    workspaceId: c.workspace.id,
    role: c.workspace.role,
  };
}

/**
 * Authenticates an API request and enforces the effective workspace
 * permission, including any member-level revocations.  Keep this separate
 * from requireApiUser so read-only endpoints can remain explicit about the
 * capability they require instead of silently inheriting a role.
 */
export async function requireApiPermission(
  request: Request,
  permission: Permission,
  requiredRole?: WorkspaceRole,
): Promise<AuthenticatedUser | Response> {
  const c = await requireWorkspace(request, requiredRole);
  if (c instanceof Response) return c;
  if (!roleHasPermission(c.workspace.role, permission, c.workspace.permissions))
    return json({ error: "Forbidden: permissão insuficiente" }, 403);
  return {
    id: c.user.id,
    ...(c.user.email ? { email: c.user.email } : {}),
    workspaceId: c.workspace.id,
    role: c.workspace.role,
  };
}
