/** Regressions from read-only inspection of InboxOS production Supabase, 2026-10-02.
 * These are offline contract/fixture checks, NOT tests against a live Evolution instance.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { normalizeTimestamp } from "../src/server/evolution/normalize-message.ts";
import {
  WHATSAPP_CONTACTS_ON_CONFLICT,
  WHATSAPP_PRESENCE_ON_CONFLICT,
} from "../src/server/evolution/schema-contract.ts";
import {
  buildEvolutionContactRow,
  collectEvolutionDeletes,
  collectEvolutionEdits,
  evolutionEventRecords,
  isEvolutionMessageAfterConnection,
  isFreshEvolutionInboundMessage,
  isHistoricalEvolutionEvent,
  nextEvolutionConnectionAt,
} from "../src/server/evolution/event-contract.ts";
import {
  decideOutboundAttempt,
  isAmbiguousEvolutionSendFailure,
} from "../src/server/evolution/outbound-policy.ts";

const base = new URL("../src/", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, base), "utf8");

test("Vercel runtime uses Nitro adapter for TanStack Start server routes", () => {
  const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  const vercelConfig = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
  assert.match(viteConfig, /from ["']nitro\/vite["']/);
  assert.match(viteConfig, /nitro\(\)/);
  assert.match(vercelConfig, /"framework"\s*:\s*"tanstack-start"/);
});

test("Vercel webhook never falls back to inline processing after worker dispatch failure", () => {
  const webhook = source("routes/api/public/webhooks/evolution.ts");
  assert.match(webhook, /invokeVercelEvolutionBackground\(/);
  assert.match(webhook, /provider: "vercel-recovery"/);
  assert.doesNotMatch(
    webhook,
    /invokeVercelEvolutionBackground\([\s\S]*?background invocation failed[\s\S]*?inlineEnv[\s\S]*?consumeEvolutionQueueMessage/,
  );
});

test("internal Evolution queue replays do not consume the external webhook rate limit", () => {
  const webhook = source("routes/api/public/webhooks/evolution.ts");
  assert.match(
    webhook,
    /const isQueueConsumer = request\.headers\.get\("x-inbox-queue-consumer"\) === "1"/,
  );
  assert.match(
    webhook,
    /if \(!isQueueConsumer\) \{[\s\S]*?consumeEvolutionWebhookRateLimit\(request\)/,
  );
  assert.match(webhook, /verifyEvolutionQueueConsumerRequest\(request, rawBody\)/);
});

// This actual UNIQUE contract was read from pg_constraint/pg_indexes, not guessed.
test("contact upsert matches the actual Supabase (workspace_id,instance_id,remote_jid) UNIQUE", () => {
  assert.equal(WHATSAPP_CONTACTS_ON_CONFLICT, "workspace_id,instance_id,remote_jid");
  for (const file of [
    "routes/api/public/webhooks/evolution.ts",
    "routes/api/sync/import.ts",
    "server/evolution/sync-engine.ts",
  ]) {
    const content = source(file);
    assert.match(content, /WHATSAPP_CONTACTS_ON_CONFLICT/);
    assert.doesNotMatch(content, /onConflict:\s*["']workspace_id,instance_name,remote_jid["']/);
  }
});
test("contact insert records always carry a registered instance_id", () => {
  const webhook = source("routes/api/public/webhooks/evolution.ts");
  assert.match(webhook, /buildEvolutionContactRow\(c, workspaceId, instRow\.id, instanceName\)/);
  assert.match(source("routes/api/sync/import.ts"), /instance_id:\s*instance\.id/);
  assert.match(source("server/evolution/sync-engine.ts"), /instance_id:\s*instance\.id/);
});
test("presence upsert uses the actual live UNIQUE with instance_id, not instance_name", () => {
  assert.equal(WHATSAPP_PRESENCE_ON_CONFLICT, "workspace_id,instance_id,phone");
  const webhook = source("routes/api/public/webhooks/evolution.ts");
  assert.match(webhook, /from\("whatsapp_presence"\)\.upsert\(/);
  assert.match(webhook, /instance_id:\s*instRow\.id/);
  assert.match(webhook, /onConflict:\s*WHATSAPP_PRESENCE_ON_CONFLICT/);
  assert.match(webhook, /if \(presenceError\) throw presenceError/);
});
test("presence snapshots carry the canonical instance id for collision-free client keys", () => {
  const events = source("routes/api/events/index.ts");
  const realtime = source("lib/realtimeSocket.ts");
  const presence = source("features/inbox/hooks/usePresence.ts");
  assert.match(events, /\.from\("whatsapp_presence"\)/);
  assert.match(events, /\.select\("phone,state,updated_at,instance_id,instance_name"\)/);
  assert.match(realtime, /instance_id\?: string \| null/);
  assert.match(
    presence,
    /function presenceKey\(phone: string, instanceName\?: string \| null, instanceId\?: string \| null\)/,
  );
  assert.match(presence, /presenceKey\(normalizedPhone, normalizedInstance, instanceId\)/);
  assert.match(presence, /row\.instance_id \?\? undefined/);
  assert.match(source("routes/api/chats/index.ts"), /instanceId: chat\.instance_id/);
});
test("Evolution v2 contact arrays and single-object updates normalize without losing events", () => {
  const contacts = [
    { remoteJid: "5511999999999@s.whatsapp.net" },
    { remoteJid: "5511888888888@s.whatsapp.net" },
  ];
  assert.deepEqual(evolutionEventRecords({ contacts }, "contacts"), contacts);
  assert.deepEqual(evolutionEventRecords(contacts, "contacts"), contacts);
  assert.deepEqual(evolutionEventRecords(contacts[0], "contacts"), [contacts[0]]);
  assert.deepEqual(evolutionEventRecords(null, "contacts"), []);
  assert.deepEqual(evolutionEventRecords(false, "contacts"), []);
});
test("Evolution CHATS_UPSERT accepts both single object and array", () => {
  const chat = { id: "5511999999999@s.whatsapp.net", name: "Contato" };
  assert.deepEqual(evolutionEventRecords(chat, "chats"), [chat]);
  assert.deepEqual(evolutionEventRecords({ chats: [chat] }, "chats"), [chat]);
  assert.match(
    source("routes/api/public/webhooks/evolution.ts"),
    /evolutionEventRecords\(data, "chats"\)/,
  );
});
test("incremental contact update must not erase previously stored name and image", () => {
  const row = buildEvolutionContactRow(
    { remoteJid: "5511999999999@s.whatsapp.net", pushName: "Maria" },
    "ws",
    "instance-uuid",
    "instance-name",
  );
  assert.equal(row?.push_name, "Maria");
  assert.equal(row?.instance_id, "instance-uuid");
  assert.equal(row?.phone, "5511999999999");
  assert.ok(!("saved_name" in (row ?? {})));
  assert.ok(!("profile_pic_url" in (row ?? {})));
});
test("@lid is never presented as a real phone even with valid-looking digits", () => {
  const row = buildEvolutionContactRow({ remoteJid: "12345678901@lid" }, "ws", "inst", "name");
  assert.equal(row?.identity_kind, "lid");
  assert.ok(!("phone" in (row ?? {})));
  const withPhone = buildEvolutionContactRow(
    { remoteJid: "12345678901@lid", remoteJidAlt: "5511999999999@s.whatsapp.net" },
    "ws",
    "inst",
    "name",
  );
  assert.equal(withPhone?.phone, "5511999999999");
});
test("nested Evolution v2 edited message updates preserve actual new text", () => {
  const nested = [
    {
      key: { id: "m-7" },
      update: { message: { editedMessage: { message: { conversation: "Texto atualizado" } } } },
    },
  ];
  assert.deepEqual(collectEvolutionEdits(nested), [
    { externalId: "m-7", text: "Texto atualizado" },
  ]);
  assert.deepEqual(
    collectEvolutionEdits({ key: { id: "m-8" }, editedMessage: { conversation: "Corrigido" } }),
    [{ externalId: "m-8", text: "Corrigido" }],
  );
  assert.deepEqual(
    collectEvolutionEdits({ key: { id: "m-9" }, update: { message: { editedMessage: {} } } }),
    [],
  );
});
test("ordinary MESSAGES_UPDATE must never be mislabeled as an edited message", () => {
  const update = {
    key: { id: "normal-message" },
    status: "DELIVERED",
    message: { conversation: "Text not edited" },
  };
  assert.deepEqual(collectEvolutionEdits(update), []);
  assert.deepEqual(collectEvolutionEdits(update, true), [
    { externalId: "normal-message", text: "Text not edited" },
  ]);
  assert.match(
    source("routes/api/public/webhooks/evolution.ts"),
    /collectEvolutionEdits\(data, true\)/,
  );
});
test("deleted MESSAGES_UPDATE events are tracked without inventing a body", () => {
  assert.deepEqual(
    collectEvolutionDeletes([
      { key: { id: "x" }, status: "DELETED" },
      { keyId: "y", deleted: true },
      { keyId: "z", status: "DELIVERY_ACK" },
    ]),
    ["x", "y"],
  );
});
test("replay/backlog MESSAGES_UPSERT cannot trigger an automatic agent", () => {
  const now = Date.now();
  assert.equal(
    isFreshEvolutionInboundMessage(
      "MESSAGES_UPSERT",
      false,
      Math.floor((now - 86_400_000) / 1000),
      now,
    ),
    false,
  );
  assert.equal(
    isFreshEvolutionInboundMessage("MESSAGES_SET", false, Math.floor(now / 1000), now),
    false,
  );
  assert.equal(
    isFreshEvolutionInboundMessage("MESSAGES_UPSERT", true, Math.floor(now / 1000), now),
    false,
  );
  assert.equal(isFreshEvolutionInboundMessage("MESSAGES_UPSERT", false, null, now), false);
  assert.equal(
    isFreshEvolutionInboundMessage("MESSAGES_UPSERT", false, Math.floor(now / 1000), now),
    true,
  );
  assert.equal(
    isFreshEvolutionInboundMessage(
      "MESSAGES_UPSERT",
      false,
      Math.floor((now + 180_000) / 1000),
      now,
    ),
    false,
  );
});
test("Evolution v2 read endpoints use the provider HTTP contract", () => {
  const engine = source("server/evolution/sync-engine.ts");
  assert.match(engine, /findContacts\/\$\{encodedName\}[\s\S]{0,180}method: "POST"/);
  assert.match(
    engine,
    /fetchAllGroups\/\$\{encodeURIComponent\(instanceName\)\}\?getParticipants=/,
  );
});
test("contact sync falls back to the working chats endpoint when the provider contact catalog is unavailable", () => {
  const engine = source("server/evolution/sync-engine.ts");
  assert.match(engine, /const encodedName = encodeURIComponent\(instanceName\)/);
  assert.match(engine, /findContacts\/\$\{encodedName\}/);
  assert.match(engine, /findChats\/\$\{encodedName\}/);
  assert.match(engine, /root\?\.\["contacts"\][\s\S]*root\?\.\["chats"\]/);
  assert.match(engine, /isGroupJid/);
});
test("contact reconciliation writes remain scoped to the workspace and instance", () => {
  const engine = source("server/evolution/sync-engine.ts");
  assert.match(
    engine,
    /\.update\(chatUpdate\)[\s\S]{0,180}\.eq\("workspace_id", workspaceId\)[\s\S]{0,100}\.eq\("instance_name", instanceName\)/,
  );
  assert.match(
    engine,
    /\.update\(\{ chat_id: existingChat\.id \}\)[\s\S]{0,180}\.eq\("workspace_id", workspaceId\)[\s\S]{0,100}\.eq\("instance_id", instance\.id\)/,
  );
  assert.match(
    engine,
    /\.delete\(\)[\s\S]{0,160}\.eq\("workspace_id", workspaceId\)[\s\S]{0,100}\.eq\("instance_name", instanceName\)/,
  );
});
test("contact reconciliation uses the real instance key for message relinking", () => {
  const engine = source("server/evolution/sync-engine.ts");
  assert.match(
    engine,
    /\.update\(\{ chat_id: existingChat\.id \}[\s\S]{0,180}\.eq\("workspace_id", workspaceId\)[\s\S]{0,100}\.eq\("instance_id", instance\.id\)/,
  );
});
test("message identity is scoped to the Evolution instance", () => {
  const evolution = source("lib/evolution.server.ts");
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261012133000_instance_scoped_message_identity.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    evolution,
    /\.eq\("instance_id", instanceIdentity\.id\)[\s\S]{0,100}\.eq\("external_id", input\.externalId\)/,
  );
  assert.match(migration, /idx_messages_workspace_instance_external/);
  assert.match(migration, /and instance_id = v_instance_id/);
  assert.doesNotMatch(
    migration,
    /where workspace_id = p_workspace_id\s+and external_id = p_external_id/,
  );
});
test("historical set events are ignored and live upserts honor the connection cutoff", () => {
  assert.equal(isHistoricalEvolutionEvent("MESSAGES_SET"), true);
  assert.equal(isHistoricalEvolutionEvent("CHATS_SET"), true);
  assert.equal(isHistoricalEvolutionEvent("MESSAGING_HISTORY_SET"), true);
  assert.equal(isHistoricalEvolutionEvent("MESSAGES_UPSERT"), false);
  const connectedAt = "2026-10-12T12:00:00.000Z";
  const connectedSeconds = Date.parse(connectedAt) / 1000;
  assert.equal(isEvolutionMessageAfterConnection(connectedSeconds - 1, connectedAt), false);
  assert.equal(isEvolutionMessageAfterConnection(connectedSeconds, connectedAt), true);
  assert.equal(isEvolutionMessageAfterConnection("2026-10-12T12:00:01.000Z", connectedAt), true);
  assert.equal(isEvolutionMessageAfterConnection(null, connectedAt), false);
  assert.equal(isEvolutionMessageAfterConnection(connectedSeconds, null), false);
});

test("reconnection advances the live message cutoff without moving it on duplicate open events", () => {
  const old = "2026-10-12T10:00:00.000Z";
  const now = "2026-10-12T11:00:00.000Z";
  assert.equal(nextEvolutionConnectionAt("disconnected", "open", old, now), now);
  assert.equal(nextEvolutionConnectionAt("open", "open", old, now), old);
  assert.equal(nextEvolutionConnectionAt("open", "close", old, now), null);
});

test("message webhooks cannot infer an open connection or advance its epoch", () => {
  const sourceText = source("routes/api/public/webhooks/evolution.ts");
  assert.doesNotMatch(
    sourceText,
    /event === "MESSAGES_UPSERT"[\s\S]{0,180}update\(\{ status: "open"/,
  );
  assert.match(
    sourceText,
    /nextEvolutionConnectionAt\(\s*instRow\.status\s*,\s*state\s*,\s*instRow\.connected_at\s*,\s*now\s*,?\s*\)/,
  );
});

test("connection ingress advances the cutoff before queue dispatch", () => {
  const sourceText = source("routes/api/public/webhooks/evolution.ts");
  const ingress = sourceText.indexOf('if (!isQueueConsumer && event === "CONNECTION_UPDATE")');
  const queueDispatch = sourceText.indexOf("if (!isQueueConsumer) {", ingress);
  assert.ok(ingress >= 0, "connection ingress update must exist");
  assert.ok(queueDispatch > ingress, "queue dispatch must happen after ingress cutoff");
  assert.match(
    sourceText.slice(ingress, queueDispatch),
    /\.from\("whatsapp_instances"\)\s*\n\s*\.update\(/,
  );
  assert.match(sourceText.slice(ingress, queueDispatch), /\.eq\("workspace_id", workspaceId\)/);
});

test("normal Evolution sync never imports historical messages", () => {
  const syncRoute = source("routes/api/sync/evolution.ts");
  const syncEngine = source("server/evolution/sync-engine.ts");
  const conversations = source("features/inbox/hooks/useConversations.ts");
  assert.doesNotMatch(syncRoute, /syncRecentMessages/);
  assert.doesNotMatch(syncRoute, /phase === ["']messages["']/);
  assert.match(
    syncEngine,
    /const liveRecords = records\.filter[\s\S]{0,500}isEvolutionMessageAfterConnection/,
  );
  assert.match(syncEngine, /record\?\.messageTimestamp/);
  assert.doesNotMatch(conversations, /["']messages["']/);
});

test("Evolution instance deletion/disconnect purges only the scoped instance data", () => {
  const lifecycle = source("server/evolution/instance-lifecycle.ts");
  const instancesRoute = source("routes/api/instances/index.ts");
  const webhook = source("routes/api/public/webhooks/evolution.ts");
  assert.match(
    lifecycle,
    /export function providerInstanceNames\(payload: unknown\): Set<string> \| null/,
  );
  assert.match(lifecycle, /return null;/);
  assert.match(lifecycle, /isProviderDisconnectedState/);
  assert.match(lifecycle, /\.eq\("workspace_id", workspaceId\)/);
  assert.match(lifecycle, /\.eq\("instance_id", instanceId\)/);
  assert.match(instancesRoute, /res\.ok \? providerInstanceNames\(res\.data\) : null/);
  assert.match(instancesRoute, /if \(liveNames && !liveNames\.has\(saved\.instance_name\)\)/);
  assert.match(instancesRoute, /purgeInstanceData\(supabaseAdmin/);
  assert.match(webhook, /isProviderDisconnectedState\(normalizedState\)/);
  assert.match(webhook, /instanceRemoved: !cleanup\.retained/);
  assert.match(webhook, /retained: cleanup\.retained/);
});

test("chat list distinguishes CRM leads from personal contacts within the workspace", () => {
  const route = source("routes/api/chats/index.ts");
  const types = source("features/inbox/types.ts");
  const conversations = source("features/inbox/hooks/useConversations.ts");
  assert.match(route, /from\(['"]crm_leads['"]\)/);
  assert.match(route, /select\(['"]id,chat_id,contact_id['"]\)/);
  assert.match(route, /leadByContact/);
  assert.match(route, /contactCategory/);
  assert.match(
    types,
    /audienceFilter\?\s*:\s*['"]all['"]\s*\|\s*['"]leads['"]\s*\|\s*['"]personal['"]/,
  );
  assert.match(conversations, /filters\.audienceFilter === ["']leads["']/);
  assert.match(conversations, /filters\.audienceFilter === ["']personal["']/);
});
test("chat list fails closed and excludes disconnected Evolution instances", () => {
  const route = source("routes/api/chats/index.ts");
  assert.match(route, /select\(["']id, instance_name, status["']\)/);
  assert.match(route, /\.eq\(["']status["'], ["']open["']\)/);
  assert.match(route, /if \(instancesError\)/);
  assert.match(route, /\.in\(["']instance_id["'], instanceIds\)/);
  assert.match(route, /if \(!instanceIds\.length\)/);
});

test("Evolution watchdog keeps connection_state aligned and sync helpers fail closed", () => {
  const instances = source("routes/api/instances/index.ts");
  const sync = source("server/evolution/sync-engine.ts");
  assert.match(instances, /connection_state: nextConnectionState/);
  assert.match(instances, /connected_at: new Date\(\)\.toISOString\(\)/);
  assert.match(sync, /select\("id,connected_at,status"\)/);
  assert.match(sync, /ownedInstance\.status !== "open"/);
  assert.match(sync, /select\("id,phone,status"\)/);
  assert.match(sync, /instance\.status !== "open"/);
});

test("automatic CRM import ignores contacts and chats from disconnected instances", () => {
  const sync = source("server/product/crm-contact-sync.server.ts");
  assert.match(sync, /from\("whatsapp_instances"\)/);
  assert.match(sync, /\.eq\("status", "open"\)/);
  assert.match(sync, /const activeInstanceIds = new Set/);
  assert.match(sync, /activeContacts = contacts\.filter/);
  assert.match(sync, /activeInstanceIds\.has\(chat\.instance_id\)/);
});
test("agent connection choices expose only open Evolution instances", () => {
  const product = source("server/product/workspace-product.server.ts");
  const listStart = product.indexOf("export async function listAgents");
  const start = product.indexOf('from("whatsapp_instances")', listStart);
  const block = product.slice(start, start + 260);
  assert.match(block, /\.eq\("workspace_id", auth\.workspace\.id\)/);
  assert.match(block, /\.eq\("status", "open"\)/);
});
test("contact name resolution in chat list and history is instance-scoped", () => {
  const chatList = source("routes/api/chats/index.ts");
  const history = source("routes/api/chats/$id/messages.ts");
  assert.match(
    chatList,
    /select\(\s*[\s\S]*id, phone, instance_id, remote_jid, alternate_jid, saved_name, push_name, profile_pic_url[\s\S]*\)/,
  );
  assert.match(chatList, /contactNamesMap\.set\(`\$\{c\.instance_id\}:\$\{identity\}/);
  assert.match(
    chatList,
    /contactNamesMap\.get\(`\$\{chat\.instance_id\}:\$\{cleanPhoneDigits\}`\)/,
  );
  assert.match(history, /\.eq\(\s*['"]instance_id['"]\s*,\s*chatIdentity\.instance_id\s*\)/);
});
test("outbound idempotency is instance-scoped", () => {
  const send = source("routes/api/messages/send.ts");
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261012133000_instance_scoped_message_identity.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    send,
    /from\("outbound_messages"\)[\s\S]{0,220}\.eq\("instance_id", chatRow\.instance_id\)[\s\S]{0,120}\.eq\("client_message_id", clientMessageId\)/,
  );
  assert.match(migration, /idx_outbound_workspace_instance_client_message/);
  assert.match(
    send,
    /\.update\(outboxInput\)[\s\S]{0,180}\.eq\("instance_id", chatRow\.instance_id\)/,
  );
});

test("LID healing for outbound sends is scoped to the selected Evolution instance", () => {
  const send = source("routes/api/messages/send.ts");
  assert.match(
    send,
    /from\("whatsapp_contacts"\)[\s\S]{0,220}\.eq\("workspace_id", auth\.workspaceId\)[\s\S]{0,120}\.eq\("instance_name", instanceName\)/,
  );
  assert.match(send, /Resolve the target connection before healing a LID/);
});

test("profile-picture LID healing is scoped to workspace and instance", () => {
  const evolution = source("lib/evolution.server.ts");
  assert.match(evolution, /fetchContactProfilePicture\([\s\S]{0,180}workspaceId\?: string/);
  assert.match(
    evolution,
    /\.eq\("instance_name", instanceName\)[\s\S]{0,120}\.eq\("workspace_id", workspaceId \|\| "__missing_workspace__"\)/,
  );
});

test("group synchronization fails closed and archives only the selected instance", () => {
  const engine = source("server/evolution/sync-engine.ts");
  assert.match(
    engine,
    /if \(!instData\) \{\s*return \{ success: false, error: "Instância não pertence ao workspace", count: 0 \};/,
  );
  assert.match(
    engine,
    /\.update\(\{ archived: true \}\)[\s\S]{0,160}\.eq\("workspace_id", workspaceId\)[\s\S]{0,80}\.eq\("instance_name", instanceName\)/,
  );
  assert.match(
    engine,
    /\.update\(\{ profile_pic_url: pic \}\)[\s\S]{0,180}\.eq\("workspace_id", workspaceId\)[\s\S]{0,80}\.eq\("instance_name", instanceName\)/,
  );
  assert.match(engine, /id: existingChat\?\.id \?\? randomUUID\(\)/);
  assert.match(engine, /\.upsert\(groupRowsToUpsert, \{ onConflict: "id" \}\)/);
});

test("recent-message LID healing cannot mutate another instance", () => {
  const engine = source("server/evolution/sync-engine.ts");
  assert.match(
    engine,
    /\.update\(\{ chat_id: realPhoneChat\.id \}\)[\s\S]{0,180}\.eq\("workspace_id", workspaceId\)[\s\S]{0,100}\.eq\("instance_id", ownedInstance\.id\)/,
  );
  assert.match(
    engine,
    /\.delete\(\)[\s\S]{0,180}\.eq\("workspace_id", workspaceId\)[\s\S]{0,100}\.eq\("instance_name", instanceName\)/,
  );
});
test("bad or astronomically-large timestamps do not crash bulk sync", () => {
  for (const raw of ["9999999999999999999", "invalid", "", null, NaN]) {
    assert.doesNotThrow(() => normalizeTimestamp(raw));
    assert.ok(Number.isFinite(Date.parse(normalizeTimestamp(raw))));
  }
  assert.equal(normalizeTimestamp(1760000000), "2025-10-09T08:53:20.000Z");
});
test("atomic outbox claim rejects in-flight and ambiguous retries", () => {
  assert.equal(decideOutboundAttempt(null), "create");
  assert.equal(decideOutboundAttempt("failed"), "claim-failed");
  for (const status of ["sending", "pending"] as const)
    assert.equal(decideOutboundAttempt(status), "in-flight");
  for (const status of ["accepted", "confirmed"] as const)
    assert.equal(decideOutboundAttempt(status), "duplicate");
  assert.equal(decideOutboundAttempt("unknown"), "ambiguous");
});
test("network timeout and 5xx responses are ambiguous; explicit client reject can retry safely", () => {
  for (const status of [0, 408, 500, 502, 503, 504])
    assert.equal(isAmbiguousEvolutionSendFailure(status), true);
  for (const status of [400, 401, 403, 404, 422, 429])
    assert.equal(isAmbiguousEvolutionSendFailure(status), false);
});
test("send API reserves idempotency key atomically before calling Evolution", () => {
  const api = source("routes/api/messages/send.ts");
  assert.match(api, /\.insert\(outboxInput\)/);
  assert.match(api, /\.eq\("status", "failed"\)/);
  assert.match(api, /\.eq\("attempts", existingOutbox!\.attempts\)/);
  assert.match(api, /outboxError\?\.code === "23505"/);
  assert.match(api, /IDEMPOTENCY_DESTINATION_MISMATCH/);
  assert.match(api, /DELIVERY_UNKNOWN/);
});
test("accepted Evolution send is saved before optional UI history, preventing accidental resends", () => {
  const api = source("routes/api/messages/send.ts");
  const accepted = api.indexOf("const { error: acceptedError }");
  const persisted = api.indexOf("saved = await persistMessage({");
  assert.ok(accepted > 0 && persisted > accepted);
  assert.match(api, /OUTBOX_RECONCILIATION_REQUIRED/);
  assert.match(api, /MESSAGE_RECONCILIATION_REQUIRED/);
  assert.match(api, /if \(saved && "error" in saved && saved\.error\)/);
});
test("message mutations and webhook acknowledgements never cross Evolution instances", () => {
  const api = source("routes/api/public/webhooks/evolution.ts");
  assert.match(
    api,
    /deleteMessageByExternalId\(\s*workspaceId\s*,\s*extId\s*,\s*instRow\.id\s*,?\s*\)/,
  );
  assert.match(
    api,
    /editMessageByExternalId\(\s*workspaceId\s*,\s*edit\.externalId\s*,\s*edit\.text\s*,\s*instRow\.id\s*,?\s*\)/,
  );
  assert.match(
    api,
    /addReactionToMessage\(\s*workspaceId\s*,\s*targetId\s*,\s*emoji\s*,\s*senderPhone\s*,\s*instRow\.id\s*,?\s*\)/,
  );
  assert.match(
    source("server/evolution/sync-engine.ts"),
    /\.eq\("instance_id", ownedInstance\.id\)/,
  );
});
test("delivery receipt write is scoped to a specific Evolution instance", () => {
  assert.match(
    source("routes/api/public/webhooks/evolution.ts"),
    /\.eq\("external_id", externalId\)\s*\.eq\("instance_id", instRow\.id\)/,
  );
});
test("synthetic HTTP Evolution events reach fixture processor and produce expected transitions (local only)", async () => {
  const seen: string[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      const body = JSON.parse(raw);
      if (body.event === "contacts.update") {
        const rows = evolutionEventRecords(body.data, "contacts")
          .map((item) => buildEvolutionContactRow(item, "ws", "uuid", "dev"))
          .filter(Boolean);
        seen.push(`contacts:${rows.length}`);
      } else if (body.event === "chats.upsert") {
        seen.push(`chats:${evolutionEventRecords(body.data, "chats").length}`);
      } else if (body.event === "messages.update") {
        seen.push(`edits:${collectEvolutionEdits(body.data).length}`);
      }
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400);
      res.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw Error("no listener");
    const url = `http://127.0.0.1:${address.port}`;
    for (const event of [
      {
        event: "contacts.update",
        instance: "sandbox",
        data: { remoteJid: "5511999999999@s.whatsapp.net", pushName: "Teste" },
      },
      { event: "chats.upsert", instance: "sandbox", data: { id: "5511999999999@s.whatsapp.net" } },
      {
        event: "messages.update",
        instance: "sandbox",
        data: {
          key: { id: "msg" },
          update: { message: { editedMessage: { message: { conversation: "ok" } } } },
        },
      },
    ]) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(1500),
      });
      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { ok: true });
    }
    assert.deepEqual(seen, ["contacts:1", "chats:1", "edits:1"]);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("message persistence updates chats whose last-message timestamp is null", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261012133000_instance_scoped_message_identity.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    migration,
    /v_chat\.last_message_at is null or v_chat\.last_message_at <= p_created_at/,
  );
});

test("participant cleanup and recent-chat summaries remain instance-scoped", () => {
  const engine = source("server/evolution/sync-engine.ts");
  assert.match(
    engine,
    /\.update\(\{\s*last_message:[\s\S]{0,220}\.eq\("instance_name", instanceName\)/,
  );
  assert.match(
    engine,
    /\.from\("group_participants"\)[\s\S]{0,180}\.eq\("workspace_id", workspaceId\)[\s\S]{0,100}\.eq\("instance_id", instance\.id\)/,
  );
  assert.match(
    engine,
    /\.delete\(\)[\s\S]{0,180}\.eq\("workspace_id", workspaceId\)[\s\S]{0,100}\.eq\("instance_id", instance\.id\)/,
  );
});
test("handover migration declares exact composite FK targets before creating the table", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261012120000_vercel_evolution_agent_runtime.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /whatsapp_instances_workspace_id_id_uidx/);
  assert.match(migration, /chats_workspace_instance_id_uidx/);
  assert.ok(
    migration.indexOf("chats_workspace_instance_id_uidx") <
      migration.indexOf("create table if not exists public.handover_requests"),
  );
  assert.match(
    migration,
    /foreign key \(workspace_id, instance_id, chat_id\) references public\.chats\(workspace_id, instance_id, id\)/,
  );
});

test("human handover lifecycle is workspace-scoped and restores AI only on resolution", () => {
  const route = source("routes/api/chats/$id/handover.ts");
  assert.match(route, /requireApiPermission\(request, "messages\.send"\)/);
  assert.match(route, /\.eq\("workspace_id", auth\.workspaceId\)/);
  assert.match(route, /\.in\("status", \["queued", "assigned", "in_progress"\]\)/);
  assert.match(route, /status: action === "resolve" \? "resolved" : "canceled"/);
  assert.match(route, /update\(\{ ai_paused: action === "accept" \}\)/);
});

test("human outbound messages claim a queued handover without failing the send", () => {
  const route = source("routes/api/messages/send.ts");
  assert.match(route, /status: "in_progress"/);
  assert.match(route, /assigned_to: auth\.id/);
  assert.match(route, /\.eq\("chat_id", saved\.chatId\)/);
  assert.match(route, /\[handover\]\s+failed to claim request/);
});

test("group participant removals remain scoped to the workspace and Evolution instance", () => {
  const webhook = source("routes/api/public/webhooks/evolution.ts");
  const removalStart = webhook.indexOf('if (action === "remove")');
  const removalEnd = webhook.indexOf("} else {", removalStart);
  assert.ok(removalStart >= 0, "group participant removal branch must exist");
  assert.ok(removalEnd > removalStart, "group participant removal branch must be bounded");
  const removal = webhook.slice(removalStart, removalEnd);
  assert.match(removal, /\.eq\("workspace_id", workspaceId\)/);
  assert.match(removal, /\.eq\("instance_id", instRow\.id\)/);
});

test("contact webhook updates preserve an existing saved agenda name over push name", () => {
  const webhook = source("routes/api/public/webhooks/evolution.ts");
  assert.match(webhook, /if \(savedName \|\| genericName\) patch\.name = savedName \|\| pushName/);
  assert.match(webhook, /existingChatName/);
  assert.match(webhook, /existingChatName === "Contato"/);
  assert.match(webhook, /existingChatName === "Grupo WhatsApp"/);
});

test("manual contact sync does not null out omitted agenda metadata", () => {
  const engine = source("server/evolution/sync-engine.ts");
  const syncStart = engine.indexOf("const rows = list.flatMap");
  const upsertStart = engine.indexOf('.from("whatsapp_contacts")', syncStart);
  assert.ok(syncStart >= 0 && upsertStart > syncStart);
  const syncBlock = engine.slice(syncStart, upsertStart);
  assert.match(syncBlock, /\.\.\.\(savedName \? \{ saved_name: savedName \} : \{\}\)/);
  assert.match(syncBlock, /\.\.\.\(pushName \? \{ push_name: pushName \} : \{\}\)/);
  assert.match(syncBlock, /\.\.\.\(profilePicUrl \? \{ profile_pic_url: profilePicUrl \} : \{\}\)/);
  assert.doesNotMatch(
    syncBlock,
    /saved_name: savedName,\s*push_name: pushName,\s*profile_pic_url: profilePicUrl/,
  );
});

test("group sync does not replace an existing subject with a generic fallback", () => {
  const engine = source("server/evolution/sync-engine.ts");
  const groupRows = engine.indexOf("const groupRowsToUpsert = groupList.flatMap");
  const upsert = engine.indexOf('.from("chats")', groupRows);
  assert.ok(groupRows >= 0 && upsert > groupRows);
  const block = engine.slice(groupRows, upsert);
  assert.match(block, /const remoteSubject = String\(g\.subject \|\| g\.name \|\| ""\)\.trim\(\)/);
  assert.match(block, /\.\.\.\(remoteSubject \? \{ name: remoteSubject \} : \{\}\)/);
  assert.doesNotMatch(block, /name: subject,/);
});

test("group participant sync preserves existing names and photos when provider omits them", () => {
  const engine = source("server/evolution/sync-engine.ts");
  assert.match(engine, /\.\.\.\(displayName \? \{ display_name: displayName \} : \{\}\)/);
  assert.match(engine, /\.\.\.\(profilePicture \? \{ profile_pic_url: profilePicture \} : \{\}\)/);
  assert.doesNotMatch(
    engine,
    /display_name:\s*participant\?\.name \|\| participant\?\.pushName \|\| null/,
  );
});

test("history and read receipts reassert the selected chat instance scope", () => {
  const history = source("routes/api/chats/$id/messages.ts");
  const read = source("routes/api/chats/$id/read.ts");
  assert.match(history, /\.eq\(\s*['"]instance_id['"]\s*,\s*chatIdentity\.instance_id\s*\)/);
  assert.match(
    history,
    /group_participants['"][\s\S]{0,220}\.eq\(\s*['"]instance_id['"]\s*,\s*chatIdentity\.instance_id\s*\)/,
  );
  assert.match(read, /select\(\s*["']id, workspace_id, instance_id,/);
  assert.match(read, /\.eq\(\s*["']instance_id["']\s*,\s*chat\.instance_id\s*\)/);
});

test("manual Evolution sync repairs the webhook before metadata synchronization", () => {
  const hook = source("features/inbox/hooks/useConversations.ts");
  const route = source("routes/api/sync/evolution.ts");
  assert.match(hook, /for \(const phase of \["webhook", "contacts", "groups"\]/);
  assert.match(route, /if \(phase === "webhook" \|\| phase === "all"\)/);
  assert.match(route, /configureEvolutionWebhook\(instanceName\)/);
  assert.match(
    route,
    /const includeParticipants = url\.searchParams\.get\("participants"\) === "true"/,
  );
  assert.match(route, /syncParticipantContacts: includeParticipants/);
  assert.match(route, /fetchMissingPictures: false/);
});

test("profile picture backfill cannot cross workspace or instance boundaries", () => {
  const sync = source("routes/api/chats/sync-pfp.ts");
  assert.match(
    sync,
    /from\("whatsapp_instances"\)[\s\S]{0,220}\.eq\("workspace_id", auth\.workspaceId\)[\s\S]{0,80}\.eq\("status", "open"\)/,
  );
  assert.match(sync, /\.in\("instance_id", activeInstanceIds\)/g);
  assert.match(sync, /select\("id, phone, remote_jid, instance_id, instance_name, is_group"/);
  assert.match(
    sync,
    /\.eq\("workspace_id", auth\.workspaceId\)\s*\.eq\("instance_id", chat\.instance_id\)/,
  );
});

test("instance status watchdog updates only the authenticated workspace row", () => {
  const route = source("routes/api/instances/index.ts");
  assert.match(route, /\.eq\("id", saved\.id\)\s*\.eq\("workspace_id", auth\.workspaceId\)/);
});

test("instance deletion delegates scoped cleanup to the canonical lifecycle", () => {
  const route = source("routes/api/instances/$name/index.ts");
  assert.match(
    route,
    /select\(\s*['"]id['"]\s*\)[\s\S]{0,240}\.eq\(\s*['"]workspace_id['"]\s*,\s*auth\.workspaceId\s*\)/,
  );
  assert.match(
    route,
    /purgeInstanceData\(supabaseAdmin, \{\s*workspaceId: auth\.workspaceId,\s*instanceId: ownedInstance\.id,\s*instanceName: name,\s*\}\)/s,
  );
  assert.match(
    route,
    /import \{ purgeInstanceData \} from "@\/server\/evolution\/instance-lifecycle"/,
  );
  assert.doesNotMatch(route, /database removal failed/);
});
