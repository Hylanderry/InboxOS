/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { redactLogText } from "@/server/logging";

const MAX_REQUESTS_PER_RUN = 12;
const MAX_WORKSPACES_PER_RUN = 40;
const MAX_ROWS_PER_TABLE = 5_000;
const MESSAGE_BATCH_SIZE = 250;
const EXPORT_TTL_DAYS = 7;
const PROCESSING_TIMEOUT_MS = 30 * 60_000;

type AnyClient = any;

type PrivacyRequest = {
  id: string;
  workspace_id: string;
  requested_by: string;
  request_type: "export" | "delete" | "correct";
  status: "pending" | "processing" | "manual_review" | "completed" | "rejected" | "failed";
  reason: string | null;
  result_path: string | null;
  execute_after: string;
  processing_started_at: string | null;
  created_at: string;
};

type PrivacySettings = {
  workspace_id: string;
  message_retention_days: number;
  media_retention_days: number;
};

type ExportTable = { table: string; filter: "id" | "workspace_id"; columns?: string };

const EXPORT_TABLES: ExportTable[] = [
  { table: "workspace_company_profiles", filter: "workspace_id" },
  { table: "workspace_privacy_settings", filter: "workspace_id" },
  { table: "workspace_members", filter: "workspace_id" },
  { table: "workspace_invitations", filter: "workspace_id" },
  { table: "workspace_data_requests", filter: "workspace_id" },
  { table: "workspace_audit_log", filter: "workspace_id" },
  { table: "workspace_knowledge_documents", filter: "workspace_id" },
  { table: "legal_acceptances", filter: "workspace_id" },
  { table: "legal_documents", filter: "workspace_id" },
  { table: "whatsapp_instances", filter: "workspace_id" },
  { table: "chats", filter: "workspace_id" },
  { table: "messages", filter: "workspace_id" },
  { table: "whatsapp_contacts", filter: "workspace_id" },
  { table: "whatsapp_presence", filter: "workspace_id" },
  { table: "contact_identity_aliases", filter: "workspace_id" },
  { table: "group_participants", filter: "workspace_id" },
  { table: "evolution_events", filter: "workspace_id" },
  { table: "outbound_messages", filter: "workspace_id" },
  { table: "handover_requests", filter: "workspace_id" },
  { table: "automation_agents", filter: "workspace_id" },
  { table: "automation_agent_runs", filter: "workspace_id" },
  { table: "crm_stages", filter: "workspace_id" },
  { table: "follow_ups", filter: "workspace_id" },
  { table: "follow_up_tasks", filter: "workspace_id" },
  { table: "crm_tags", filter: "workspace_id" },
  { table: "crm_lead_tags", filter: "workspace_id" },
  { table: "calendar_calendars", filter: "workspace_id" },
  { table: "calendar_appointments", filter: "workspace_id" },
  { table: "crm_leads", filter: "workspace_id" },
  { table: "clients", filter: "workspace_id" },
  { table: "workspace_billing", filter: "workspace_id" },
];

function nowIso() {
  return new Date().toISOString();
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function isoDaysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function safeError(error: unknown) {
  return redactLogText(error instanceof Error ? error.message : "privacy_worker_error");
}

function redactExportValue(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => redactExportValue(item));
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([entryKey, entryValue]) => {
      if (/(password|secret|token|service.?role|api.?key|crypto)/i.test(entryKey)) {
        return [entryKey, "[redacted]"];
      }
      if (entryKey === "media_url" && typeof entryValue === "string") {
        return [entryKey, entryValue.startsWith("/api/media/") ? "[private-media]" : entryValue];
      }
      return [entryKey, redactExportValue(entryValue, key)];
    }),
  );
}

async function queryWorkspaceTable(
  client: AnyClient,
  table: ExportTable,
  workspaceId: string,
): Promise<{ rows: unknown[]; skipped: boolean }> {
  const { data, error } = await client
    .from(table.table)
    .select(table.columns ?? "*")
    .eq(table.filter, workspaceId)
    .limit(MAX_ROWS_PER_TABLE);
  // Optional product tables differ between installations. A missing table or
  // column must not abort an otherwise valid export.
  if (error) return { rows: [], skipped: true };
  return {
    rows: Array.isArray(data) ? data.map((row) => redactExportValue(row)) : [],
    skipped: false,
  };
}

