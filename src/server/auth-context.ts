import type { WorkspaceRole as SharedWorkspaceRole } from "../lib/workspace-roles.ts";

export type WorkspaceRole = SharedWorkspaceRole;
export type Permission =
  | "workspace.read"
  | "workspace.manage"
  | "members.read"
  | "members.manage"
  | "instances.read"
  | "instances.manage"
  | "messages.read"
  | "messages.send"
  | "contacts.read"
  | "crm.read"
  | "crm.manage"
  | "agents.manage"
  | "billing.read"
  | "billing.manage";
export type PermissionOverrides = Partial<Record<Permission, boolean>>;
export const ALL_WORKSPACE_PERMISSIONS: readonly Permission[] = [
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
];
export interface UserAuthContext {
  user: { id: string; email?: string };
  session: { id: string | null; deviceId: string | null };
}
export interface WorkspaceContext extends UserAuthContext {
  workspace: { id: string; role: WorkspaceRole; permissions: PermissionOverrides };
}
export interface InstanceContext {
  workspaceId: string;
  instanceId: string;
  instanceName: string;
}
