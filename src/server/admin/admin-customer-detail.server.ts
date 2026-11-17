import { z } from "zod";
import { adminDb, adminJson, requireSystemAdmin } from "./admin-auth.server";

export async function adminCustomerDetail(request: Request) {
  const actor = await requireSystemAdmin(request, "users");
  if (actor instanceof Response) return actor;
  const parsed = z.string().uuid().safeParse(new URL(request.url).searchParams.get("userId"));
  if (!parsed.success) return adminJson({ error: "Identificador de usuário inválido" }, 400);
  const userId = parsed.data;
  const db = await adminDb();
  const identity = await db.auth.admin.getUserById(userId);
  if (identity.error || !identity.data.user)
    return adminJson({ error: "Cliente não encontrado" }, 404);

  const [profile, membership] = await Promise.all([
    db
      .from("profiles")
      .select("first_name,last_name,phone_e164,account_kind")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("workspace_members")
      .select("workspace_id,role,status", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  if (profile.error || membership.error)
    return adminJson({ error: "Não foi possível consultar vínculos do cliente" }, 500);
  const memberships = membership.data ?? [];
  const workspaceIds = memberships.map((member) => member.workspace_id);
  const workspaces = workspaceIds.length
    ? await db.from("workspaces").select("id,name,slug,status").in("id", workspaceIds)
    : { data: [], error: null };
  if (workspaces.error) return adminJson({ error: "Não foi possível consultar workspaces" }, 500);
  const counts = await Promise.all(
    workspaceIds.map(async (workspaceId) => {
      const [total, open] = await Promise.all([
        db
          .from("whatsapp_instances")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId),
        db
          .from("whatsapp_instances")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("status", "open"),
      ]);
      if (total.error || open.error) return { workspaceId, error: true as const };
      return { workspaceId, total: total.count ?? 0, open: open.count ?? 0 };
    }),
  );
  if (counts.some((count) => "error" in count))
    return adminJson({ error: "Não foi possível conferir as instâncias" }, 500);
  const workspaceById = new Map(
    (workspaces.data ?? []).map((workspace) => [workspace.id, workspace]),
  );
  const countById = new Map(counts.map((count) => [count.workspaceId, count]));
  const user = identity.data.user;
  return adminJson({
    customer: {
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      emailConfirmedAt: user.email_confirmed_at ?? null,
      profile: profile.data ?? null,
      workspaceCount: membership.count ?? memberships.length,
      workspaceListComplete: (membership.count ?? 0) <= memberships.length,
      workspaces: memberships.map((member) => ({
        id: member.workspace_id,
        name: workspaceById.get(member.workspace_id)?.name ?? "Workspace indisponível",
        slug: workspaceById.get(member.workspace_id)?.slug ?? null,
        status: workspaceById.get(member.workspace_id)?.status ?? "indisponível",
        membershipRole: member.role,
        membershipStatus: member.status,
        instancesTotal: countById.get(member.workspace_id)?.total ?? 0,
        instancesOpen: countById.get(member.workspace_id)?.open ?? 0,
      })),
    },
  });
}
