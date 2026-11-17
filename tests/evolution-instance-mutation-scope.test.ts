import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { requireMessageInstanceScope } from "../src/server/evolution/message-scope.ts";

const lib = readFileSync(new URL("../src/lib/evolution.server.ts", import.meta.url), "utf8");
const sync = readFileSync(
  new URL("../src/server/evolution/sync-engine.ts", import.meta.url),
  "utf8",
);
const readRoute = readFileSync(
  new URL("../src/routes/api/chats/$id/read.ts", import.meta.url),
  "utf8",
);
const lifecycle = readFileSync(
  new URL("../src/server/evolution/instance-lifecycle.ts", import.meta.url),
  "utf8",
);
const webhook = readFileSync(
  new URL("../src/routes/api/public/webhooks/evolution.ts", import.meta.url),
  "utf8",
);
const instanceRoute = readFileSync(
  new URL("../src/routes/api/instances/$name/index.ts", import.meta.url),
  "utf8",
);
const uuid = "abcdef01-2345-6789-abcd-0123456789ab";

test("mutation scope rejects missing or malformed instance id (fail closed)", () => {
  assert.equal(requireMessageInstanceScope(uuid), uuid);
  for (const bad of ["", " ", "undefined", "not-a-uuid", undefined, null, 42]) {
    assert.throws(() => requireMessageInstanceScope(bad as string), /requires a valid instance_id/);
  }
});

test("external mutation helpers require and apply instance scope", () => {
  const chunks = [
    lib
      .split("export async function deleteMessageByExternalId(")[1]
      ?.split("export async function editMessageByExternalId(")[0],
    lib
      .split("export async function editMessageByExternalId(")[1]
      ?.split("export async function addReactionToMessage(")[0],
    lib
      .split("export async function addReactionToMessage(")[1]
      ?.split("export interface UpsertMessageInput")[0],
  ];
  for (const chunk of chunks) {
    assert.ok(chunk);
    assert.match(chunk, /instanceId: string/);
    assert.doesNotMatch(chunk, /instanceId\?: string/);
    assert.match(chunk, /requireMessageInstanceScope\(instanceId\)/);
    assert.match(chunk, /\.eq\("workspace_id", workspaceId\)/);
    assert.match(chunk, /\.eq\("instance_id", scopedInstanceId\)/);
  }
});

test("message edits and reactions preserve scope at both lookup and update", () => {
  const edit =
    lib
      .split("export async function editMessageByExternalId(")[1]
      ?.split("export async function addReactionToMessage(")[0] ?? "";
  const reaction =
    lib
      .split("export async function addReactionToMessage(")[1]
      ?.split("export interface UpsertMessageInput")[0] ?? "";
  for (const chunk of [edit, reaction]) {
    assert.ok((chunk.match(/\.eq\("instance_id", scopedInstanceId\)/g) ?? []).length >= 2);
  }
});

test("sender profile fixes never update messages across WhatsApp instances", () => {
  assert.match(
    sync,
    /\.update\(\{ sender_avatar: pic \}\)[\s\S]*?\.eq\("workspace_id", workspaceId\)\s*\.eq\("instance_id", ownedInstance.id\)\s*\.eq\("sender_phone", senderPhone\)/,
  );
  assert.match(
    sync,
    /\.eq\("id", existingMessage.id\)\s*\.eq\("workspace_id", workspaceId\)\s*\.eq\("instance_id", ownedInstance.id\)/,
  );
});
test("mark-as-read message writes remain scoped to the requested chat and workspace", () => {
  assert.match(
    readRoute,
    /\.in\(\s*"id",\s*unreadMsgs\.map\(\(message\)\s*=>\s*message\.id\)\s*,?\s*\)[\s\S]{0,500}\.eq\(\s*"workspace_id",\s*auth\.workspaceId\s*\)[\s\S]{0,240}\.eq\(\s*"chat_id",\s*chatId\s*\)/,
  );
});

test("provider disconnect cleanup is explicit, instance-scoped and media-aware", () => {
  assert.match(lifecycle, /disconnect_cleanup_policy/);
  assert.match(lifecycle, /workspace_privacy_settings/);
  assert.match(lifecycle, /chat-media/);
  assert.match(lifecycle, /evolution_events/);
  assert.match(lifecycle, /outbound_messages/);
  assert.match(lifecycle, /contact_identity_aliases/);
  assert.match(lifecycle, /instance_id.*instanceId/s);
  assert.match(webhook, /instance-not-connected/);
  assert.match(webhook, /instance-removed/);
  assert.match(lifecycle, /preserveEventId/);
  assert.match(webhook, /x-inbox-event-id/);
  assert.match(lifecycle, /workspace_audit_log/);
  assert.match(lifecycle, /evolution\.instance\.cleanup/);
});

test("manual instance deletion delegates to the scoped lifecycle cleanup", () => {
  assert.match(
    instanceRoute,
    /import \{ purgeInstanceData \} from "@\/server\/evolution\/instance-lifecycle"/,
  );
  assert.match(
    instanceRoute,
    /purgeInstanceData\(supabaseAdmin, \{\s*workspaceId: auth\.workspaceId,\s*instanceId: ownedInstance\.id,\s*instanceName: name,\s*\}\)/s,
  );
  assert.doesNotMatch(instanceRoute, /database removal failed/);
  assert.match(instanceRoute, /scoped cleanup failed after provider deletion/);
  assert.match(instanceRoute, /\},\s*502,\s*\)/s);
});

test("instance creation exposes unavailable integration and deferred webhook states without blocking QR", () => {
  const creationRoute = readFileSync(
    new URL("../src/routes/api/instances/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(creationRoute, /provider configuration unavailable/);
  assert.match(creationRoute, /503,/);
  assert.match(creationRoute, /webhook configuration deferred/);
  assert.match(creationRoute, /webhookConfigured: false/);
  assert.match(creationRoute, /webhookConfigured: true/);
  assert.match(creationRoute, /qrcode: qr/);
});
