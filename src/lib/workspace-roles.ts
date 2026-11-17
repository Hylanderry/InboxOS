/**
 * Canonical workspace roles. This module is deliberately framework-free so
 * that the browser and the server describe the same hierarchy without ever
 * trusting a browser decision for authorization.
 */
export const WORKSPACE_ROLES = [
  "owner",
  "admin",
  "manager",
  "support",
  "analyst",
  "agent",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Proprietário",
  admin: "Administrador do workspace",
  manager: "Gerente",
  support: "Suporte",
  analyst: "Analista",
  agent: "Atendimento",
};

/** A role rank is a management boundary, not a permission grant. */
export const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  agent: 1,
  support: 2,
  analyst: 2,
  manager: 3,
  admin: 4,
  owner: 5,
};

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && (WORKSPACE_ROLES as readonly string[]).includes(value);
}

/**
 * Owners can manage any non-owner. Admins can manage manager and operational
 * roles; managers can manage operational roles. Nobody manages a peer or a
 * more privileged account through the workspace UI/API.
 */
export function canManageWorkspaceRole(actor: WorkspaceRole, target: WorkspaceRole) {
  if (target === "owner") return false;
  if (actor === "owner") return true;
  if (actor !== "admin" && actor !== "manager") return false;
  return WORKSPACE_ROLE_RANK[actor] > WORKSPACE_ROLE_RANK[target];
}
