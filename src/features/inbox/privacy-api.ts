import { apiFetch } from "@/lib/api-fetch";

export type PrivacySettingsDto = {
  workspace_id: string;
  import_history_policy: "none" | "from_connection_time";
  message_retention_days: number;
  media_retention_days: number;
  disconnect_cleanup_policy: "purge" | "retain";
  ai_enabled: boolean;
  pii_redaction_enabled: boolean;
  updated_at: string;
};

export type PrivacyRequestDto = {
  id: string;
  request_type: "export" | "delete" | "correct";
  status: "pending" | "processing" | "manual_review" | "completed" | "rejected" | "failed" | string;
  reason?: string | null;
  result_path?: string | null;
  execute_after?: string;
  result_expires_at?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at?: string;
};

export type ConsentHistoryDto = {
  id: string;
  user_id: string;
  document_id: string;
  accepted_at: string;
  ip?: string | null;
  user_agent?: string | null;
  document?: { id: string; slug: string; version: string; title: string } | null;
};

export type PrivacyAuditDto = {
  id: number;
  action: string;
  target_type: string;
  target_id?: string | null;
  created_at: string;
  metadata?: unknown;
};

async function read<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Falha HTTP ${response.status}`);
  return body;
}

export async function loadPrivacySummary() {
  return read<{
    settings: PrivacySettingsDto;
    requests: PrivacyRequestDto[];
    audit: PrivacyAuditDto[];
  }>(await apiFetch("/api/privacy/summary"));
}

export async function savePrivacySettings(payload: {
  importHistoryPolicy?: PrivacySettingsDto["import_history_policy"];
  messageRetentionDays?: number;
  mediaRetentionDays?: number;
  disconnectCleanupPolicy?: PrivacySettingsDto["disconnect_cleanup_policy"];
  aiEnabled?: boolean;
  piiRedactionEnabled?: boolean;
}) {
  return read<{ settings: PrivacySettingsDto }>(
    await apiFetch("/api/privacy/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function createPrivacyRequest(
  requestType: PrivacyRequestDto["request_type"],
  reason?: string,
) {
  return read<{ request: PrivacyRequestDto }>(
    await apiFetch("/api/privacy/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType, reason }),
    }),
  );
}

export async function requestPrivacyExport(reason?: string) {
  return read<{ request: PrivacyRequestDto }>(
    await apiFetch("/api/privacy/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }),
  );
}

export async function requestPrivacyDeletion(reason?: string) {
  return read<{ request: PrivacyRequestDto }>(
    await apiFetch("/api/privacy/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }),
  );
}

export async function loadWorkspaceAudit(limit = 50) {
  return read<{
    audit: Array<{
      id: number;
      actor_user_id: string | null;
      action: string;
      target_type: string;
      target_id: string | null;
      metadata: unknown;
      created_at: string;
    }>;
  }>(await apiFetch(`/api/workspaces/audit?limit=${encodeURIComponent(String(limit))}`));
}

export async function loadConsentHistory() {
  return read<{ consents: ConsentHistoryDto[] }>(await apiFetch("/api/privacy/consents"));
}

export async function getPrivacyExportDownload(requestId: string) {
  return read<{ url: string; expiresInSeconds: number }>(
    await apiFetch(`/api/privacy/export/${encodeURIComponent(requestId)}`),
  );
}