async function audit(
  client: AnyClient,
  workspaceId: string,
  action: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
) {
  await client.from("workspace_audit_log").insert({
    workspace_id: workspaceId,
    actor_user_id: null,
    action,
    target_type: "privacy_worker",
    target_id: targetId,
    metadata: redactExportValue(metadata),
  });
}

function storagePathFromMediaUrl(value: unknown, workspaceId: string): string | null {
  if (typeof value !== "string" || !value) return null;
  let path = value.startsWith("/api/media/") ? value.slice("/api/media/".length) : value;
  const marker = "/storage/v1/object/";
  if (path.includes(marker)) {
    const after = path.split("chat-media/")[1];
    path = after || "";
  }
  if (!path.startsWith(`${workspaceId}/`) || path.includes("..") || path.includes("\\"))
    return null;
  return path;
}

async function removeStoragePaths(client: AnyClient, bucket: string, paths: string[]) {
  const unique = [...new Set(paths)].filter(Boolean);
  for (let start = 0; start < unique.length; start += 100) {
    const { error } = await client.storage.from(bucket).remove(unique.slice(start, start + 100));
    if (error) throw error;
  }
  return unique.length;
}

async function listStoragePaths(
  client: AnyClient,
  bucket: string,
  prefix: string,
  depth = 0,
): Promise<string[]> {
  if (depth > 6) return [];
  const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;
  const paths: string[] = [];
  for (const entry of data ?? []) {
    if (!entry?.name) continue;
    const path = `${prefix}/${entry.name}`;
    if (entry.id) paths.push(path);
    else paths.push(...(await listStoragePaths(client, bucket, path, depth + 1)));
  }
  return paths;
}

async function collectWorkspaceExport(client: AnyClient, workspaceId: string, requestId: string) {
  const tables: Record<string, unknown[]> = {};
  const skipped: string[] = [];
  const workspace = await client
    .from("workspaces")
    .select("id,name,slug,kind,status,created_at,updated_at")
    .eq("id", workspaceId)
    .maybeSingle();
  if (workspace.error) throw workspace.error;
  tables["workspaces"] = workspace.data ? [redactExportValue(workspace.data)] : [];

  for (const table of EXPORT_TABLES) {
    const result = await queryWorkspaceTable(client, table, workspaceId);
    if (result.skipped) skipped.push(table.table);
    else tables[table.table] = result.rows;
  }

  return {
    schema_version: 1,
    request_id: requestId,
    workspace_id: workspaceId,
    generated_at: nowIso(),
    retention_note:
      "Exportação gerada pelo workspace autorizado; segredos e tokens foram removidos.",
    skipped_tables: skipped,
    tables,
  };
}

async function runExport(client: AnyClient, request: PrivacyRequest) {
  const document = await collectWorkspaceExport(client, request.workspace_id, request.id);
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  if (bytes.byteLength > 50 * 1024 * 1024) throw new Error("privacy_export_too_large");
  const path = `${request.workspace_id}/exports/${request.id}.json`;
  const { error } = await client.storage.from("privacy-exports").upload(path, bytes, {
    contentType: "application/json",
    upsert: true,
  });
  if (error) throw error;
  return { result_path: path, result_expires_at: isoDaysFromNow(EXPORT_TTL_DAYS) };
}

