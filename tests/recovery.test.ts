import test from "node:test";
import assert from "node:assert/strict";
import {
  evolutionWebhookEvents,
  normalizeEvolutionEvent,
  missingWebhookEvents,
  secureTokenMatches,
  inspectStoredWebhook,
} from "../src/server/evolution/webhook-config.ts";
import {
  contactDisplayName,
  scopedIdentityKey,
  senderIdentity,
  collectDirectLidMappings,
} from "../src/server/evolution/contact-identity.ts";
import { buildChatEventUpsert } from "../src/server/evolution/chat-event.ts";
import { collectCursorPages } from "../src/lib/cursor-pages.ts";
import { stripEmojis, sanitizeChatName, sanitizeSenderName } from "../src/lib/emoji.ts";
import { buildApiHeaders } from "../src/lib/api-fetch.ts";
import { isTrustedLocalRequest } from "../src/server/middleware/auth-policy.ts";
import { evolutionMessagePageBody } from "../src/server/evolution/message-query.ts";
import { shouldIncrementUnread } from "../src/server/evolution/event-policy.ts";
import { buildMessageDestination } from "../src/server/evolution/message-destination.ts";
import { decodeEventCursor, encodeEventCursor } from "../src/lib/event-cursor.ts";
import { shouldMarkChatRead } from "../src/features/inbox/read-policy.ts";
import {
  connectionSyncPhases,
  connectionSyncPayload,
  groupParticipantSyncPayload,
} from "../src/server/evolution/connection-sync.ts";

test("normalizes current and legacy Evolution group update event names", () => {
  assert.equal(normalizeEvolutionEvent("groups.update"), "GROUPS_UPDATE");
  assert.equal(normalizeEvolutionEvent("GROUP_UPDATE"), "GROUPS_UPDATE");
  assert.equal(normalizeEvolutionEvent("group-participants.update"), "GROUP_PARTICIPANTS_UPDATE");
  assert.ok(evolutionWebhookEvents.includes("GROUPS_UPDATE"));
  assert.ok(evolutionWebhookEvents.includes("CONTACTS_UPDATE"));
  assert.ok(evolutionWebhookEvents.includes("MESSAGES_UPSERT"));
  assert.equal(evolutionWebhookEvents.includes("MESSAGES_SET"), false);
  assert.equal(evolutionWebhookEvents.includes("CHATS_SET"), false);
});

test("detects required events missing from the webhook stored by Evolution", () => {
  const missing = missingWebhookEvents(["MESSAGES_UPSERT", "CHATS_UPDATE"]);
  assert.ok(missing.includes("GROUPS_UPDATE"));
  assert.ok(missing.includes("CONTACTS_UPDATE"));
  assert.ok(missing.includes("GROUP_PARTICIPANTS_UPDATE"));
});

test("uses WhatsApp contact precedence and phone fallback", () => {
  assert.equal(
    contactDisplayName({
      savedName: "Maria da Agenda",
      pushName: "Maria ✨",
      phone: "5511999998888",
    }),
    "Maria da Agenda",
  );
  assert.equal(
    contactDisplayName({ savedName: null, pushName: "Maria ✨", phone: "5511999998888" }),
    "Maria ✨",
  );
  assert.equal(
    contactDisplayName({ savedName: null, pushName: null, phone: "5511999998888" }),
    "+55 11 99999-8888",
  );
});

test("keeps participant identity scoped to workspace and instance", () => {
  assert.notEqual(
    scopedIdentityKey("workspace-a", "instance-1", "5511999998888"),
    scopedIdentityKey("workspace-b", "instance-1", "5511999998888"),
  );
  assert.notEqual(
    scopedIdentityKey("workspace-a", "instance-1", "5511999998888"),
    scopedIdentityKey("workspace-a", "instance-2", "5511999998888"),
  );
});

