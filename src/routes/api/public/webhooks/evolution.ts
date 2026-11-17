import { createFileRoute } from "@tanstack/react-router";
import {
  cleanPhone,
  evolutionFetch,
  mediaTypeFromMime,
  persistMessage,
  storeBase64Media,
  isValidManagedWebhookRequest,
  deleteMessageByExternalId,
  editMessageByExternalId,
  addReactionToMessage,
  recordGroupMetadata,
  getGroupMetadata,
  resolveContactSavedName,
  fetchGroupInfo,
  fetchContactProfilePicture,
  configureEvolutionWebhook,
} from "@/lib/evolution.server";
import { buildChatEventUpsert } from "@/server/evolution/chat-event";
import {
  WHATSAPP_CONTACTS_ON_CONFLICT,
  WHATSAPP_PRESENCE_ON_CONFLICT,
} from "@/server/evolution/schema-contract";
import {
  buildEvolutionContactRow,
  collectEvolutionEdits,
  collectEvolutionDeletes,
  evolutionEventRecords,
  isEvolutionMessageAfterConnection,
  isFreshEvolutionInboundMessage,
  isHistoricalEvolutionEvent,
  nextEvolutionConnectionAt,
} from "@/server/evolution/event-contract";
import { shouldIncrementUnread } from "@/server/evolution/event-policy";
import {
  consumeEvolutionQueueMessage,
  evolutionEventKey,
  sanitizeEvolutionPayload,
} from "@/server/evolution/event-inbox";
import {
  isProviderDisconnectedState,
  purgeInstanceData,
} from "@/server/evolution/instance-lifecycle";
import { logServerError, logServerWarning } from "@/server/logging";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type WebhookData = {
  action?: string | null;
  announce?: boolean;
  base64?: string | null;
  connection?: string | null;
  desc?: string | null;
  description?: string | null;
  groupJid?: string | null;
  id?: string | null;
  key?: unknown;
  keys?: unknown[];
  messages?: unknown[];
  name?: string | null;
  participants?: unknown[];
  phone?: string | null;
  presence?: string | null;
  presences?: Record<string, { lastKnownPresence?: string }>;
  qrcode?: { base64?: string | null; code?: string | null };
  remoteJid?: string | null;
  restrict?: boolean;
  state?: string | null;
  subject?: string | null;
};
type WebhookPayload = {
  data?: WebhookData;
  event?: unknown;
  instance?: unknown;
  instanceName?: unknown;
};

import {
  extractMediaBase64,
  extractText,
  extractMediaInfo,
  extractQuotedMessage,
  isGifMedia,
  unwrapMessage,
} from "@/server/evolution/normalize-message";
import { normalizeEvolutionEvent } from "@/server/evolution/webhook-config";
import { collectEvolutionDeliveryUpdates } from "@/server/evolution/message-status";
import { isValidPhone, isBroadcastOrStatus } from "@/lib/conversationKey";
import { consumeEvolutionWebhookRateLimit } from "@/server/evolution/webhook-rate-limit";
import {
  createVercelEvolutionProducer,
  invokeVercelEvolutionBackground,
} from "@/server/evolution/background-dispatch";
import { verifyEvolutionQueueConsumerRequest } from "@/server/evolution/background-dispatch";
import { trustedAppOrigin } from "@/server/security/trusted-app-origin";
import {
  readEvolutionWebhookBody,
  EvolutionWebhookBodyTooLarge,
} from "@/server/evolution/webhook-body";
import { maybeRunAutomaticAgent } from "@/server/product/workspace-product.server";
import { permissionsAfterOwnGroupParticipantUpdate } from "@/server/evolution/group-participant-permissions";

