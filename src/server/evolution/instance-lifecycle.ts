import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { LiveAuthDatabase } from "@/server/auth/live-auth-database";

type LifecycleClient = SupabaseClient<Database>;

function mediaStoragePath(value: unknown, workspaceId: string): string | null {
  if (typeof value !== "string" || !value) return null;
  let path = value.startsWith("/api/media/") ? value.slice("/api/media/".length) : value;
  if (path.includes("/storage/v1/object/")) {
    path = path.split("chat-media/")[1] || "";
  }
  if (!path.startsWith(`${workspaceId}/`) || path.includes("..") || path.includes("\\")) {
    return null;
  }
  return path;
}

async function removeMedia(client: LifecycleClient, paths: string[]) {
  const unique = [...new Set(paths)].filter(Boolean);
  for (let start = 0; start < unique.length; start += 100) {
    const { error } = await client.storage
      .from("chat-media")
      .remove(unique.slice(start, start + 100));
    if (error) throw error;
  }
  return unique.length;
}

async function recordCleanupAudit(
  client: SupabaseClient<LiveAuthDatabase>,
  input: {
    workspaceId: string;
    instanceId: string;
    instanceName: string;
    policy: "purge" | "retain";
    chatCount: number;
    mediaCount: number;
  },
) {
  // Cleanup must not be reported as failed just because an older installation
  // has not applied the audit migration yet. The data operation remains
  // scoped and deterministic; the audit is best-effort until that schema is
  // present.
  await client.from("workspace_audit_log").insert({
    workspace_id: input.workspaceId,
    actor_user_id: null,
    action: "evolution.instance.cleanup",
    target_type: "whatsapp_instance",
    target_id: input.instanceId,
    metadata: {
      instance_name: input.instanceName,
      policy: input.policy,
      chat_count: input.chatCount,
      media_count: input.mediaCount,
    },
  });
}

/**
 * Removes only data owned by one workspace/instance. The workspace policy is
 * intentionally explicit: the default (`purge`) removes operational data;
 * `retain` only marks the provider session disconnected for audit/recovery.
 * CRM leads are retained in both modes because they are business records.
 */
export async function purgeInstanceData(
  db: SupabaseClient<Database>,
  input: {
    workspaceId: string;
    instanceId: string;
    instanceName: string;
    preserveEventId?: string | null;
  },
) {
  const { workspaceId, instanceId, instanceName, preserveEventId = null } = input;
  const client = db as unknown as LifecycleClient;
  const authClient = db as unknown as SupabaseClient<LiveAuthDatabase>;
  const { data: privacySettings, error: privacyError } = await authClient
    .from("workspace_privacy_settings")
    .select("disconnect_cleanup_policy")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (privacyError) throw privacyError;
  const cleanupPolicy =
    privacySettings?.disconnect_cleanup_policy === "retain" ? "retain" : "purge";

  if (cleanupPolicy === "retain") {
    const { error } = await client
      .from("whatsapp_instances")
      .update({ status: "disconnected", connection_state: "disconnected", qr_code: null })
      .eq("id", instanceId)
      .eq("workspace_id", workspaceId)
      .eq("instance_name", instanceName);
    if (error) throw error;
    await recordCleanupAudit(authClient, {
      workspaceId,
      instanceId,
      instanceName,
      policy: "retain",
      chatCount: 0,
      mediaCount: 0,
    });
    return { chatCount: 0, mediaCount: 0, retained: true as const };
  }

  const { data: chats, error: chatsError } = await client
    .from("chats")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("instance_id", instanceId)
    .eq("instance_name", instanceName);
  if (chatsError) throw chatsError;

  const chatIds = (chats ?? []).map((chat: { id: string }) => chat.id);
  const { data: mediaRows, error: mediaRowsError } = await client
    .from("messages")
    .select("media_url")
    .eq("workspace_id", workspaceId)
    .eq("instance_id", instanceId)
    .in("chat_id", chatIds.length > 0 ? chatIds : ["00000000-0000-0000-0000-000000000000"]);
  if (mediaRowsError) throw mediaRowsError;
  const mediaCount = await removeMedia(
    client,
    (mediaRows ?? [])
      .map((row: { media_url?: unknown }) => mediaStoragePath(row.media_url, workspaceId))
      .filter((path): path is string => Boolean(path)),
  );

  if (chatIds.length > 0) {
    const { error } = await client
      .from("messages")
      .delete()
      .in("chat_id", chatIds)
      .eq("workspace_id", workspaceId)
      .eq("instance_id", instanceId);
    if (error) throw error;

    const { error: chatsDeleteError } = await client
      .from("chats")
      .delete()
      .in("id", chatIds)
      .eq("workspace_id", workspaceId)
      .eq("instance_id", instanceId)
      .eq("instance_name", instanceName);
    if (chatsDeleteError) throw chatsDeleteError;
  }

  const scopedDeletes = await Promise.all([
    client
      .from("outbound_messages")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("instance_id", instanceId),
    client
      .from("group_participants")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("instance_id", instanceId),
    client
      .from("contact_identity_aliases")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("instance_id", instanceId),
    client
      .from("whatsapp_contacts")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("instance_id", instanceId),
    client
      .from("whatsapp_presence")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("instance_id", instanceId),
    (() => {
      let query = client
        .from("evolution_events")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("instance_id", instanceId);
      if (preserveEventId) query = query.neq("id", preserveEventId);
      return query;
    })(),
  ]);
  for (const result of scopedDeletes) {
    if (result.error) throw result.error;
  }

  if (chatIds.length > 0) {
    const { error } = await client
      .from("inbox_events")
      .delete()
      .eq("workspace_id", workspaceId)
      .in("chat_id", chatIds);
    if (error) throw error;
  }

  const { error: instanceError } = await client
    .from("whatsapp_instances")
    .delete()
    .eq("id", instanceId)
    .eq("workspace_id", workspaceId)
    .eq("instance_name", instanceName);
  if (instanceError) throw instanceError;

  await recordCleanupAudit(authClient, {
    workspaceId,
    instanceId,
    instanceName,
    policy: "purge",
    chatCount: chatIds.length,
    mediaCount,
  });

  return { chatCount: chatIds.length, mediaCount, retained: false as const };
}

export function providerInstanceNames(payload: unknown): Set<string> | null {
  let raw: unknown[];
  if (Array.isArray(payload)) {
    raw = payload;
  } else if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { instances?: unknown }).instances)
  ) {
    raw = (payload as { instances: unknown[] }).instances;
  } else {
    // Never treat an unknown provider response as an empty catalog: that
    // would make a transient API/schema error delete every local instance.
    return null;
  }
  return new Set(
    raw
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const value = item as { instance?: unknown; name?: unknown; instanceName?: unknown };
        const nested = value.instance;
        if (typeof nested === "string") return nested;
        if (nested && typeof nested === "object") {
          const nestedValue = nested as { name?: unknown; instanceName?: unknown };
          return nestedValue.name ?? nestedValue.instanceName ?? "";
        }
        return value.name ?? value.instanceName ?? "";
      })
      .map((item) => String(item).trim())
      .filter(Boolean),
  );
}

/** Evolution uses `close` for a logged-out session and other deployments may
 * report the equivalent state as `closed` or `disconnected`. */
export function isProviderDisconnectedState(value: unknown): boolean {
  return new Set(["close", "closed", "disconnected", "logout", "logged_out"]).has(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}
