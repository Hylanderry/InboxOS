import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth, requirePermission, requireWorkspace } from "../middleware/auth";
import {
  ALL_WORKSPACE_PERMISSIONS,
  canManageWorkspaceRole,
  isWorkspaceRole,
  normalizePermissionOverrides,
  roleHasPermission,
} from "../middleware/auth-policy";
import type { Permission, WorkspaceRole } from "../auth-context";
import { WORKSPACE_ROLE_LABELS } from "@/lib/workspace-roles";
import { generateOpaqueToken, hashAuthValue, secureStringEquals } from "../auth/auth-crypto";
import type { LiveAuthDatabase } from "../auth/live-auth-database";
import { deliverTransactionalEmail } from "../email/delivery.server";
import { workspaceInviteEmail } from "../email/templates";
import { trustedAppOrigin } from "../security/trusted-app-origin";
type WorkspacePayload = {
  name?: unknown;
  email?: unknown;
  invitationId?: unknown;
  token?: unknown;
  memberId?: unknown;
  action?: unknown;
  role?: unknown;
  permissions?: unknown;
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function secret() {
  const s = process.env["AUTH_CRYPTO_SECRET"]?.trim();
  if (!s || s.length < 32) throw new Error("AUTH_CRYPTO_SECRET missing");
  return s;
}
async function db() {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase>;
}
function slugify(v: string) {
  return (
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 42) || "workspace"
  );
}
export async function listWorkspaces(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const d = await db(),
    [{ data: members, error }, { data: session, error: sessionError }] = await Promise.all([
      d
        .from("workspace_members")
        .select("workspace_id,role,status,permissions")
        .eq("user_id", auth.user.id)
        .eq("status", "active"),
      auth.session.id
        ? d
            .from("user_sessions")
            .select("last_workspace_id")
            .eq("id", auth.session.id)
            .eq("user_id", auth.user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
  if (error || sessionError) return json({ error: "Falha ao listar workspaces" }, 500);
  const visibleMembers = (members ?? []).filter((member) =>
    roleHasPermission(
      member.role as WorkspaceRole,
      "workspace.read",
      normalizePermissionOverrides(member.permissions),
    ),
  );
  const ids = visibleMembers.map((m) => m.workspace_id);
  if (!ids.length) return json({ workspaces: [], activeWorkspaceId: null });
  const { data: spaces, error: we } = await d
    .from("workspaces")
    .select("id,name,slug,kind,created_at,status")
    .in("id", ids)
    .eq("status", "active");
  if (we) return json({ error: "Falha ao listar workspaces" }, 500);
  const workspaces = (spaces ?? []).map((w) => ({
    ...w,
    role: visibleMembers.find((m) => m.workspace_id === w.id)?.role ?? "agent",
  }));
  const activeWorkspaceId = workspaces.some((w) => w.id === session?.last_workspace_id)
    ? (session?.last_workspace_id ?? null)
    : (workspaces[0]?.id ?? null);
  return json({ workspaces, activeWorkspaceId });
}
export async function createWorkspace(request: Request, payload: unknown) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const name =
    payload && typeof payload === "object" && typeof (payload as WorkspacePayload).name === "string"
      ? String((payload as WorkspacePayload).name).trim()
      : "";
  if (name.length < 2 || name.length > 80) return json({ error: "Nome inválido" }, 400);
  const d = await db(),
    slug = `${slugify(name)}-${randomUUID().slice(0, 8)}`,
    { data: space, error } = await d
      .from("workspaces")
      .insert({
        name,
        slug,
        kind: "company",
        created_by: auth.user.id,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
  if (error) return json({ error: "Falha ao criar workspace" }, 500);
  const { error: memberError } = await d.from("workspace_members").insert({
    workspace_id: space.id,
    user_id: auth.user.id,
    role: "owner",
    status: "active",
    updated_at: new Date().toISOString(),
  });
  if (memberError) {
    await d.from("workspaces").delete().eq("id", space.id).eq("created_by", auth.user.id);
    return json({ error: "Falha ao provisionar workspace" }, 500);
  }
  return json({ workspace: space }, 201);
}
export async function activateWorkspace(request: Request) {
  const ctx = await requirePermission(request, "workspace.read");
  if (ctx instanceof Response) return ctx;
  if (!ctx.session.id) return json({ error: "Sessão de aplicação ausente" }, 401);
  const d = await db(),
    { error } = await d
      .from("user_sessions")
      .update({ last_workspace_id: ctx.workspace.id, last_seen_at: new Date().toISOString() })
      .eq("id", ctx.session.id)
      .eq("user_id", ctx.user.id)
      .is("revoked_at", null);
  return error
    ? json({ error: "Falha ao ativar workspace" }, 500)
    : json({ success: true, workspaceId: ctx.workspace.id });
}
export async function listMembers(request: Request) {
  const ctx = await requirePermission(request, "members.read");
  if (ctx instanceof Response) return ctx;
  const d = await db(),
    { data: members, error } = await d
      .from("workspace_members")
      .select("id,user_id,role,permissions,status,created_at,updated_at")
      .eq("workspace_id", ctx.workspace.id);
  if (error) return json({ error: "Falha ao listar membros" }, 500);
  const ids = (members ?? []).map((m) => m.user_id),
    { data: profiles } = ids.length
      ? await d
          .from("profiles")
          .select("user_id,first_name,last_name,email,avatar_path")
          .in("user_id", ids)
      : { data: [] };
  return json({
    members: (members ?? []).map((m) => ({
      ...m,
      profile: profiles?.find((p) => p.user_id === m.user_id) ?? null,
    })),
  });
}
export async function listInvitations(request: Request) {
  const ctx = await requirePermission(request, "members.read");
  if (ctx instanceof Response) return ctx;
  const d = await db(),
    { data, error } = await d
      .from("workspace_invitations")
      .select("id,email,role,permissions,invited_by,created_at,expires_at,accepted_at,revoked_at")
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at", { ascending: false })
      .limit(100);
  return error
    ? json({ error: "Falha ao listar convites" }, 500)
    : json({ invitations: data ?? [] });
}
export async function inviteMember(request: Request, payload: unknown) {
  const ctx = await requirePermission(request, "members.manage");
  if (ctx instanceof Response) return ctx;
  if (!payload || typeof payload !== "object") return json({ error: "Dados inválidos" }, 400);
  const v = payload as WorkspacePayload,
    email = typeof v.email === "string" ? v.email.trim().toLowerCase() : "",
    permissions = normalizePermissionOverrides(v.permissions);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail inválido" }, 400);
  if (!isWorkspaceRole(v.role) || !canManageWorkspaceRole(ctx.workspace.role, v.role))
    return json({ error: "Seu papel não pode convidar para este cargo" }, 403);
  const role = v.role;
  for (const permission of ALL_WORKSPACE_PERMISSIONS) {
    if (permissions[permission] === true && !roleHasPermission(role, permission))
      return json({ error: "Permissão incompatível com o cargo" }, 400);
  }
  let base: string;
  try {
    base = trustedAppOrigin(process.env);
  } catch {
    return json({ error: "Origem pública de convites não configurada" }, 503);
  }
  const d = await db(),
    token = generateOpaqueToken(),
    { data: space } = await d.from("workspaces").select("name").eq("id", ctx.workspace.id).single(),
    { data: branding } = await d
      .from("workspace_company_profiles")
      .select("brand_name,sender_name,support_email")
      .eq("workspace_id", ctx.workspace.id)
      .maybeSingle(),
    { data: invite, error } = await d
      .from("workspace_invitations")
      .insert({
        workspace_id: ctx.workspace.id,
        email,
        role,
        permissions,
        token_hash: hashAuthValue(secret(), "workspace-invite", token),
        invited_by: ctx.user.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
  if (error) return json({ error: "Falha ao criar convite" }, 500);
  const url = `${base}/auth/register?invitationId=${encodeURIComponent(invite.id)}&invitationToken=${encodeURIComponent(token)}`,
    mail = workspaceInviteEmail({
      workspaceName: space?.name ?? "Workspace",
      inviteUrl: url,
      role: WORKSPACE_ROLE_LABELS[role],
      branding: {
        brandName: branding?.brand_name,
        senderName: branding?.sender_name,
        supportEmail: branding?.support_email,
      },
    });
  try {
    await deliverTransactionalEmail({
      to: email,
      ...mail,
      idempotencyKey: `workspace-invite:${invite.id}`,
      eventType: "workspace.invitation.sent",
      templateKey: "workspace_invite",
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      senderName: branding?.sender_name ?? branding?.brand_name,
      subjectType: "workspace_invitation",
      subjectId: invite.id,
      payload: { role, permissions },
    });
  } catch (e) {
    await d
      .from("workspace_invitations")
      .delete()
      .eq("id", invite.id)
      .eq("workspace_id", ctx.workspace.id);
    throw e;
  }
  return json({ success: true, invitationId: invite.id }, 201);
}
export async function acceptInvitation(request: Request, payload: unknown) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!payload || typeof payload !== "object") return json({ error: "Convite inválido" }, 400);
  const v = payload as WorkspacePayload,
    id = typeof v.invitationId === "string" ? v.invitationId : "",
    token = typeof v.token === "string" ? v.token : "";
  if (!id || !token || !auth.user.email) return json({ error: "Convite inválido" }, 400);
  const d = await db(),
    { data: i, error } = await d
      .from("workspace_invitations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
  if (error) return json({ error: "Falha ao validar convite" }, 500);
  if (
    !i ||
    i.accepted_at ||
    i.revoked_at ||
    new Date(i.expires_at).getTime() <= Date.now() ||
    i.email.toLowerCase() !== auth.user.email.toLowerCase() ||
    !secureStringEquals(i.token_hash, hashAuthValue(secret(), "workspace-invite", token))
  )
    return json({ error: "Convite inválido ou expirado" }, 400);
  const now = new Date().toISOString(),
    { data: member, error: me } = await d
      .from("workspace_members")
      .insert({
        workspace_id: i.workspace_id,
        user_id: auth.user.id,
        role: i.role,
        permissions: normalizePermissionOverrides(i.permissions),
        status: "active",
        updated_at: now,
      })
      .select("id")
      .single();
  if (me || !member) return json({ error: "Não foi possível aceitar o convite" }, 409);
  const { data: accepted, error: acceptError } = await d
    .from("workspace_invitations")
    .update({ accepted_at: now })
    .eq("id", i.id)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();
  if (acceptError || !accepted) {
    await d.from("workspace_members").delete().eq("id", member.id).eq("user_id", auth.user.id);
    return json({ error: "Não foi possível concluir o aceite do convite" }, 409);
  }
  return json({ success: true, workspaceId: i.workspace_id });
}
export async function revokeInvitation(request: Request, payload: unknown) {
  const ctx = await requirePermission(request, "members.manage");
  if (ctx instanceof Response) return ctx;
  const id =
    payload &&
    typeof payload === "object" &&
    typeof (payload as WorkspacePayload).invitationId === "string"
      ? String((payload as WorkspacePayload).invitationId)
      : "";
  if (!id) return json({ error: "Convite inválido" }, 400);
  const d = await db(),
    { data, error } = await d
      .from("workspace_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("accepted_at", null)
      .select("id")
      .maybeSingle();
  return error
    ? json({ error: "Falha ao revogar convite" }, 500)
    : data
      ? json({ success: true })
      : json({ error: "Convite não encontrado" }, 404);
}
function permissionsForRole(role: WorkspaceRole, value: unknown) {
  const normalized = normalizePermissionOverrides(value);
  return Object.fromEntries(
    Object.entries(normalized).filter(
      ([permission, override]) =>
        override === false || roleHasPermission(role, permission as Permission),
    ),
  );
}

export async function mutateMember(request: Request, payload: unknown) {
  const ctx = await requirePermission(request, "members.manage");
  if (ctx instanceof Response) return ctx;
  if (!payload || typeof payload !== "object") return json({ error: "Dados inválidos" }, 400);
  const v = payload as WorkspacePayload,
    memberId = typeof v.memberId === "string" ? v.memberId : "",
    action = typeof v.action === "string" ? v.action : "";
  const d = await db(),
    { data: target, error } = await d
      .from("workspace_members")
      .select("*")
      .eq("id", memberId)
      .eq("workspace_id", ctx.workspace.id)
      .maybeSingle();
  if (error) return json({ error: "Falha ao localizar membro" }, 500);
  if (!target) return json({ error: "Membro não encontrado" }, 404);
  if (!isWorkspaceRole(target.role)) return json({ error: "Cargo inválido" }, 400);
  if (target.role === "owner" || target.user_id === ctx.user.id)
    return json({ error: "Owner ou sessão atual não podem ser alterados por esta ação" }, 403);
  if (!canManageWorkspaceRole(ctx.workspace.role, target.role))
    return json({ error: "Seu papel não pode alterar este membro" }, 403);
  const now = new Date().toISOString();
  let mutationError: unknown = null;
  if (action === "set_permissions") {
    const role = target.role;
    const permissions = normalizePermissionOverrides(v.permissions);
    for (const permission of ALL_WORKSPACE_PERMISSIONS) {
      if (permissions[permission] === true && !roleHasPermission(role, permission))
        return json({ error: "Permissão incompatível com o cargo" }, 400);
    }
    const { error: e } = await d
      .from("workspace_members")
      .update({ permissions, updated_at: now })
      .eq("id", target.id)
      .eq("workspace_id", ctx.workspace.id);
    mutationError = e;
    return mutationError
      ? json({ error: "Falha ao atualizar permissões" }, 500)
      : json({ success: true });
  }
  if (action === "set_role") {
    const role = isWorkspaceRole(v.role) ? v.role : null;
    if (!role || !canManageWorkspaceRole(ctx.workspace.role, role))
      return json({ error: "Role inválida" }, 400);
    const { error: e } = await d
      .from("workspace_members")
      .update({ role, permissions: permissionsForRole(role, target.permissions), updated_at: now })
      .eq("id", target.id)
      .eq("workspace_id", ctx.workspace.id);
    mutationError = e;
  } else if (action === "suspend") {
    const { error: e } = await d
      .from("workspace_members")
      .update({ status: "suspended", updated_at: now })
      .eq("id", target.id)
      .eq("workspace_id", ctx.workspace.id);
    mutationError = e;
  } else if (action === "activate") {
    const { error: e } = await d
      .from("workspace_members")
      .update({ status: "active", updated_at: now })
      .eq("id", target.id)
      .eq("workspace_id", ctx.workspace.id);
    mutationError = e;
  } else if (action === "remove") {
    const { error: e } = await d
      .from("workspace_members")
      .delete()
      .eq("id", target.id)
      .eq("workspace_id", ctx.workspace.id);
    mutationError = e;
  } else return json({ error: "Ação inválida" }, 400);
  // Legacy branch retained only for source compatibility; normal set_permissions returns above.
  if (String(action) === "__legacy_set_permissions__") {
    const role = target.role;
    const permissions = normalizePermissionOverrides(v.permissions);
    for (const permission of ALL_WORKSPACE_PERMISSIONS) {
      if (permissions[permission] === true && !roleHasPermission(role, permission))
        return json({ error: "Permissão incompatível com o cargo" }, 400);
    }
    const { error: e } = await d
      .from("workspace_members")
      .update({ permissions, updated_at: now })
      .eq("id", target.id)
      .eq("workspace_id", ctx.workspace.id);
    mutationError = e;
  }
  return mutationError
    ? json({ error: "Falha ao atualizar membro" }, 500)
    : json({ success: true });
}