export const Route = createFileRoute("/api/public/webhooks/evolution")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ ok: false, error: "Método não permitido" }), {
          status: 405,
          headers: { "Content-Type": "application/json", Allow: "POST" },
        }),
      POST: async ({ request }) => {
        // Só aceita chamadas que trazem o token secreto configurado na Evolution
        if (!(await isValidManagedWebhookRequest(request))) {
          return json({ ok: false, error: "Não autorizado" }, 401);
        }

        const isQueueConsumer = request.headers.get("x-inbox-queue-consumer") === "1";
        const queueEventId = isQueueConsumer
          ? request.headers.get("x-inbox-event-id")?.trim() || null
          : null;
        let payload: WebhookPayload;
        let rawBody: string;
        try {
          rawBody = await readEvolutionWebhookBody(request);
          const parsed: unknown = JSON.parse(rawBody);
          payload = parsed && typeof parsed === "object" ? (parsed as WebhookPayload) : {};
        } catch (error) {
          if (error instanceof EvolutionWebhookBodyTooLarge) {
            return json({ ok: false, error: "Evento excede o tamanho permitido" }, 413);
          }
          return json({ ok: false, error: "Corpo inválido" }, 400);
        }

        if (isQueueConsumer && !verifyEvolutionQueueConsumerRequest(request, rawBody)) {
          return json({ ok: false, error: "Consumidor interno não autorizado" }, 401);
        }

        // Queue replays are already durable and authenticated above with a
        // body-bound signature. They must not consume the public Evolution
        // ingress quota a second time during a burst.
        if (!isQueueConsumer) {
          const limit = await consumeEvolutionWebhookRateLimit(request);
          if (!limit.allowed) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: limit.unavailable ? "Temporariamente indisponível" : "Muitas requisições",
              }),
              {
                status: limit.unavailable ? 503 : 429,
                headers: {
                  "Content-Type": "application/json",
                  "Retry-After": String(Math.max(1, limit.retryAfterSeconds)),
                },
              },
            );
          }
        }

        const event =
          typeof payload.event === "string" ? normalizeEvolutionEvent(payload.event) : null;
        const instanceName = String(payload?.instance ?? payload?.instanceName ?? "").trim();
        const data = payload?.data ?? {};

        if (!event || !instanceName) {
          return json({ ok: false, error: "Evento ou instância ausente" }, 400);
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: instRow, error: instanceLookupError } = await supabaseAdmin
            .from("whatsapp_instances")
            .select("id, workspace_id, status, connection_state, connected_at")
            .eq("instance_name", instanceName)
            .maybeSingle();
          // DB outages are not unknown instances: retry instead of dropping events as 404.
          if (instanceLookupError) throw instanceLookupError;

          const workspaceId = instRow?.workspace_id;
          if (!workspaceId) {
            if (isQueueConsumer) {
              return json({ ok: true, ignored: "instance-removed" }, 202);
            }
            // Nunca associa automaticamente uma instância recebida pela internet
            // ao primeiro workspace. A instância precisa ser cadastrada pelo painel.
            return json({ ok: false, error: "Instância não cadastrada" }, 404);
          }

          // Snapshot/history callbacks can contain messages from long before the
          // InboxOS connection epoch. Metadata has dedicated contacts/groups flows.
          if (isHistoricalEvolutionEvent(event)) {
            return json({ ok: true, ignored: event, reason: "historical-snapshot" }, 202);
          }

          // Advance the connection epoch before durable dispatch. Evolution may
          // deliver CONNECTION_UPDATE and the first live message concurrently;
          // persisting the cutoff at ingress prevents a valid post-connect
          // message from being discarded by a worker that runs first.
          if (!isQueueConsumer && event === "CONNECTION_UPDATE") {
            const state = data?.state ?? data?.connection;
            const now = new Date().toISOString();
            const { error: ingressConnectionError } = await supabaseAdmin
              .from("whatsapp_instances")
              .update({
                status: state === "open" ? "open" : "disconnected",
                connection_state: state === "open" ? "connected" : "disconnected",
                connected_at: nextEvolutionConnectionAt(
                  instRow.status,
                  state,
                  instRow.connected_at,
                  now,
                ),
                updated_at: now,
                ...(state === "open" ? { qr_code: null } : {}),
              })
              .eq("id", instRow.id)
              .eq("workspace_id", workspaceId)
              .eq("instance_name", instanceName);
            if (ingressConnectionError) throw ingressConnectionError;
          }

          if (!isQueueConsumer) {
            const eventKey = await evolutionEventKey(workspaceId, event, instanceName, payload);
            const requestId = request.headers.get("cf-ray") || crypto.randomUUID();
            const { data: inserted, error: inboxError } = await supabaseAdmin
              .from("evolution_events")
              .upsert(
                {
                  workspace_id: workspaceId,
                  instance_id: instRow.id,
                  instance_name: instanceName,
                  event_key: eventKey,
                  event_type: event,
                  payload: sanitizeEvolutionPayload(payload),
                  request_id: requestId,
                },
                { onConflict: "workspace_id,event_key", ignoreDuplicates: true },
              )
              .select("id,status")
              .maybeSingle();
            if (inboxError) return json({ ok: false, error: "Falha ao registrar evento" }, 500);
            if (!inserted) return json({ ok: true, duplicated: true }, 202);

            if (process.env["VERCEL"] === "1") {
              try {
                await invokeVercelEvolutionBackground(trustedAppOrigin(process.env), inserted.id);
                return json(
                  { ok: true, queued: true, provider: "vercel-background", eventId: inserted.id },
                  202,
                );
              } catch (backgroundError) {
                // The event is already durable in evolution_events. Never run
                // the expensive message handler inside the provider request on
                // Vercel: under a burst this blocks Evolution, causes retries,
                // and amplifies the backlog. The recovery cron/worker will
                // dispatch the queued event again.
                logServerError(
                  "[evolution-webhook] Vercel background dispatch failed; leaving event for recovery",
                  backgroundError,
                );
                return json(
                  { ok: true, queued: true, provider: "vercel-recovery", eventId: inserted.id },
                  202,
                );
              }
            }
            const inlineEnv: Record<string, unknown> = {
              ...process.env,
              PUBLIC_APP_URL: trustedAppOrigin(process.env),
            };
            if (process.env["VERCEL"] === "1") {
              inlineEnv["EVOLUTION_EVENTS_QUEUE"] = createVercelEvolutionProducer(
                trustedAppOrigin(process.env),
              );
            }
            await consumeEvolutionQueueMessage({ eventId: inserted.id }, inlineEnv);
            return json(
              { ok: true, queued: false, provider: "inline-durable", eventId: inserted.id },
              202,
            );
          }
          if (event === "CONNECTION_UPDATE") {
            const state = data?.state ?? data?.connection;
            const normalizedState = String(state ?? "")
              .trim()
              .toLowerCase();
            if (isProviderDisconnectedState(normalizedState)) {
              // The product treats a logged-out Evolution session as removed:
              // hide it immediately and purge only this workspace/instance's
              // operational data. Reconnection starts as a new connection.
              const cleanup = await purgeInstanceData(supabaseAdmin, {
                workspaceId,
                instanceId: instRow.id,
                instanceName,
                preserveEventId: queueEventId,
              });
              return json({
                ok: true,
                instanceRemoved: !cleanup.retained,
                retained: cleanup.retained,
                reason: "provider-disconnected",
              });
            }
            const now = new Date().toISOString();
            const { error: connectionError } = await supabaseAdmin
              .from("whatsapp_instances")
              .upsert(
                {
                  workspace_id: workspaceId,
                  instance_name: instanceName,
                  status: state === "open" ? "open" : "disconnected",
                  connection_state: state === "open" ? "connected" : "disconnected",
                  connected_at: nextEvolutionConnectionAt(
                    instRow.status,
                    state,
                    instRow.connected_at,
                    now,
                  ),
                  updated_at: now,
                  ...(state === "open" ? { qr_code: null } : {}),
                },
                { onConflict: "workspace_id,instance_name" },
              );
            if (connectionError) throw connectionError;

            if (state === "open") {
              // Auto-cura de webhooks: reconfirma as assinaturas do evento de webhook da Evolution API
              await configureEvolutionWebhook(instanceName);
            }

            return json({ ok: true });
          }

          if (event === "SYNC_CONTACTS" || event === "SYNC_GROUPS") {
            const { syncGroups, syncContacts } = await import("@/server/evolution/sync-engine");
            const result =
              event === "SYNC_CONTACTS"
                ? await syncContacts(instanceName, workspaceId)
                : await syncGroups(instanceName, workspaceId, {
                    includeParticipants: false,
                    syncParticipantContacts: false,
                    // Group enumeration is a slow provider operation. Picture
                    // backfill runs through the explicit metadata path so a
                    // connection bootstrap cannot time out after the catalog
                    // has already been fetched and persisted.
                    fetchMissingPictures: false,
                  });
            if (!result.success) {
              return json({ ok: false, error: `Falha na fase ${event.toLowerCase()}` }, 502);
            }
            return json({ ok: true, phase: event, count: result.count ?? 0 });
          }

          if (event === "SYNC_GROUP_PARTICIPANTS") {
            const groupJid = String(data?.groupJid || "").trim();
            const { syncGroupParticipants } = await import("@/server/evolution/sync-engine");
            const result = await syncGroupParticipants(instanceName, workspaceId, groupJid);
            if (!result.success) {
              return json({ ok: false, error: "Falha ao sincronizar participantes" }, 502);
            }
            return json({ ok: true, phase: event, count: result.count ?? 0 });
          }

          if (event === "QRCODE_UPDATED") {
            const qr = data?.qrcode?.base64 ?? data?.qrcode?.code ?? data?.base64 ?? null;
            const { error: qrError } = await supabaseAdmin.from("whatsapp_instances").upsert(
              {
                workspace_id: workspaceId,
                instance_name: instanceName,
                status: "connecting",
                qr_code: qr,
              },
              { onConflict: "workspace_id,instance_name" },
            );
            if (qrError) throw qrError;
            return json({ ok: true });
          }

          if (event === "PRESENCE_UPDATE") {
            const presenceJid =
              data?.id || data?.remoteJid || Object.keys(data?.presences || {})[0] || "";
            const presenceType =
              data?.presences?.[presenceJid]?.lastKnownPresence ||
              data?.presence ||
              data?.state ||
              "";
            const phone = cleanPhone(presenceJid);
            if (
              phone &&
              ["available", "unavailable", "composing", "recording", "paused"].includes(
                presenceType,
              )
            ) {
              const { error: presenceError } = await supabaseAdmin.from("whatsapp_presence").upsert(
                {
                  workspace_id: workspaceId,
                  instance_id: instRow.id,
                  instance_name: instanceName,
                  phone,
                  state: presenceType,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: WHATSAPP_PRESENCE_ON_CONFLICT },
              );
              if (presenceError) throw presenceError;
            }
            return json({ ok: true });
          }

          if (event === "MESSAGES_DELETE") {
            const keys = Array.isArray(data?.keys)
              ? data.keys
              : data?.key
                ? [data.key]
                : Array.isArray(data)
                  ? data
                  : [data];
            for (const k of keys) {
              const extId = k?.id || k?.key?.id || (typeof k === "string" ? k : null);
              if (extId) {
                const result = await deleteMessageByExternalId(workspaceId, extId, instRow.id);
                if (result?.error) throw result.error;
              }
            }
            return json({ ok: true });
          }

          if (event === "MESSAGES_EDITED") {
            for (const edit of collectEvolutionEdits(data, true)) {
              const result = await editMessageByExternalId(
                workspaceId,
                edit.externalId,
                edit.text,
                instRow.id,
              );
              if (result?.error) throw result.error;
            }
            return json({ ok: true });
          }

          if (event === "REACTIONS") {
            const reactionData = Array.isArray(data) ? data : [data];
            for (const r of reactionData) {
              const targetId = r?.key?.id || r?.reaction?.key?.id;
              const emoji = r?.reaction?.text || r?.text || "";
              const senderPhone = cleanPhone(r?.participant || r?.key?.participant || r?.sender);
              if (targetId) {
                const result = await addReactionToMessage(
                  workspaceId,
                  targetId,
                  emoji,
                  senderPhone,
                  instRow.id,
                );
                if (result?.error) throw result.error;
              }
            }
            return json({ ok: true });
          }

          if (event === "CHATS_UPDATE") {
            const updates = Array.isArray(data) ? data : [data];
            for (const upd of updates) {
              const phone = cleanPhone(upd?.id || upd?.remoteJid);
              if (!phone) continue;
              const patch: { archived?: boolean; pinned?: boolean; unread?: number } = {};
              if (upd?.archive !== undefined) patch.archived = Boolean(upd.archive);
              if (upd?.pin !== undefined) patch.pinned = Boolean(upd.pin);
              if (upd?.unreadMessages !== undefined) patch.unread = Number(upd.unreadMessages);
              if (Object.keys(patch).length > 0) {
                const { error: contactChatError } = await supabaseAdmin
                  .from("chats")
                  .update(patch)
                  .eq("workspace_id", workspaceId)
                  .eq("instance_name", instanceName)
                  .eq("phone", phone);
                if (contactChatError) throw contactChatError;
              }
            }
            return json({ ok: true });
          }

          if (event === "GROUPS_UPDATE") {
            const groupId = cleanPhone(data?.id || data?.remoteJid || data?.groupJid);
            if (groupId) {
              const announce = data?.announce !== undefined ? Boolean(data.announce) : undefined;
              const restrict = data?.restrict !== undefined ? Boolean(data.restrict) : undefined;
              const subject = data?.subject || data?.name || null;
              const desc = data?.desc || data?.description || null;

              const patch: {
                name?: string;
                is_announcement?: boolean;
                can_send?: boolean;
                group_metadata?: { description: string | null; restrict?: boolean };
              } = {};
              if (subject) patch.name = subject;
              if (announce !== undefined) {
                const { data: currentGroup, error: currentGroupError } = await supabaseAdmin
                  .from("chats")
                  .select("is_admin")
                  .eq("workspace_id", workspaceId)
                  .eq("instance_name", instanceName)
                  .eq("phone", groupId)
                  .maybeSingle();
                if (currentGroupError) throw currentGroupError;
                patch.is_announcement = announce;
                patch.can_send = announce ? Boolean(currentGroup?.is_admin) : true;
              }
              if (restrict !== undefined || desc) {
                patch.group_metadata = {
                  description: desc,
                  ...(restrict !== undefined ? { restrict } : {}),
                };
              }
              if (Object.keys(patch).length > 0) {
                const { error: groupUpdateError } = await supabaseAdmin
                  .from("chats")
                  .update(patch)
                  .eq("workspace_id", workspaceId)
                  .eq("instance_name", instanceName)
                  .eq("phone", groupId);
                if (groupUpdateError) throw groupUpdateError;
              }
              recordGroupMetadata(workspaceId, instanceName, groupId, {
                ...(announce !== undefined ? { announce } : {}),
                ...(restrict !== undefined ? { restrict } : {}),
                ...(subject ? { subject } : {}),
                ...(desc ? { desc } : {}),
              });
            }
            return json({ ok: true });
          }

          if (event === "GROUPS_UPSERT") {
            const groups = Array.isArray(data) ? data : [data];
            for (const g of groups) {
              const rawGroupJid = String(g?.id || g?.jid || g?.groupJid || "").trim();
              const groupId = cleanPhone(rawGroupJid);
              if (!groupId) continue;
              const subject = String(g?.subject || g?.name || "").trim();
              const announce = Boolean(g?.announce);
              const restrict = Boolean(g?.restrict);
              const desc = g?.desc || g?.description || null;
              const participants: unknown[] = Array.isArray(g?.participants)
                ? (g.participants as unknown[])
                : [];
              const myPhone = cleanPhone(
                instRow?.id
                  ? (
                      await supabaseAdmin
                        .from("whatsapp_instances")
                        .select("phone")
                        .eq("id", instRow.id)
                        .single()
                    ).data?.phone
                  : null,
              );
              const myParticipant = participants.find((participant: unknown) => {
                const value =
                  participant && typeof participant === "object"
                    ? (participant as {
                        id?: unknown;
                        jid?: unknown;
                        admin?: unknown;
                        role?: unknown;
                      })
                    : {};
                const jid = value.id || value.jid || participant;
                return myPhone && cleanPhone(String(jid ?? "")) === myPhone;
              }) as { admin?: unknown; role?: unknown } | undefined;
              const isAdmin = ["admin", "superadmin"].includes(
                String(myParticipant?.admin || myParticipant?.role || "").toLowerCase(),
              );

              const groupRemoteJid = rawGroupJid.includes("@g.us")
                ? rawGroupJid
                : `${rawGroupJid}@g.us`;
              const { data: existingGroup, error: existingGroupError } = await supabaseAdmin
                .from("chats")
                .select("id")
                .eq("workspace_id", workspaceId)
                .eq("instance_id", instRow.id)
                .eq("remote_jid", groupRemoteJid)
                .maybeSingle();
              if (existingGroupError) throw existingGroupError;

              const { error: groupUpsertError } = await supabaseAdmin.from("chats").upsert(
                {
                  id: existingGroup?.id ?? crypto.randomUUID(),
                  workspace_id: workspaceId,
                  instance_id: instRow.id,
                  instance_name: instanceName,
                  phone: groupId,
                  remote_jid: groupRemoteJid,
                  identity_kind: "group",
                  ...(subject ? { name: subject } : {}),
                  is_group: true,
                  is_announcement: announce,
                  can_send: !announce || isAdmin,
                  is_admin: isAdmin,
                  group_metadata: { description: desc, restrict },
                  archived: false,
                },
                { onConflict: "id" },
              );
              if (groupUpsertError) throw groupUpsertError;
              recordGroupMetadata(workspaceId, instanceName, groupId, {
                announce,
                restrict,
                ...(subject ? { subject } : {}),
                desc,
                isAdmin,
                canSend: !announce || isAdmin,
              });

              const { data: chat, error: groupChatLookupError } = await supabaseAdmin
                .from("chats")
                .select("id")
                .eq("workspace_id", workspaceId)
                .eq("instance_name", instanceName)
                .eq("phone", groupId)
                .single();
              if (groupChatLookupError) throw groupChatLookupError;
              if (chat && participants.length > 0) {
                const { error: groupParticipantsError } = await supabaseAdmin
                  .from("group_participants")
                  .upsert(
                    participants
                      .map((participant: unknown) => {
                        const value =
                          participant && typeof participant === "object"
                            ? (participant as {
                                id?: unknown;
                                jid?: unknown;
                                admin?: unknown;
                                role?: unknown;
                              })
                            : {};
                        const jid = String(value.id || value.jid || participant || "");
                        const role = String(value.admin || value.role || "member").toLowerCase();
                        return {
                          workspace_id: workspaceId,
                          instance_id: instRow.id,
                          chat_id: chat.id,
                          participant_jid: jid,
                          phone_e164: cleanPhone(jid) || null,
                          role:
                            role === "superadmin"
                              ? "superadmin"
                              : role === "admin"
                                ? "admin"
                                : "member",
                        };
                      })
                      .filter((participant) => participant.participant_jid),
                    { onConflict: "chat_id,participant_jid" },
                  );
                if (groupParticipantsError) throw groupParticipantsError;
              }
            }
            return json({ ok: true });
          }

          if (event === "GROUP_PARTICIPANTS_UPDATE") {
            const groupId = cleanPhone(data?.id || data?.remoteJid || data?.groupJid);
            const action = String(data?.action || "").toLowerCase();
            const participants: unknown[] = Array.isArray(data?.participants)
              ? (data.participants as unknown[])
              : [data?.participants].filter(Boolean);

            if (groupId) {
              const { data: instData } = await supabaseAdmin
                .from("whatsapp_instances")
                .select("phone")
                .eq("workspace_id", workspaceId)
                .eq("instance_name", instanceName)
                .maybeSingle();
              const myPhone = cleanPhone(instData?.phone);

              const participantJids = participants
                .map((participant: unknown) => {
                  const value =
                    participant && typeof participant === "object"
                      ? (participant as { id?: unknown; jid?: unknown })
                      : {};
                  return String(value.id || value.jid || participant || "");
                })
                .filter(Boolean);
              const { data: groupChat, error: groupChatError } = await supabaseAdmin
                .from("chats")
                .select("id,is_announcement")
                .eq("workspace_id", workspaceId)
                .eq("instance_name", instanceName)
                .eq("phone", groupId)
                .maybeSingle();
              if (groupChatError) throw groupChatError;
              if (groupChat && participantJids.length > 0) {
                if (action === "remove") {
                  const { error: removeError } = await supabaseAdmin
                    .from("group_participants")
                    .delete()
                    .eq("workspace_id", workspaceId)
                    .eq("instance_id", instRow.id)
                    .eq("chat_id", groupChat.id)
                    .in("participant_jid", participantJids);
                  if (removeError) throw removeError;
                } else {
                  const { error: participantsUpdateError } = await supabaseAdmin
                    .from("group_participants")
                    .upsert(
                      participantJids.map((jid: string) => ({
                        workspace_id: workspaceId,
                        instance_id: instRow.id,
                        chat_id: groupChat.id,
                        participant_jid: jid,
                        phone_e164: cleanPhone(jid) || null,
                        role: action === "promote" ? "admin" : "member",
                      })),
                      { onConflict: "chat_id,participant_jid" },
                    );
                  if (participantsUpdateError) throw participantsUpdateError;
                }
              }

              const affectedMe =
                myPhone && participantJids.some((jid: string) => cleanPhone(jid) === myPhone);
              if (affectedMe && groupChat) {
                const permissions = permissionsAfterOwnGroupParticipantUpdate(
                  action,
                  Boolean(groupChat.is_announcement),
                );
                if (permissions) {
                  const { error: ownPermissionsError } = await supabaseAdmin
                    .from("chats")
                    .update({ is_admin: permissions.isAdmin, can_send: permissions.canSend })
                    .eq("workspace_id", workspaceId)
                    .eq("instance_name", instanceName)
                    .eq("phone", groupId);
                  if (ownPermissionsError) throw ownPermissionsError;
                  recordGroupMetadata(workspaceId, instanceName, groupId, permissions);
                }
              }
            }
            return json({ ok: true });
          }

          if (event === "CHATS_SET" || event === "CHATS_UPSERT") {
            const chatsList = evolutionEventRecords(data, "chats");
            for (const c of chatsList) {
              const row = buildChatEventUpsert(c, workspaceId, instanceName, instRow.id);
              if (!row) continue;
              // Campos ausentes no evento ficam fora do upsert para não apagar
              // nomes oficiais e fotos já conhecidos pelo painel.
              const { data: existingChat, error: existingChatError } = await supabaseAdmin
                .from("chats")
                .select("id")
                .eq("workspace_id", workspaceId)
                .eq("instance_id", instRow.id)
                .eq("remote_jid", row["remote_jid"] as string)
                .maybeSingle();
              if (existingChatError) throw existingChatError;
              const { error: chatUpsertError } = await supabaseAdmin
                .from("chats")
                .upsert({ ...row, id: existingChat?.id ?? crypto.randomUUID() } as never, {
                  onConflict: "id",
                });
              if (chatUpsertError) throw chatUpsertError;
            }
            return json({ ok: true });
          }

          if (event === "CHATS_DELETE") {
            const deletedChats = Array.isArray(data) ? data : [data];
            for (const deleted of deletedChats) {
              const phone = cleanPhone(
                deleted?.id || deleted?.remoteJid || deleted?.key?.remoteJid,
              );
              if (!phone) continue;
              const { error: archiveError } = await supabaseAdmin
                .from("chats")
                .update({ archived: true })
                .eq("workspace_id", workspaceId)
                .eq("instance_name", instanceName)
                .eq("phone", phone);
              if (archiveError) throw archiveError;
            }
            return json({ ok: true });
          }

          if (event === "MESSAGES_UPDATE" || event === "SEND_MESSAGE_UPDATE") {
            // Edits and revocations are also carried by messages.update in some
            // Evolution versions. Applying only delivery ACKs loses these changes.
            for (const edit of collectEvolutionEdits(data)) {
              const result = await editMessageByExternalId(
                workspaceId,
                edit.externalId,
                edit.text,
                instRow.id,
              );
              if (result?.error) throw result.error;
            }
            for (const id of collectEvolutionDeletes(data)) {
              const result = await deleteMessageByExternalId(workspaceId, id, instRow.id);
              if (result?.error) throw result.error;
            }
            // Atualiza o status real de entrega/leitura vindo do WhatsApp
            for (const { externalId, status, previousStatuses } of collectEvolutionDeliveryUpdates(
              data,
            )) {
              // Compare-and-set: a late SENT/DELIVERED callback must not lower
              // a message that has already reached READ. SQL enforces this even
              // if two workers process callbacks concurrently.
              const { data: updatedMessages, error: statusError } = await supabaseAdmin
                .from("messages")
                .update({ status })
                .eq("workspace_id", workspaceId)
                .eq("external_id", externalId)
                .eq("instance_id", instRow.id)
                .in("status", previousStatuses)
                .select("id,chat_id,sender");
              // Without this check the queue would mark the event completed even
              // when Postgres was unavailable, silently losing delivery receipts.
              if (statusError) throw statusError;

              // A READ receipt generated by the operator's WhatsApp is also a
              // remote confirmation that an inbound message was seen. Recompute
              // that chat's unread count from the instance-scoped rows instead
              // of decrementing blindly: duplicate/out-of-order receipts then
              // remain idempotent and cannot affect another tenant/connection.
              if (status === "read") {
                const changed = updatedMessages?.find((message) => message.sender === "client");
                if (changed?.sender === "client" && changed.chat_id) {
                  const now = new Date().toISOString();
                  const { error: readAtError } = await supabaseAdmin
                    .from("messages")
                    .update({ read_local_at: now })
                    .eq("id", changed.id)
                    .eq("workspace_id", workspaceId)
                    .eq("instance_id", instRow.id)
                    .is("read_local_at", null);
                  if (readAtError) throw readAtError;

                  const { count: unreadCount, error: unreadCountError } = await supabaseAdmin
                    .from("messages")
                    .select("id", { count: "exact", head: true })
                    .eq("workspace_id", workspaceId)
                    .eq("instance_id", instRow.id)
                    .eq("chat_id", changed.chat_id)
                    .eq("sender", "client")
                    .neq("status", "read");
                  if (unreadCountError) throw unreadCountError;

                  const { error: unreadUpdateError } = await supabaseAdmin
                    .from("chats")
                    .update({ unread: Math.max(0, unreadCount ?? 0) })
                    .eq("id", changed.chat_id)
                    .eq("workspace_id", workspaceId)
                    .eq("instance_id", instRow.id);
                  if (unreadUpdateError) throw unreadUpdateError;
                }
              }
            }
            return json({ ok: true });
          }

          if (
            event === "CONTACTS_SET" ||
            event === "CONTACTS_UPSERT" ||
            event === "CONTACTS_UPDATE"
          ) {
            const contacts = evolutionEventRecords(data, "contacts");
            for (const c of contacts) {
              const row = buildEvolutionContactRow(c, workspaceId, instRow.id, instanceName);
              if (!row) continue;
              const { error: contactError } = await supabaseAdmin
                .from("whatsapp_contacts")
                .upsert(row as never, { onConflict: WHATSAPP_CONTACTS_ON_CONFLICT });
              if (contactError) throw contactError;
              const phone = typeof row["phone"] === "string" ? row["phone"] : "";
              const savedName = typeof row["saved_name"] === "string" ? row["saved_name"] : null;
              const pushName = typeof row["push_name"] === "string" ? row["push_name"] : null;
              const pic =
                typeof row["profile_pic_url"] === "string" ? row["profile_pic_url"] : null;
              if (!phone) continue;
              const patch: { name?: string; profile_pic_url?: string } = {};
              if (savedName || pushName) {
                const { data: existingChat, error: existingChatError } = await supabaseAdmin
                  .from("chats")
                  .select("name,is_group")
                  .eq("workspace_id", workspaceId)
                  .eq("instance_name", instanceName)
                  .eq("phone", phone)
                  .maybeSingle();
                if (existingChatError) throw existingChatError;
                const existingChatName = String(existingChat?.name ?? "").trim();
                const genericName =
                  !existingChatName ||
                  existingChatName === "Contato" ||
                  existingChatName === "Grupo WhatsApp" ||
                  existingChatName.startsWith("+") ||
                  /^\d+$/.test(existingChatName.replace(/\D/g, ""));
                // The agenda name is authoritative. A later push_name event may
                // update metadata, but must never overwrite a saved contact name.
                if (savedName || genericName) patch.name = savedName || pushName || "";
              }
              if (pic) patch.profile_pic_url = pic;
              if (Object.keys(patch).length > 0) {
                const { error: contactChatError } = await supabaseAdmin
                  .from("chats")
                  .update(patch)
                  .eq("workspace_id", workspaceId)
                  .eq("instance_name", instanceName)
                  .eq("phone", phone);
                if (contactChatError) throw contactChatError;
              }
            }
            try {
              const { syncCrmLeadsFromWhatsApp } =
                await import("@/server/product/crm-contact-sync.server");
              await syncCrmLeadsFromWhatsApp(workspaceId, {
                instanceId: instRow.id,
                instanceName,
              });
            } catch (crmError) {
              logServerWarning("[evolution-webhook] CRM contact import deferred", crmError);
            }
            return json({ ok: true });
          }

          if (event === "CALL") {
            const calls = Array.isArray(data) ? data : [data];
            for (const call of calls) {
              const status = String(call?.status || "").toLowerCase();
              if (status === "offer" || status === "timeout" || status === "reject") {
                const phone = cleanPhone(call?.from || call?.sender);
                if (phone) {
                  const isVideo = Boolean(call?.isVideo);
                  const result = await persistMessage({
                    workspaceId,
                    instanceName,
                    phone,
                    sender: "client",
                    type: "text",
                    text: isVideo ? "[Chamada de vídeo perdida]" : "[Chamada de voz perdida]",
                    incrementUnread: true,
                  });
                  if (result?.error) throw new Error(result.error);
                }
              }
            }
            return json({ ok: true });
          }

          if (event !== "MESSAGES_UPSERT" && event !== "SEND_MESSAGE") {
            return json({ ok: true, ignored: event });
          }

          const items = Array.isArray(data)
            ? data
            : Array.isArray(data?.messages)
              ? data.messages
              : [data];
          if (
            event === "MESSAGES_UPSERT" &&
            (String(instRow.status ?? "").toLowerCase() !== "open" ||
              String(instRow.connection_state ?? "").toLowerCase() !== "connected")
          ) {
            return json({ ok: true, ignored: "instance-not-connected" }, 202);
          }
          // Uma mensagem nova pode chegar antes do catálogo de contatos. Busca
          // a foto apenas para os remetentes visíveis neste lote, no máximo uma
          // vez por instância/telefone, sem reimportar histórico.
          const liveAvatarJobs = new Map<string, Promise<void>>();

          for (const item of items) {
            if (
              event === "MESSAGES_UPSERT" &&
              !isEvolutionMessageAfterConnection(
                item?.messageTimestamp ?? item?.createdAt,
                instRow.connected_at,
              )
            ) {
              continue;
            }
            const key = item?.key ?? {};
            const message = unwrapMessage(item?.message ?? {});

            // Intercepta Mensagem Apagada (protocolMessage type 0 / REVOKE)
            if (
              message?.protocolMessage?.type === 0 ||
              message?.protocolMessage?.type === "REVOKE"
            ) {
              const targetId = message.protocolMessage.key?.id;
              if (targetId) {
                const result = await deleteMessageByExternalId(workspaceId, targetId, instRow.id);
                if (result?.error) throw result.error;
                continue;
              }
            }

            // Intercepta Mensagem Editada (protocolMessage type 14)
            if (message?.protocolMessage?.type === 14 || message?.protocolMessage?.editedMessage) {
              const targetId = message.protocolMessage.key?.id;
              const newText = extractText(message.protocolMessage.editedMessage || {});
              if (targetId && newText) {
                const result = await editMessageByExternalId(
                  workspaceId,
                  targetId,
                  newText,
                  instRow.id,
                );
                if (result?.error) throw result.error;
                continue;
              }
            }

            // Intercepta Reação (reactionMessage)
            if (message?.reactionMessage) {
              const targetId = message.reactionMessage.key?.id;
              const emoji = message.reactionMessage.text || "";
              const senderPhone = cleanPhone(key.participant || key.remoteJid);
              if (targetId) {
                const result = await addReactionToMessage(
                  workspaceId,
                  targetId,
                  emoji,
                  senderPhone,
                  instRow.id,
                );
                if (result?.error) throw result.error;
                continue;
              }
            }

            const isGroup = Boolean(key.remoteJid?.endsWith("@g.us"));
            const fromMe = Boolean(key.fromMe);

            // Em mensagens enviadas pelo próprio usuário (fromMe = true), o remoteJid é SEMPRE o contato/grupo de destino
            let phone =
              isGroup || fromMe
                ? cleanPhone(key.remoteJid)
                : cleanPhone(key.remoteJidAlt || key.remoteJid);

            // Resolução de LID: Se não for grupo e o telefone for um LID (ex: 15 dígitos) ou inválido, busca o telefone real E.164
            if (!isGroup && !isValidPhone(phone)) {
              const rawJid = String(key.remoteJid || key.remoteJidAlt || "");
              const { data: lidContact } = await supabaseAdmin
                .from("whatsapp_contacts")
                .select("phone, alternate_jid")
                .eq("workspace_id", workspaceId)
                .eq("instance_name", instanceName)
                .or(
                  `remote_jid.eq.${rawJid},remote_jid.eq.${phone}@lid,remote_jid.ilike.%${phone}%,alternate_jid.ilike.%${phone}%`,
                )
                .limit(1)
                .maybeSingle();

              if (lidContact?.phone && isValidPhone(lidContact.phone)) {
                phone = lidContact.phone;
              } else if (lidContact?.alternate_jid) {
                const altClean = cleanPhone(lidContact.alternate_jid);
                if (isValidPhone(altClean)) phone = altClean;
              }

              // Fallback: se ainda não resolveu, tenta sincronização pontual de contatos com Evolution
              if (!isValidPhone(phone)) {
                try {
                  const { syncContacts } = await import("@/server/evolution/sync-engine");
                  await syncContacts(instanceName, workspaceId);
                  const { data: retryContact } = await supabaseAdmin
                    .from("whatsapp_contacts")
                    .select("phone")
                    .eq("workspace_id", workspaceId)
                    .eq("instance_name", instanceName)
                    .or(
                      `remote_jid.eq.${rawJid},remote_jid.eq.${phone}@lid,remote_jid.ilike.%${phone}%`,
                    )
                    .limit(1)
                    .maybeSingle();
                  if (retryContact?.phone && isValidPhone(retryContact.phone)) {
                    phone = retryContact.phone;
                  }
                } catch {
                  // Fallback silencioso
                }
              }
            }

            if (!phone) continue;

            // Ignora mensagens de broadcast / status
            if (isBroadcastOrStatus(key.remoteJid)) continue;

            // Para contatos individuais, valida que o telefone é E.164 plausível
            if (!isGroup && !isValidPhone(phone)) continue;

            const info = extractMediaInfo(message);
            const text = extractText(message);

            let mediaUrl: string | null = null;
            if (info.kind) {
              // Prefere o base64 já enviado pelo webhook; senão busca na Evolution API
              let base64: string | null = extractMediaBase64(item);
              if (!base64 && key.id) {
                const fetched = await evolutionFetch<unknown>(
                  `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
                  {
                    method: "POST",
                    body: {
                      message: {
                        key: {
                          id: key.id,
                          remoteJid: key.remoteJid || undefined,
                          fromMe: Boolean(key.fromMe),
                        },
                      },
                      convertToMp4: false,
                    },
                  },
                );
                base64 = extractMediaBase64(fetched.data);
              }
              if (base64) {
                const stored = await storeBase64Media(
                  base64,
                  info.mimetype,
                  info.fileName,
                  workspaceId,
                );
                mediaUrl = stored.url;
              }
            }

            let senderPhone: string | null = null;
            let senderAvatar: string | null = null;
            let persistedContactName: string | null = null;
            if (isGroup && !fromMe) {
              const candidates = [
                key.participantAlt,
                key.participant,
                item.participant,
                item.sender,
                key.remoteJidAlt,
              ].filter(Boolean);

              // 1. Prioriza candidato com @s.whatsapp.net (JID telefônico padrão)
              for (const c of candidates) {
                const str = String(c);
                if (str.includes("@s.whatsapp.net")) {
                  const cleaned = cleanPhone(str);
                  if (cleaned) {
                    senderPhone = cleaned;
                    break;
                  }
                }
              }

              // 2. Se não encontrou, busca qualquer candidato que não seja @lid
              if (!senderPhone) {
                for (const c of candidates) {
                  const str = String(c);
                  if (!str.includes("@lid")) {
                    const cleaned = cleanPhone(str);
                    if (cleaned && cleaned.length >= 8 && cleaned.length <= 15) {
                      senderPhone = cleaned;
                      break;
                    }
                  }
                }
              }

              // 3. Fallback: extrai do primeiro identificador disponível
              if (!senderPhone && candidates.length > 0) {
                const rawIdentity = String(candidates[0]);
                const { data: contactByJid } = await supabaseAdmin
                  .from("whatsapp_contacts")
                  .select("phone, saved_name, push_name, profile_pic_url")
                  .eq("workspace_id", workspaceId)
                  .eq("instance_name", instanceName)
                  .eq("remote_jid", rawIdentity)
                  .maybeSingle();
                senderPhone = contactByJid?.phone || null;
                persistedContactName = contactByJid?.saved_name || contactByJid?.push_name || null;
                senderAvatar = contactByJid?.profile_pic_url || null;
              }
            }

            const rawPushName =
              item?.pushName ?? item?.senderName ?? item?.message?.pushName ?? null;
            const savedContactName = senderPhone
              ? await resolveContactSavedName(workspaceId, instanceName, senderPhone)
              : null;
            const senderName = fromMe
              ? null
              : persistedContactName || savedContactName || rawPushName || senderPhone || null;

            const quoted = extractQuotedMessage(message, item);

            const groupMeta = isGroup ? getGroupMetadata(workspaceId, instanceName, phone) : null;
            const chatName = isGroup
              ? (groupMeta?.subject ?? null)
              : fromMe
                ? null
                : (item?.pushName ?? null);

            const persisted = await persistMessage({
              workspaceId,
              instanceName,
              phone,
              name: chatName,
              sender: fromMe ? "agent" : "client",
              senderName,
              senderPhone,
              senderAvatar,
              quotedMessage: quoted,
              type: info.kind ?? (info.mimetype ? mediaTypeFromMime(info.mimetype) : "text"),
              text,
              mediaUrl,
              mediaMimetype: info.mimetype,
              mediaFilename: info.fileName,
              mediaDuration: info.duration,
              externalId: key.id ?? null,
              incrementUnread: shouldIncrementUnread(event, fromMe),
              isGroup,
              remoteJid: String(key.remoteJid || key.remoteJidAlt || "") || null,
              identityKind: isGroup
                ? "group"
                : String(key.remoteJid || "").endsWith("@lid") && !isValidPhone(phone)
                  ? "lid"
                  : "phone",
              createdAt: item?.messageTimestamp ?? item?.createdAt ?? null,
            });

            if (persisted?.error) throw new Error(persisted.error);

            if (!fromMe && senderPhone && !senderAvatar) {
              const avatarKey = `${instRow.id}:${senderPhone}`;
              if (!liveAvatarJobs.has(avatarKey)) {
                const avatarJob = (async () => {
                  try {
                    const signal =
                      typeof AbortSignal.timeout === "function"
                        ? AbortSignal.timeout(2500)
                        : undefined;
                    const picture = await fetchContactProfilePicture(
                      instanceName,
                      senderPhone,
                      false,
                      signal,
                      workspaceId,
                    );
                    if (!picture) return;

                    const remoteJid = `${senderPhone}@s.whatsapp.net`;
                    const { data: existingContacts, error: contactLookupError } =
                      await supabaseAdmin
                        .from("whatsapp_contacts")
                        .select("id")
                        .eq("workspace_id", workspaceId)
                        .eq("instance_id", instRow.id)
                        .eq("phone", senderPhone)
                        .limit(1);
                    if (contactLookupError) throw contactLookupError;

                    const existingContactId = existingContacts?.[0]?.id;
                    const contactWrite = existingContactId
                      ? supabaseAdmin
                          .from("whatsapp_contacts")
                          .update({
                            profile_pic_url: picture,
                            updated_at: new Date().toISOString(),
                          })
                          .eq("id", existingContactId)
                          .eq("workspace_id", workspaceId)
                          .eq("instance_id", instRow.id)
                      : supabaseAdmin.from("whatsapp_contacts").upsert(
                          {
                            workspace_id: workspaceId,
                            instance_id: instRow.id,
                            instance_name: instanceName,
                            remote_jid: remoteJid,
                            phone: senderPhone,
                            identity_kind: "phone",
                            profile_pic_url: picture,
                            updated_at: new Date().toISOString(),
                          },
                          { onConflict: WHATSAPP_CONTACTS_ON_CONFLICT },
                        );
                    const { error: contactError } = await contactWrite;
                    if (contactError) throw contactError;

                    if (key.id) {
                      const { error: messageError } = await supabaseAdmin
                        .from("messages")
                        .update({ sender_avatar: picture })
                        .eq("workspace_id", workspaceId)
                        .eq("instance_id", instRow.id)
                        .eq("external_id", key.id);
                      if (messageError) throw messageError;
                    }

                    if (isGroup) {
                      const { error: participantError } = await supabaseAdmin
                        .from("group_participants")
                        .update({ profile_pic_url: picture })
                        .eq("workspace_id", workspaceId)
                        .eq("instance_id", instRow.id)
                        .eq("phone_e164", senderPhone);
                      if (participantError) throw participantError;
                    } else {
                      const { error: chatError } = await supabaseAdmin
                        .from("chats")
                        .update({ profile_pic_url: picture })
                        .eq("workspace_id", workspaceId)
                        .eq("instance_id", instRow.id)
                        .eq("instance_name", instanceName)
                        .eq("phone", phone);
                      if (chatError) throw chatError;
                    }
                  } catch {
                    // A missing/expired provider photo must not fail the message.
                  }
                })();
                liveAvatarJobs.set(avatarKey, avatarJob);
              }
            }

            if (key.id && isGifMedia(message, info.mimetype, info.fileName)) {
              const { error: gifError } = await supabaseAdmin
                .from("messages")
                .update({ is_gif: true })
                .eq("workspace_id", workspaceId)
                .eq("instance_id", instRow.id)
                .eq("external_id", key.id);
              if (gifError) throw gifError;
            }

            if (
              isFreshEvolutionInboundMessage(
                event,
                fromMe,
                item?.messageTimestamp ?? item?.createdAt,
              ) &&
              !persisted?.duplicated &&
              persisted?.chatId &&
              persisted?.message &&
              typeof persisted.message === "object" &&
              "id" in persisted.message &&
              typeof persisted.message.id === "string" &&
              typeof text === "string" &&
              text.trim()
            ) {
              await maybeRunAutomaticAgent({
                workspaceId,
                instanceId: instRow.id,
                chatId: persisted.chatId,
                messageId: persisted.message.id,
                messageText: text,
                remoteJid: String(key.remoteJid || key.remoteJidAlt || ""),
                phoneE164: isGroup ? null : phone,
                isGroup,
                fromMe,
              });
            }
            if (fromMe && key.id) {
              const { error: outboundConfirmError } = await supabaseAdmin
                .from("outbound_messages")
                .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
                .eq("workspace_id", workspaceId)
                .eq("instance_id", instRow.id)
                .eq("external_id", key.id);
              if (outboundConfirmError) throw outboundConfirmError;
            }
          }

          if (liveAvatarJobs.size > 0) {
            await Promise.allSettled([...liveAvatarJobs.values()].slice(0, 3));
          }

          return json({ ok: true });
        } catch (err: unknown) {
          logServerError("[webhook evolution] request failed", err);
          return json({ ok: false, error: "Erro interno ao processar o evento" }, 500);
        }
      },
    },
  },
});
