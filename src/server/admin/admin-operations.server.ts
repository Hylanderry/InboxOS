import { z } from "zod";
import { adminDb, adminJson, auditAction, requireSystemAdmin } from "./admin-auth.server";

const uuid = z.string().uuid();
const memberRole = z.enum(["owner", "admin", "manager", "support", "analyst", "agent"]);
const memberStatus = z.enum(["active", "suspended"]);
const workspaceStatus = z.enum(["active", "suspended", "archived"]);
const json = adminJson;

export async function adminMe(request: Request) {
  const actor = await requireSystemAdmin(request);
  if (actor instanceof Response) return actor;
  return json({ user: { id: actor.user.id, email: actor.user.email }, role: actor.systemRole });
}
export async function adminOverview(request: Request) {
  const actor = await requireSystemAdmin(request);
  if (actor instanceof Response) return actor;
  const db = await adminDb();
  const [w, i, l, m, e] = await Promise.all([
    db.from("workspaces").select("id", { count: "exact", head: true }),
    db.from("whatsapp_instances").select("id", { count: "exact", head: true }),
    db.from("crm_leads").select("id", { count: "exact", head: true }),
    db
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    db
      .from("evolution_events")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed", "dead_letter"]),
  ]);
  if ([w.error, i.error, l.error, m.error, e.error].some(Boolean))
    return json({ error: "Falha ao carregar visão geral" }, 500);
  return json({
    metrics: {
      workspaces: w.count ?? 0,
      instances: i.count ?? 0,
      crmLeads: l.count ?? 0,
      activeMembers: m.count ?? 0,
      failedEvents: e.count ?? 0,
    },
  });
}
export async function adminUsers(request: Request) {
  const actor = await requireSystemAdmin(request, "users");
  if (actor instanceof Response) return actor;
  const params = new URL(request.url).searchParams;
  const page = Math.min(10000, Math.max(1, Number(params.get("page")) || 1));
  const db = await adminDb();
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 50 });
  if (error) return json({ error: "Falha ao carregar usuários" }, 500);
  const ids = (data.users ?? []).map((u) => u.id);
  const controls = ids.length
    ? await db
        .from("system_user_controls")
        .select("user_id,status,admin_note,suspended_reason")
        .in("user_id", ids)
    : { data: [], error: null };
  if (controls.error) return json({ error: "Falha ao carregar controle de usuários" }, 500);
  return json({
    users: (data.users ?? []).map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      emailConfirmedAt: u.email_confirmed_at,
      control: (controls.data ?? []).find((c) => c.user_id === u.id) ?? { status: "active" },
    })),
    page,
    hasMore: (data.users ?? []).length === 50,
  });
}
export async function adminMutateUser(request: Request, raw: unknown) {
  const actor = await requireSystemAdmin(request, "users");
  if (actor instanceof Response) return actor;
  const parsed = z
    .object({
      userId: uuid,
      status: z.enum(["active", "suspended"]),
      reason: z.string().trim().max(600).nullable().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return json({ error: "Dados inválidos" }, 400);
  const { userId, status, reason } = parsed.data;
  if (userId === actor.user.id)
    return json({ error: "Não é permitido suspender ou alterar a própria conta" }, 403);
  const db = await adminDb();
  const existing = await db.auth.admin.getUserById(userId);
  if (existing.error || !existing.data.user) return json({ error: "Usuário não encontrado" }, 404);
  const { data: globalRole, error: roleError } = await db
    .from("system_admins")
    .select("role,status")
    .eq("user_id", userId)
    .maybeSingle();
  if (roleError) return json({ error: "Falha ao validar System Admin" }, 500);
  if (globalRole?.status === "active" && actor.systemRole !== "superadmin")
    return json({ error: "Somente superadmin pode alterar outro System Admin" }, 403);
  if (
    globalRole?.role === "superadmin" &&
    globalRole.status === "active" &&
    status === "suspended"
  ) {
    const count = await db
      .from("system_admins")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "superadmin")
      .eq("status", "active");
    if (count.error || (count.count ?? 0) <= 1)
      return json({ error: "Não é permitido suspender o último superadmin" }, 409);
  }
  const { error } = await db.from("system_user_controls").upsert(
    {
      user_id: userId,
      status,
      suspended_at: status === "suspended" ? new Date().toISOString() : null,
      suspended_reason: status === "suspended" ? (reason ?? null) : null,
      updated_by: actor.user.id,
    },
    { onConflict: "user_id" },
  );
  if (error)
    return json(
      {
        error:
          error.code === "23514"
            ? "Não é permitido suspender o último superadmin ativo"
            : "Falha ao alterar status",
      },
      error.code === "23514" ? 409 : 500,
    );
  if (status === "suspended") {
    // App tokens are invalidated by requireAuth's control lookup on every request.
    await db
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("revoked_at", null);
  }
  await auditAction(actor, request, "user.status.set", "user", userId, {
    status,
    reason: reason ?? null,
  });
  return json({ success: true, userId, status });
}
export async function adminWorkspaces(request: Request) {
  const actor = await requireSystemAdmin(request, "workspaces");
  if (actor instanceof Response) return actor;
  const db = await adminDb();
  const page = Math.min(
    10000,
    Math.max(1, Number(new URL(request.url).searchParams.get("page")) || 1),
  );
  const { data, error, count } = await db
    .from("workspaces")
    .select("id,name,slug,kind,status,created_at,updated_at,suspended_reason", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * 50, page * 50 - 1);
  if (error) return json({ error: "Falha ao listar workspaces" }, 500);
  return json({ workspaces: data ?? [], count: count ?? 0, page });
}
export async function adminMutateWorkspace(request: Request, raw: unknown) {
  const actor = await requireSystemAdmin(request, "workspaces");
  if (actor instanceof Response) return actor;
  const parsed = z
    .object({
      workspaceId: uuid,
      status: workspaceStatus,
      reason: z.string().trim().max(600).nullable().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return json({ error: "Dados inválidos" }, 400);
  const { workspaceId, status, reason } = parsed.data,
    db = await adminDb();
  const { data, error } = await db
    .from("workspaces")
    .update({
      status,
      suspended_at: status === "active" ? null : new Date().toISOString(),
      suspended_reason: status === "active" ? null : (reason ?? null),
    })
    .eq("id", workspaceId)
    .select("id,status")
    .maybeSingle();
  if (error) return json({ error: "Falha ao atualizar workspace" }, 500);
  if (!data) return json({ error: "Workspace não encontrado" }, 404);
  await auditAction(
    actor,
    request,
    "workspace.status.set",
    "workspace",
    workspaceId,
    { status, reason: reason ?? null },
    workspaceId,
  );
  return json({ workspace: data });
}
export async function adminMembers(request: Request) {
  const actor = await requireSystemAdmin(request, "members");
  if (actor instanceof Response) return actor;
  const id = uuid.safeParse(new URL(request.url).searchParams.get("workspaceId"));
  if (!id.success) return json({ error: "workspaceId obrigatório" }, 400);
  const db = await adminDb();
  const { data, error } = await db
    .from("workspace_members")
    .select("id,user_id,role,status,created_at,updated_at")
    .eq("workspace_id", id.data)
    .limit(200);
  if (error) return json({ error: "Falha ao listar membros" }, 500);
  return json({ members: data ?? [] });
}
export async function adminMutateMember(request: Request, raw: unknown) {
  const actor = await requireSystemAdmin(request, "members");
  if (actor instanceof Response) return actor;
  const parsed = z
    .object({
      workspaceId: uuid,
      userId: uuid,
      role: memberRole.optional(),
      status: memberStatus.optional(),
    })
    .refine((x) => x.role !== undefined || x.status !== undefined)
    .safeParse(raw);
  if (!parsed.success) return json({ error: "Dados inválidos" }, 400);
  const { workspaceId, userId, role, status } = parsed.data,
    db = await adminDb();
  const { data: current, error: ce } = await db
    .from("workspace_members")
    .select("id,role,status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (ce) return json({ error: "Falha na consulta do membro" }, 500);
  if (!current) return json({ error: "Membro não encontrado" }, 404);
  if ((role === "owner" || current.role === "owner") && actor.systemRole !== "superadmin")
    return json({ error: "Somente superadmin pode modificar owner" }, 403);
  if (current.role === "owner" && ((role && role !== "owner") || status === "suspended")) {
    const { count, error } = await db
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("role", "owner")
      .eq("status", "active");
    if (error || (count ?? 0) <= 1)
      return json({ error: "Não é permitido remover o último owner ativo" }, 409);
  }
  const patch: { updated_at: string; role?: string; status?: string } = {
    updated_at: new Date().toISOString(),
  };
  if (role) patch.role = role;
  if (status) patch.status = status;
  const { data, error } = await db
    .from("workspace_members")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select("id,role,status")
    .maybeSingle();
  if (error)
    return json(
      {
        error:
          error.code === "23514"
            ? "Não é permitido remover o último owner ativo"
            : "Falha ao atualizar membro",
      },
      error.code === "23514" ? 409 : 500,
    );
  if (!data) return json({ error: "Membro não encontrado" }, 404);
  await auditAction(
    actor,
    request,
    "workspace.member.update",
    "member",
    userId,
    { role: role ?? null, status: status ?? null },
    workspaceId,
  );
  return json({ member: data });
}
export async function adminAudit(request: Request) {
  const actor = await requireSystemAdmin(request, "audit");
  if (actor instanceof Response) return actor;
  const db = await adminDb();
  const { data, error } = await db
    .from("system_admin_audit_log")
    .select(
      "id,actor_user_id,actor_role,action,target_type,target_id,workspace_id,created_at,metadata",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  return error ? json({ error: "Falha na auditoria" }, 500) : json({ entries: data ?? [] });
}

export async function listSystemAdmins(request: Request) {
  const actor = await requireSystemAdmin(request, "admins");
  if (actor instanceof Response) return actor;
  const db = await adminDb();
  const { data, error } = await db
    .from("system_admins")
    .select("user_id,role,status,created_at,updated_at")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return json({ error: "Falha ao listar administradores" }, 500);
  return json({ admins: data ?? [] });
}
export async function changeSystemAdmin(request: Request, raw: unknown) {
  const actor = await requireSystemAdmin(request, "admins");
  if (actor instanceof Response) return actor;
  const parsed = z
    .object({
      userId: uuid,
      role: z.enum(["superadmin", "operator", "support", "auditor"]),
      status: z.enum(["active", "suspended"]),
    })
    .safeParse(raw);
  if (!parsed.success) return json({ error: "Dados inválidos" }, 400);
  const { userId, role, status } = parsed.data;
  if (userId === actor.user.id && (role !== "superadmin" || status !== "active"))
    return json({ error: "Não é permitido rebaixar/suspender o próprio superadmin" }, 403);
  const db = await adminDb();
  const { data: old, error: oldError } = await db
    .from("system_admins")
    .select("role,status")
    .eq("user_id", userId)
    .maybeSingle();
  if (oldError) return json({ error: "Falha ao validar administrador" }, 500);
  if (
    old?.role === "superadmin" &&
    old.status === "active" &&
    (role !== "superadmin" || status !== "active")
  ) {
    const { count, error } = await db
      .from("system_admins")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "superadmin")
      .eq("status", "active");
    if (error || (count ?? 0) <= 1)
      return json({ error: "Não é permitido remover o último superadmin ativo" }, 409);
  }
  const exists = await db.auth.admin.getUserById(userId);
  if (exists.error || !exists.data.user) return json({ error: "Usuário não encontrado" }, 404);
  if (status === "active" && !exists.data.user.email_confirmed_at)
    return json({ error: "Administrador precisa confirmar o e-mail antes da ativação" }, 422);
  const { error } = await db
    .from("system_admins")
    .upsert(
      { user_id: userId, role, status, ...(old ? {} : { created_by: actor.user.id }) },
      { onConflict: "user_id" },
    );
  if (error)
    return json(
      {
        error:
          error.code === "23514"
            ? "Não é permitido remover o último superadmin ativo"
            : "Falha ao salvar administrador",
      },
      error.code === "23514" ? 409 : 500,
    );
  await auditAction(actor, request, "system_admin.upsert", "system_admin", userId, {
    role,
    status,
  });
  return json({ success: true });
}