test("resolves group sender to saved name and keeps number as secondary identity", () => {
  assert.deepEqual(
    senderIdentity({
      savedName: "João Cliente",
      pushName: "João",
      phone: "5521988887777",
      profilePictureUrl: "https://cdn.example/avatar.jpg",
    }),
    {
      name: "João Cliente",
      phone: "5521988887777",
      formattedPhone: "+55 21 98888-7777",
      profilePictureUrl: "https://cdn.example/avatar.jpg",
    },
  );
});

test("preserves emoji in WhatsApp names and previews", () => {
  assert.equal(stripEmojis("Família ❤️"), "Família ❤️");
  assert.equal(sanitizeChatName("Cinema 🎬", true), "Cinema 🎬");
  assert.equal(sanitizeSenderName("Maria ✨", "+55 11 99999-8888"), "Maria ✨");
});

test("collects every cursor page exactly once", async () => {
  const pages = new Map<string | null, { items: number[]; nextCursor: string | null }>([
    [null, { items: [1, 2], nextCursor: "page-2" }],
    ["page-2", { items: [3, 4], nextCursor: "page-3" }],
    ["page-3", { items: [5], nextCursor: null }],
  ]);
  const visited: Array<string | null> = [];
  const result = await collectCursorPages(async (cursor) => {
    visited.push(cursor);
    return pages.get(cursor)!;
  });
  assert.deepEqual(result, [1, 2, 3, 4, 5]);
  assert.deepEqual(visited, [null, "page-2", "page-3"]);
});

test("adds the Supabase bearer token to application API requests", () => {
  const headers = buildApiHeaders(new Headers({ Accept: "application/json" }), "access-token");
  assert.equal(headers.get("Authorization"), "Bearer access-token");
  assert.equal(headers.get("Accept"), "application/json");
});

test("allows development bypass only for loopback hosts", () => {
  assert.equal(isTrustedLocalRequest(new URL("http://localhost:3000/api/chats")), true);
  assert.equal(isTrustedLocalRequest(new URL("http://127.0.0.1:3000/api/chats")), true);
  assert.equal(isTrustedLocalRequest(new URL("http://192.168.0.4:3000/api/chats")), false);
  assert.equal(isTrustedLocalRequest(new URL("https://inbox.example/api/chats")), false);
});

test("uses Evolution offset as page size because limit is ignored by current instances", () => {
  assert.deepEqual(evolutionMessagePageBody(200, 2), { where: {}, page: 2, offset: 200 });
  assert.deepEqual(evolutionMessagePageBody(50_000, 0), { where: {}, page: 1, offset: 500 });
});

test("accepts either configured webhook secret without weakening token comparison", () => {
  assert.equal(
    secureTokenMatches("evolution-secret", ["dedicated-secret", "evolution-secret"]),
    true,
  );
  assert.equal(secureTokenMatches("wrong-secret", ["dedicated-secret", "evolution-secret"]), false);
  assert.equal(secureTokenMatches("", ["dedicated-secret"]), false);
});

test("rejects a stored webhook whose Evolution request has no authentication header", () => {
  const result = inspectStoredWebhook(
    {
      enabled: true,
      url: "https://panel.example/api/public/webhooks/evolution",
      headers: null,
      events: evolutionWebhookEvents,
    },
    "https://panel.example/api/public/webhooks/evolution",
    "expected-secret",
  );
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes("auth"));
});

test("accepts Evolution webhook auth under apikey and validates the complete contract", () => {
  const result = inspectStoredWebhook(
    {
      webhook: {
        enabled: true,
        url: "https://panel.example/api/public/webhooks/evolution",
        headers: { apikey: "expected-secret" },
        events: evolutionWebhookEvents.map((event) =>
          event === "GROUPS_UPDATE" ? "GROUP_UPDATE" : event,
        ),
      },
    },
    "https://panel.example/api/public/webhooks/evolution",
    "expected-secret",
  );
  assert.deepEqual(result, { valid: true, issues: [], missingEvents: [] });
});