async function latestMessageForChat(client: AnyClient, chatId: string) {
  const { data } = await client
    .from("messages")
    .select("last_message:text,last_message_at:created_at,last_message_type:type")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

async function clearExpiredMessages(client: AnyClient, workspaceId: string, days: number) {
  let deleted = 0;
  let mediaRemoved = 0;
  const cutoff = isoDaysAgo(days);
  for (;;) {
    const { data, error } = await client
      .from("messages")
      .select("id,chat_id,media_url")
      .eq("workspace_id", workspaceId)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(MESSAGE_BATCH_SIZE);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) break;
    const ids = rows.map((row: any) => row.id).filter(Boolean);
    const chatIds = [...new Set(rows.map((row: any) => row.chat_id).filter(Boolean))] as string[];
    const paths = rows
      .map((row: any) => storagePathFromMediaUrl(row.media_url, workspaceId))
      .filter((path): path is string => Boolean(path));
    mediaRemoved += await removeStoragePaths(client, "chat-media", paths);
    const { error: deleteError } = await client
      .from("messages")
      .delete()
      .eq("workspace_id", workspaceId)
      .in("id", ids);
    if (deleteError) throw deleteError;
    deleted += ids.length;
    for (const chatId of chatIds) {
      const latest = await latestMessageForChat(client, chatId);
      await client
        .from("chats")
        .update(
          latest
            ? latest
            : {
                last_message: null,
                last_message_type: "text",
                last_message_at: nowIso(),
                unread: 0,
              },
        )
        .eq("id", chatId)
        .eq("workspace_id", workspaceId);
    }
    if (rows.length < MESSAGE_BATCH_SIZE) break;
  }
  return { deleted, mediaRemoved };
}

async function clearExpiredMedia(client: AnyClient, workspaceId: string, days: number) {
  let updated = 0;
  let mediaRemoved = 0;
  const cutoff = isoDaysAgo(days);
  for (;;) {
    const { data, error } = await client
      .from("messages")
      .select("id,media_url")
      .eq("workspace_id", workspaceId)
      .not("media_url", "is", null)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(MESSAGE_BATCH_SIZE);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) break;
    const ids = rows.map((row: any) => row.id).filter(Boolean);
    const paths = rows
      .map((row: any) => storagePathFromMediaUrl(row.media_url, workspaceId))
      .filter((path): path is string => Boolean(path));
    mediaRemoved += await removeStoragePaths(client, "chat-media", paths);
    const { error: updateError } = await client
      .from("messages")
      .update({ media_url: null, media_mimetype: null, media_filename: null, media_duration: null })
      .eq("workspace_id", workspaceId)
      .in("id", ids);
    if (updateError) throw updateError;
    updated += ids.length;
    if (rows.length < MESSAGE_BATCH_SIZE) break;
  }
  return { updated, mediaRemoved };
}

async function runRetention(client: AnyClient, settings: PrivacySettings) {
  const media = await clearExpiredMedia(
    client,
    settings.workspace_id,
    settings.media_retention_days,
  );
  const messages = await clearExpiredMessages(
    client,
    settings.workspace_id,
    settings.message_retention_days,
  );
  return { ...media, ...messages };
}

async function runDelete(client: AnyClient, request: PrivacyRequest) {
  // Remove private media and any generated export for this tenant before the
  const mediaPaths = await listStoragePaths(client, "chat-media", request.workspace_id);
  const exportPaths = await listStoragePaths(
    client,
    "privacy-exports",
    `${request.workspace_id}/exports`,
  );
  const mediaRemoved = await removeStoragePaths(client, "chat-media", mediaPaths);
  const exportRemoved = await removeStoragePaths(client, "privacy-exports", exportPaths);
  const { data, error } = await client.rpc("execute_privacy_workspace_delete", {
    p_workspace_id: request.workspace_id,
  });
  if (error) throw error;
  return { removedTables: data ?? {}, mediaRemoved, exportRemoved };
}

async function claimRequest(client: AnyClient, request: PrivacyRequest) {
  const { data, error } = await client
    .from("workspace_data_requests")
    .update({ status: "processing", processing_started_at: nowIso(), error_message: null })
    .eq("id", request.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as PrivacyRequest | null;
}

async function processRequest(client: AnyClient, request: PrivacyRequest) {
  if (request.request_type === "correct") {
    await client
      .from("workspace_data_requests")
      .update({
        status: "manual_review",
        error_message: "correction_requires_manual_review",
        completed_at: null,
      })
      .eq("id", request.id)
      .eq("status", "processing");
    await audit(client, request.workspace_id, "privacy.request.manual_review", request.id, {
      request_type: request.request_type,
    });
    return "manual_review";
  }

  const result =
    request.request_type === "export"
      ? await runExport(client, request)
      : await runDelete(client, request);
  const completionPatch =
    request.request_type === "export" ? result : { result_path: null, result_expires_at: null };
  await client
    .from("workspace_data_requests")
    .update({
      status: "completed",
      ...completionPatch,
      completed_at: nowIso(),
      error_message: null,
    })
    .eq("id", request.id)
    .eq("status", "processing");
  await audit(
    client,
    request.workspace_id,
    `privacy.${request.request_type}.completed`,
    request.id,
    result,
  );
  return "completed";
}

async function recoverStaleClaims(client: AnyClient) {
  const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS).toISOString();
  await client
    .from("workspace_data_requests")
    .update({
      status: "pending",
      processing_started_at: null,
      error_message: "retry_after_worker_timeout",
    })
    .eq("status", "processing")
    .lt("processing_started_at", cutoff);
}

