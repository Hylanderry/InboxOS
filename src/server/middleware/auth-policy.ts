import {
  ALL_WORKSPACE_PERMISSIONS,
  type Permission,
  type PermissionOverrides,
  type WorkspaceRole,
} from "../auth-context.ts";
import {
  WORKSPACE_ROLE_RANK,
  canManageWorkspaceRole,
  isWorkspaceRole,
} from "../../lib/workspace-roles.ts";
export { ALL_WORKSPACE_PERMISSIONS } from "../auth-context.ts";
export { WORKSPACE_ROLE_RANK as roleRank, canManageWorkspaceRole, isWorkspaceRole };
const P: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  agent: new Set([
    "workspace.read",
    "instances.read",
    "messages.read",
    "messages.send",
    "contacts.read",
    "crm.read",
  ]),
  admin: new Set([
    "workspace.read",
    "workspace.manage",
    "members.read",
    "members.manage",
    "instances.read",
    "instances.manage",
    "messages.read",
    "messages.send",
    "contacts.read",
    "crm.read",
    "crm.manage",
    "agents.manage",
    "billing.read",
  ]),
  manager: new Set([
    "workspace.read",
    "members.read",
    "members.manage",
    "instances.read",
    "instances.manage",
    "messages.read",
    "messages.send",
    "contacts.read",
    "crm.read",
    "crm.manage",
    "agents.manage",
    "billing.read",
  ]),
  support: new Set([
    "workspace.read",
    "instances.read",
    "messages.read",
    "messages.send",
    "contacts.read",
    "crm.read",
    "crm.manage",
  ]),
  analyst: new Set([
    "workspace.read",
    "instances.read",
    "messages.read",
    "contacts.read",
    "crm.read",
    "billing.read",
  ]),
  owner: new Set([
    "workspace.read",
    "workspace.manage",
    "members.read",
    "members.manage",
    "instances.read",
    "instances.manage",
    "messages.read",
    "messages.send",
    "contacts.read",
    "crm.read",
    "crm.manage",
    "agents.manage",
    "billing.read",
    "billing.manage",
  ]),
};
export function normalizePermissionOverrides(value: unknown): PermissionOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: PermissionOverrides = {};
  for (const permission of ALL_WORKSPACE_PERMISSIONS) {
    if (typeof source[permission] === "boolean") result[permission] = source[permission];
  }
  return result;
}

export function roleHasPermission(
  r: WorkspaceRole,
  p: Permission,
  overrides: PermissionOverrides = {},
) {
  if (!P[r].has(p)) return false;
  // Owners retain the complete control plane. Non-owner overrides can only
  // remove capabilities from their role profile, never grant escalation.
  return r === "owner" || overrides[p] !== false;
}
export function extractBearerToken(req: Request) {
  const h = req.headers.get("authorization");
  const m = h && /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}
export function requestedWorkspaceId(req: Request) {
  return req.headers.get("x-workspace-id")?.trim() || null;
}
export function isTrustedLocalRequest(url: URL) {
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}