test("chat events never replace an official group name or photo with placeholders", () => {
  assert.deepEqual(
    buildChatEventUpsert(
      { id: "120363000000000000@g.us", subject: null, name: null, profilePicUrl: null },
      "workspace-1",
      "instance-1",
    ),
    {
      workspace_id: "workspace-1",
      instance_name: "instance-1",
      phone: "120363000000000000",
      remote_jid: "120363000000000000@g.us",
      is_group: true,
    },
  );
  assert.equal(
    buildChatEventUpsert(
      { id: "120363000000000000@g.us", subject: "Grupo Oficial" },
      "workspace-1",
      "instance-1",
    )?.name,
    "Grupo Oficial",
  );
});

test("uses remoteJidAlt from message history to heal direct LID duplicates", () => {
  const mappings = collectDirectLidMappings([
    {
      key: {
        remoteJid: "241171406295189@lid",
        remoteJidAlt: "558388714110@s.whatsapp.net",
      },
    },
    { key: { remoteJid: "120363000000000000@g.us", remoteJidAlt: "558399999999" } },
  ]);
  assert.equal(mappings.get("241171406295189"), "558388714110");
  assert.equal(mappings.size, 1);
});

test("historical message sets never increment unread counters", () => {
  assert.equal(shouldIncrementUnread("MESSAGES_SET", false), false);
  assert.equal(shouldIncrementUnread("MESSAGES_SET", true), false);
  assert.equal(shouldIncrementUnread("MESSAGES_UPSERT", false), true);
  assert.equal(shouldIncrementUnread("SEND_MESSAGE", false), true);
  assert.equal(shouldIncrementUnread("MESSAGES_UPSERT", true), false);
});

test("resolved LID destinations use the canonical phone JID", () => {
  assert.equal(
    buildMessageDestination({
      remoteJid: "241171406295189@lid",
      phoneE164: "558388714110",
      identityKind: "phone",
    }),
    "558388714110@s.whatsapp.net",
  );
  assert.equal(
    buildMessageDestination({
      remoteJid: "241171406295189@lid",
      phoneE164: null,
      identityKind: "lid",
    }),
    "241171406295189@lid",
  );
  assert.equal(
    buildMessageDestination({
      remoteJid: "120363426286939907@g.us",
      phoneE164: null,
      identityKind: "group",
    }),
    "120363426286939907@g.us",
  );
  assert.equal(
    buildMessageDestination({
      remoteJid: "558388514599-1608912621@g.us",
      phoneE164: null,
      identityKind: "group",
    }),
    "558388514599-1608912621@g.us",
  );
});

test("event cursors preserve sequence and reject malformed input", () => {
  const encoded = encodeEventCursor(9123);
  assert.equal(decodeEventCursor(encoded), 9123);
  assert.equal(decodeEventCursor(""), 0);
  assert.equal(decodeEventCursor("not-a-cursor"), 0);
});

test("a visible conversation marks a chat as read even when selected automatically", () => {
  assert.equal(
    shouldMarkChatRead({ unread: 12, selectionSource: "automatic", timelineVisible: true }),
    true,
  );
  assert.equal(
    shouldMarkChatRead({ unread: 12, selectionSource: "user", timelineVisible: true }),
    true,
  );
  assert.equal(
    shouldMarkChatRead({ unread: 12, selectionSource: "user", timelineVisible: false }),
    false,
  );
});

test("an open connection is split into bounded durable synchronization phases", () => {
  assert.deepEqual(connectionSyncPhases("open"), ["contacts", "groups"]);
  assert.deepEqual(connectionSyncPhases("close"), []);
  assert.deepEqual(connectionSyncPayload("WhatsApp_5589", "groups"), {
    event: "sync.groups",
    instance: "WhatsApp_5589",
    data: { phase: "groups" },
  });
  assert.deepEqual(groupParticipantSyncPayload("WhatsApp_5589", "120363000000000000@g.us"), {
    event: "sync.group-participants",
    instance: "WhatsApp_5589",
    data: { groupJid: "120363000000000000@g.us" },
  });
});