async function cleanupExpiredExports(client: AnyClient) {
  const { data, error } = await client
    .from("workspace_data_requests")
    .select("id,workspace_id,result_path")
    .eq("status", "completed")
    .not("result_path", "is", null)
    .lt("result_expires_at", nowIso())
    .limit(100);
  if (error) return 0;
  let removed = 0;
  for (const row of data ?? []) {
    if (typeof row.result_path === "string" && row.result_path.startsWith(`${row.workspace_id}/`)) {
      await removeStoragePaths(client, "privacy-exports", [row.result_path]);
      removed += 1;
    }
    await client.from("workspace_data_requests").update({ result_path: null }).eq("id", row.id);
  }
  return removed;
}

export async function processPrivacyQueue(
  options: { maxRequests?: number; maxWorkspaces?: number } = {},
) {
  const client = supabaseAdmin as AnyClient;
  await recoverStaleClaims(client);
  const [requestResult, settingsResult] = await Promise.all([
    client
      .from("workspace_data_requests")
      .select("*")
      .eq("status", "pending")
      .in("request_type", ["export", "delete", "correct"])
      .lte("execute_after", nowIso())
      .order("created_at", { ascending: true })
      .limit(
        Math.min(MAX_REQUESTS_PER_RUN, Math.max(1, options.maxRequests ?? MAX_REQUESTS_PER_RUN)),
      ),
    client
      .from("workspace_privacy_settings")
      .select("workspace_id,message_retention_days,media_retention_days")
      .limit(
        Math.min(
          MAX_WORKSPACES_PER_RUN,
          Math.max(1, options.maxWorkspaces ?? MAX_WORKSPACES_PER_RUN),
        ),
      ),
  ]);
  if (requestResult.error) throw requestResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const report = {
    requests: { claimed: 0, completed: 0, manualReview: 0, failed: 0 },
    retention: { workspaces: 0, messages: 0, mediaRows: 0, mediaObjects: 0 },
    expiredExports: 0,
  };

  for (const candidate of (requestResult.data ?? []) as PrivacyRequest[]) {
    const claimed = await claimRequest(client, candidate);
    if (!claimed) continue;
    report.requests.claimed += 1;
    try {
      const result = await processRequest(client, claimed);
      if (result === "manual_review") report.requests.manualReview += 1;
      else report.requests.completed += 1;
    } catch (error) {
      report.requests.failed += 1;
      await client
        .from("workspace_data_requests")
        .update({ status: "failed", error_message: safeError(error), completed_at: nowIso() })
        .eq("id", claimed.id)
        .eq("status", "processing");
      await audit(client, claimed.workspace_id, "privacy.request.failed", claimed.id);
    }
  }

  for (const settings of (settingsResult.data ?? []) as PrivacySettings[]) {
    try {
      const result = await runRetention(client, settings);
      report.retention.workspaces += 1;
      report.retention.messages += result.deleted;
      report.retention.mediaRows += result.updated;
      report.retention.mediaObjects += result.mediaRemoved;
      await audit(
        client,
        settings.workspace_id,
        "privacy.retention.run",
        settings.workspace_id,
        result,
      );
    } catch (error) {
      await audit(
        client,
        settings.workspace_id,
        "privacy.retention.failed",
        settings.workspace_id,
        {
          error: safeError(error),
        },
      );
    }
  }
  report.expiredExports = await cleanupExpiredExports(client);
  return report;
}
