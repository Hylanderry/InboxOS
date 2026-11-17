import type { UserAuthContext } from "../auth-context";
import { requireAuth } from "../middleware/auth";
import { eligibleBootstrapIdentity } from "./bootstrap-policy";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Json } from "@/integrations/supabase/types";
import type { LiveAuthDatabase } from "../auth/live-auth-database";
import { logServerError } from "../logging.ts";

export type SystemRole = "superadmin" | "operator" | "support" | "auditor";
export type SystemPermission =
  "read" | "users" | "workspaces" | "members" | "integrations" | "newsletter" | "audit" | "admins";

const grants: Record<SystemRole, ReadonlyArray<SystemPermission>> = {
  superadmin: [
    "read",
    "users",
    "workspaces",
    "members",
    "integrations",
    "newsletter",
    "audit",
    "admins",
  ],
  operator: ["read", "users", "workspaces", "members", "integrations", "newsletter", "audit"],
  support: ["read", "users", "workspaces", "members", "audit"],
  auditor: ["read", "audit"],
};
export interface SystemContext extends UserAuthContext {
  systemRole: SystemRole;
}
export function adminJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
export async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // The generated public schema and the auth/control-plane schema are
  // maintained separately. Keep the client strongly typed for both instead
  // of falling back to an untyped `any` client in administrative handlers.
  return supabaseAdmin as unknown as SupabaseClient<Database & LiveAuthDatabase>;
}
/** No workspace roles or user-editable JWT metadata can confer System Admin. */
export async function requireSystemAdmin(
  request: Request,
  permission: SystemPermission = "read",
): Promise<SystemContext | Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const db = await adminDb();
    const { data: initialRow, error } = await db
      .from("system_admins")
      .select("role,status")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) throw error;
    let row = initialRow;
    // The session email alone is not proof of ownership. Query the verified
    // Auth record on the server before allowing the first System Admin claim.
    if (!row && process.env["SYSTEM_ADMIN_BOOTSTRAP_EMAILS"]?.trim()) {
      const { data: identity, error: identityError } = await db.auth.admin.getUserById(
        auth.user.id,
      );
      if (identityError) throw identityError;
      if (
        eligibleBootstrapIdentity(
          auth.user.id,
          identity?.user,
          process.env["SYSTEM_ADMIN_BOOTSTRAP_EMAILS"],
        )
      ) {
        // Atomic database claim is still mandatory even for verified identities.
        const claim = await db.rpc("claim_system_admin_bootstrap", {
          p_user_id: auth.user.id,
        });
        if (claim.error) throw claim.error;
        if (claim.data === true) {
          const reread = await db
            .from("system_admins")
            .select("role,status")
            .eq("user_id", auth.user.id)
            .maybeSingle();
          if (reread.error) throw reread.error;
          row = reread.data;
        }
      }
    }
    if (!row || row.status !== "active" || !(row.role in grants))
      return adminJson({ error: "Forbidden: System Admin necessário" }, 403);
    const role = row.role as SystemRole;
    if (!grants[role].includes(permission))
      return adminJson({ error: "Forbidden: permissão administrativa insuficiente" }, 403);
    return { ...auth, systemRole: role };
  } catch (error) {
    logServerError("[admin] authorization error", error);
    return adminJson({ error: "Falha na autorização administrativa" }, 503);
  }
}
export async function auditAction(
  actor: SystemContext,
  request: Request,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
  workspaceId: string | null = null,
) {
  const db = await adminDb();
  const ip =
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("cf-connecting-ip") ||
    null;
  const { error } = await db.from("system_admin_audit_log").insert({
    actor_user_id: actor.user.id,
    actor_role: actor.systemRole,
    action,
    target_type: targetType,
    target_id: targetId,
    workspace_id: workspaceId,
    metadata: metadata as Json,
    request_ip: ip,
    user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (error) throw error;
}
