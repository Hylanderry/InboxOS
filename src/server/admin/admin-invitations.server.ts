import { z } from "zod";
import { generateOpaqueToken, hashAuthValue } from "../auth/auth-crypto";
import { deliverTransactionalEmail } from "../email/delivery.server";
import { workspaceInviteEmail } from "../email/templates";
import { trustedAppOrigin } from "../security/trusted-app-origin";
import { adminDb, adminJson, auditAction, requireSystemAdmin } from "./admin-auth.server";
import { logServerError } from "../logging.ts";
import {
  ALL_WORKSPACE_PERMISSIONS,
  normalizePermissionOverrides,
  roleHasPermission,
} from "../middleware/auth-policy";
import { WORKSPACE_ROLE_LABELS } from "@/lib/workspace-roles";

const uuid = z.string().uuid();
const secret = () => {
  const v = process.env["AUTH_CRYPTO_SECRET"]?.trim() ?? "";
  if (v.length < 32) throw Error("AUTH_CRYPTO_SECRET missing");
  return v;
};
export async function listSystemInvites(request: Request) {
  const actor = await requireSystemAdmin(request, "members");
  if (actor instanceof Response) return actor;
  const id = uuid.safeParse(new URL(request.url).searchParams.get("workspaceId"));
  if (!id.success) return adminJson({ error: "workspaceId obrigatório" }, 400);
  const db = await adminDb();
  const { data, error } = await db
    .from("workspace_invitations")
    .select("id,email,role,permissions,created_at,accepted_at,revoked_at,expires_at")
    .eq("workspace_id", id.data)
    .order("created_at", { ascending: false })
    .limit(100);
  return error
    ? adminJson({ error: "Falha ao listar convites" }, 500)
    : adminJson({ invitations: data ?? [] });
}
export async function createSystemInvite(request: Request, raw: unknown) {
  const actor = await requireSystemAdmin(request, "members");
  if (actor instanceof Response) return actor;
  const p = z
    .object({
      workspaceId: uuid,
      email: z.string().email(),
      role: z.enum(["agent", "support", "analyst", "manager", "admin"]),
      permissions: z.record(z.string(), z.boolean()).optional(),
    })
    .safeParse(raw);
  if (!p.success) return adminJson({ error: "Convite inválido" }, 400);
  let base: string;
  try {
    base = trustedAppOrigin(process.env);
  } catch {
    return adminJson({ error: "PUBLIC_APP_URL HTTPS não configurada" }, 503);
  }
  const { workspaceId, role } = p.data,
    permissions = normalizePermissionOverrides(p.data.permissions);
  for (const permission of ALL_WORKSPACE_PERMISSIONS) {
    if (permissions[permission] === true && !roleHasPermission(role, permission))
      return adminJson({ error: "Permissão incompatível com o cargo" }, 400);
  }
  const email = p.data.email.trim().toLowerCase(),
    db = await adminDb();
  const { data: space, error: spaceError } = await db
    .from("workspaces")
    .select("name,status")
    .eq("id", workspaceId)
    .maybeSingle();
  if (spaceError) return adminJson({ error: "Falha ao consultar workspace" }, 500);
  if (!space || space.status !== "active")
    return adminJson({ error: "Workspace indisponível" }, 409);
  const { data: branding } = await db
    .from("workspace_company_profiles")
    .select("brand_name,sender_name,support_email")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const { data: existing, error: inviteError } = await db
    .from("workspace_invitations")
    .select("id,expires_at")
    .eq("workspace_id", workspaceId)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (inviteError) return adminJson({ error: "Falha ao validar convite" }, 500);
  if (existing?.length)
    return adminJson({ error: "Já existe convite pendente para este e-mail" }, 409);
  // Registered users should be managed via membership changes, not duplicate invitations.
  const { data: userLookup, error: lookupError } = await db.rpc("lookup_auth_user_by_email", {
    p_email: email,
  });
  if (lookupError) return adminJson({ error: "Não foi possível validar o destinatário" }, 500);
  const match = Array.isArray(userLookup) ? userLookup[0]?.user_id : null;
  if (match) {
    const { data: member } = await db
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", match)
      .maybeSingle();
    if (member) return adminJson({ error: "Usuário já é membro deste workspace" }, 409);
  }
  const token = generateOpaqueToken(),
    { data: invite, error } = await db
      .from("workspace_invitations")
      .insert({
        workspace_id: workspaceId,
        email,
        role,
        permissions,
        token_hash: hashAuthValue(secret(), "workspace-invite", token),
        invited_by: actor.user.id,
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
      .select("id")
      .single();
  if (error || !invite) return adminJson({ error: "Falha ao criar convite" }, 500);
  const url = `${base}/auth/register?invitationId=${encodeURIComponent(invite.id)}&invitationToken=${encodeURIComponent(token)}`;
  const mail = workspaceInviteEmail({
    workspaceName: space.name,
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
      workspaceId,
      userId: actor.user.id,
      senderName: branding?.sender_name ?? branding?.brand_name,
      subjectType: "workspace_invitation",
      subjectId: invite.id,
      payload: { role, permissions },
    });
  } catch (error) {
    await db
      .from("workspace_invitations")
      .delete()
      .eq("id", invite.id)
      .eq("workspace_id", workspaceId);
    logServerError("[admin/invitation] delivery", error);
    return adminJson({ error: "Falha ao enviar convite" }, 502);
  }
  await auditAction(
    actor,
    request,
    "workspace.invitation.create",
    "invitation",
    invite.id,
    { role, permissions },
    workspaceId,
  );
  return adminJson({ success: true, invitationId: invite.id }, 201);
}
export async function revokeSystemInvite(request: Request, raw: unknown) {
  const actor = await requireSystemAdmin(request, "members");
  if (actor instanceof Response) return actor;
  const p = z.object({ workspaceId: uuid, invitationId: uuid }).safeParse(raw);
  if (!p.success) return adminJson({ error: "Dados inválidos" }, 400);
  const db = await adminDb();
  const { data, error } = await db
    .from("workspace_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", p.data.invitationId)
    .eq("workspace_id", p.data.workspaceId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) return adminJson({ error: "Falha ao revogar convite" }, 500);
  if (!data) return adminJson({ error: "Convite não encontrado" }, 404);
  await auditAction(
    actor,
    request,
    "workspace.invitation.revoke",
    "invitation",
    data.id,
    {},
    p.data.workspaceId,
  );
  return adminJson({ success: true });
}
