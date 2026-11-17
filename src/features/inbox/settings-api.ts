import { apiFetch } from "@/lib/api-fetch";

export type WorkspaceRole = "owner" | "admin" | "manager" | "support" | "analyst" | "agent";
export type InviteWorkspaceRole = Exclude<WorkspaceRole, "owner">;
export type WorkspacePermission =
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
export type WorkspacePermissionOverrides = Partial<Record<WorkspacePermission, boolean>>;

export interface ProfileDto {
  user_id: string;
  account_kind: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone_e164: string | null;
  country_code: string | null;
  avatar_path: string | null;
}

export interface CompanyDto {
  workspace_id: string;
  legal_name: string;
  trade_name: string | null;
  tax_id: string;
  tax_id_normalized: string;
  tax_status: string;
  phone_e164: string | null;
  country_code: string | null;
  logo_path: string | null;
  brand_name: string | null;
  logo_light_path: string | null;
  logo_dark_path: string | null;
  favicon_path: string | null;
  support_email: string | null;
  sender_name: string | null;
  accent_token: "neutral" | "teal" | "indigo" | "amber";
  white_label_enabled: boolean;
  custom_domain: string | null;
  custom_domain_status: "not_configured" | "pending" | "verified" | "rejected";
}

export type WorkspaceBrandingDto = Pick<
  CompanyDto,
  | "workspace_id"
  | "brand_name"
  | "trade_name"
  | "logo_path"
  | "logo_light_path"
  | "logo_dark_path"
  | "favicon_path"
  | "support_email"
  | "sender_name"
  | "accent_token"
  | "white_label_enabled"
  | "custom_domain"
  | "custom_domain_status"
>;

export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string;
  kind: string;
  created_at: string;
  role: WorkspaceRole;
}

export interface MemberDto {
  id: string;
  user_id: string;
  role: WorkspaceRole;
  permissions: WorkspacePermissionOverrides;
  status: "active" | "suspended";
  created_at: string;
  updated_at: string;
  profile: {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    avatar_path: string | null;
  } | null;
}

export interface InvitationDto {
  id: string;
  email: string;
  role: WorkspaceRole;
  permissions: WorkspacePermissionOverrides;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export interface DeviceDto {
  id: string;
  display_name: string | null;
  device_family: string | null;
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  os_version: string | null;
  first_seen_at: string;
  last_seen_at: string;
  trusted_until: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export interface SessionDto {
  id: string;
  device_id: string | null;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  last_ip: string | null;
  user_agent: string | null;
  last_workspace_id: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export interface LegalDocumentStatusDto {
  id: string;
  slug: string;
  version: string;
  title: string;
  required: boolean;
  active: boolean;
  published_at: string;
  acceptedAt: string | null;
}

async function read<T>(responseTarget: Promise<Response> | Response): Promise<T> {
  const response = await responseTarget;
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Falha HTTP ${response.status}`);
  return body;
}

export async function loadProfile() {
  return read<{ profile: ProfileDto | null }>(
    await apiFetch("/api/profile/", {}, { workspace: false }),
  );
}

export async function saveProfile(payload: Record<string, unknown>) {
  return read<{ profile: ProfileDto }>(
    await apiFetch(
      "/api/profile/",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      { workspace: false },
    ),
  );
}

export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.set("file", file);
  return read<{ path: string }>(
    await apiFetch("/api/profile/avatar", { method: "POST", body: form }, { workspace: false }),
  );
}

export async function loadCompany() {
  return read<{ company: CompanyDto | null }>(await apiFetch("/api/company/"));
}

export async function loadWorkspaceBranding() {
  return read<{ branding: WorkspaceBrandingDto | null }>(
    await apiFetch("/api/workspaces/branding"),
  );
}

export async function saveCompany(payload: Record<string, unknown>) {
  return read<{ company: CompanyDto }>(
    await apiFetch("/api/company/", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function uploadCompanyLogo(file: File) {
  const form = new FormData();
  form.set("file", file);
  return read<{ path: string }>(
    await apiFetch("/api/company/logo", { method: "POST", body: form }),
  );
}

export async function loadWorkspaces() {
  return read<{ workspaces: WorkspaceDto[]; activeWorkspaceId: string | null }>(
    await apiFetch("/api/workspaces/", {}, { workspace: false }),
  );
}

export async function createWorkspace(name: string) {
  return read<{ workspace: WorkspaceDto }>(
    await apiFetch(
      "/api/workspaces/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      },
      { workspace: false },
    ),
  );
}

export async function activateWorkspace() {
  return read<{ success: boolean; workspaceId: string }>(
    await apiFetch("/api/workspaces/activate", { method: "POST" }),
  );
}

export async function loadMembers() {
  return read<{ members: MemberDto[] }>(await apiFetch("/api/workspaces/members/"));
}

export async function mutateMember(payload: Record<string, unknown>) {
  return read<{ success: boolean }>(
    await apiFetch("/api/workspaces/members/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function loadInvitations() {
  return read<{ invitations: InvitationDto[] }>(await apiFetch("/api/workspaces/invitations/"));
}

export async function inviteMember(
  email: string,
  role: InviteWorkspaceRole,
  permissions: WorkspacePermissionOverrides = {},
) {
  return read<{ success: boolean; invitationId: string }>(
    await apiFetch("/api/workspaces/invitations/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role, permissions }),
    }),
  );
}

export async function revokeInvitation(invitationId: string) {
  return read<{ success: boolean }>(
    await apiFetch("/api/workspaces/invitations/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId }),
    }),
  );
}

export async function loadSecuritySessions() {
  return read<{
    currentSessionId: string | null;
    currentDeviceId: string | null;
    devices: DeviceDto[];
    sessions: SessionDto[];
  }>(await apiFetch("/api/auth/security/", {}, { workspace: false }));
}

export async function securityAction(action: string, targetId?: string) {
  return read<{ success: boolean }>(
    await apiFetch(
      "/api/auth/security/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetId }),
      },
      { workspace: false },
    ),
  );
}

export async function loadLegalStatus() {
  return read<{ documents: LegalDocumentStatusDto[] }>(await apiFetch("/api/legal/status"));
}

export async function authPost<T>(path: string, payload?: unknown) {
  const init: RequestInit = { method: "POST" };
  if (payload !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(payload);
  }
  return read<T>(await apiFetch(path, init, { workspace: false }));
}

export async function publicAuthPost<T>(path: string, payload?: unknown) {
  const init: RequestInit = { method: "POST" };
  if (payload !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(payload);
  }
  return read<T>(await fetch(path, init));
}
