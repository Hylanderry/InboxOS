import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evolutionEventKey } from "../src/server/evolution/event-key.ts";
import {
  collectEvolutionDeliveryUpdates,
  parseEvolutionDeliveryStatus,
} from "../src/server/evolution/message-status.ts";

const workspace = "workspace-a";
const instance = "test-instance";
const envelope = (status: string | number) => ({
  event: "messages.update",
  instance,
  data: { key: { id: "msg-42", remoteJid: "5511999999999@s.whatsapp.net" }, status },
});

test("different status receipts for one message must never share the durable event key", async () => {
  const delivered = await evolutionEventKey(
    workspace,
    "MESSAGES_UPDATE",
    instance,
    envelope("DELIVERY_ACK"),
  );
  const read = await evolutionEventKey(workspace, "MESSAGES_UPDATE", instance, envelope("READ"));
  assert.notEqual(delivered, read, "READ must not be dropped as a duplicate DELIVERY_ACK");
  assert.equal(
    delivered,
    await evolutionEventKey(workspace, "MESSAGES_UPDATE", instance, envelope("DELIVERY_ACK")),
  );
});

test("keyId-only updates and edited content have distinct durable identities", async () => {
  const payload = (status: string) => ({
    event: "messages.update",
    data: { keyId: "msg-7", status },
  });
  assert.notEqual(
    await evolutionEventKey(workspace, "MESSAGES_UPDATE", instance, payload("SENT")),
    await evolutionEventKey(workspace, "MESSAGES_UPDATE", instance, payload("READ")),
  );
  const edit = (text: string) => ({
    data: { key: { id: "msg-7" }, editedMessage: { conversation: text } },
  });
  assert.notEqual(
    await evolutionEventKey(workspace, "MESSAGES_EDITED", instance, edit("first")),
    await evolutionEventKey(workspace, "MESSAGES_EDITED", instance, edit("second")),
  );
});

test("message creation retries dedupe by stable IDs, without cross-workspace collisions", async () => {
  const create = (text: string) => ({
    data: { key: { id: "original-1" }, message: { conversation: text } },
  });
  const first = await evolutionEventKey(workspace, "MESSAGES_UPSERT", instance, create("hello"));
  assert.equal(
    first,
    await evolutionEventKey(workspace, "MESSAGES_UPSERT", instance, create("hello")),
  );
  assert.equal(
    first,
    await evolutionEventKey(
      workspace,
      "MESSAGES_UPSERT",
      instance,
      create("same id with extra metadata"),
    ),
  );
  assert.notEqual(
    first,
    await evolutionEventKey("workspace-b", "MESSAGES_UPSERT", instance, create("hello")),
  );
});

test("message ID arrays use unambiguous serialization", async () => {
  const single = { data: [{ key: { id: "a,b" } }] };
  const double = { data: [{ key: { id: "a" } }, { key: { id: "b" } }] };
  assert.notEqual(
    await evolutionEventKey(workspace, "MESSAGES_SET", instance, single),
    await evolutionEventKey(workspace, "MESSAGES_SET", instance, double),
  );
});

test("delivery updates understand textual and numeric Evolution acknowledgement codes", () => {
  for (const [value, status] of [
    ["2", "sent"],
    [2, "sent"],
    ["SERVER_ACK", "sent"],
    ["3", "delivered"],
    [3, "delivered"],
    ["DELIVERY_ACK", "delivered"],
    ["4", "read"],
    [4, "read"],
    [5, "read"],
    ["READ", "read"],
    ["PLAYED", "read"],
  ] as const)
    assert.equal(parseEvolutionDeliveryStatus(value), status);
  assert.equal(parseEvolutionDeliveryStatus("PENDING"), null);
  assert.equal(parseEvolutionDeliveryStatus("UNKNOWN"), null);
  assert.equal(parseEvolutionDeliveryStatus(undefined), null);
});

test("receipt comparison is monotonic and cannot downgrade a read message", () => {
  const events = collectEvolutionDeliveryUpdates([
    { key: { id: "msg-1" }, status: "READ" },
    { keyId: "msg-2", status: 3 },
    { key: { id: "msg-3" }, update: { status: 2 } },
    { key: { id: "ignored" }, status: "NOT_A_STATUS" },
  ]);
  assert.deepEqual(
    events.map((event) => [event.externalId, event.status]),
    [
      ["msg-1", "read"],
      ["msg-2", "delivered"],
      ["msg-3", "sent"],
    ],
  );
  assert.deepEqual(
    events.map((e) => e.previousStatuses),
    [["pending", "sent", "delivered"], ["pending", "sent"], ["pending"]],
  );
  const states = new Map([
    ["msg-1", "read"],
    ["msg-2", "sent"],
    ["msg-3", "pending"],
  ]);
  for (const receipt of events) {
    if (receipt.previousStatuses.includes(states.get(receipt.externalId) || "")) {
      states.set(receipt.externalId, receipt.status);
    }
  }
  assert.equal(states.get("msg-1"), "read", "later READ must remain authoritative");
  assert.equal(states.get("msg-2"), "delivered");
  assert.equal(states.get("msg-3"), "sent");
  assert.deepEqual(collectEvolutionDeliveryUpdates({ keyId: 44, status: 3 }), []);
});

test("READ receipts are accepted from Evolution's nested message envelopes", () => {
  const nested = collectEvolutionDeliveryUpdates({
    messages: [{ key: { id: "nested-read" }, update: { status: 4 } }],
  });
  assert.deepEqual(
    nested.map((event) => [event.externalId, event.status]),
    [["nested-read", "read"]],
  );
});

test("webhook SQL handler requires an atomic previous-state filter and checks errors", () => {
  const source = readFileSync(
    new URL("../src/routes/api/public/webhooks/evolution.ts", import.meta.url),
    "utf8",
  );
  const handler =
    source.match(
      /if\s*\(\s*event\s*===\s*["']MESSAGES_UPDATE["']\s*\|\|\s*event\s*===\s*["']SEND_MESSAGE_UPDATE["']\s*\)\s*\{([\s\S]*?)if\s*\(\s*event\s*===\s*["']CONTACTS_SET["']/,
    )?.[1] || "";
  assert.match(handler, /collectEvolutionDeliveryUpdates\(\s*data\s*,?\s*\)/);
  assert.match(handler, /\.in\("status", previousStatuses\)/);
  assert.match(handler, /\.eq\("instance_id", instRow\.id\)/);
  assert.match(handler, /read_local_at/);
  assert.match(handler, /Math\.max\(0, unreadCount \?\? 0\)/);
  assert.match(handler, /if \(statusError\) throw statusError;/);
});
