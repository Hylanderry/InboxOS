import test from "node:test";
import assert from "node:assert/strict";
import {
  conversationKey,
  parseConversationKey,
  normalizePhone,
} from "../src/lib/conversationKey.ts";
import {
  extractText,
  extractMediaInfo,
  previewFor,
  extractQuotedMessage,
  extractMediaBase64,
  isGifMedia,
  unwrapMessage,
} from "../src/server/evolution/normalize-message.ts";
import { mapChatDto } from "../src/features/inbox/mappers/chatMapper.ts";
import { mapMessageDto, formatAudioDuration } from "../src/features/inbox/mappers/messageMapper.ts";
import { appNavigationGroups, getAppViewMeta } from "../src/features/inbox/navigation.ts";
import { parseDelimitedCsv } from "../src/lib/csv.ts";

test("contact CSV parser preserves quoted delimiters and multiline fields", () => {
  assert.deepEqual(
    parseDelimitedCsv(
      '\uFEFFNome,Telefone,E-mail\n"Silva, Ana",+5511999999999,ana@example.com\n"Equipe\nComercial",+5511888888888,',
    ),
    [
      ["Nome", "Telefone", "E-mail"],
      ["Silva, Ana", "+5511999999999", "ana@example.com"],
      ["Equipe\nComercial", "+5511888888888", ""],
    ],
  );
});

test("conversationKey normalizes and generates unique composite key", () => {
  const key1 = conversationKey("ws-1", "inst-alpha", "5511999998888@s.whatsapp.net");
  const key2 = conversationKey("ws-2", "inst-alpha", "5511999998888");
  const key3 = conversationKey("ws-1", "inst-beta", "5511999998888");

  // Multi-tenant & multi-account isolation:
  assert.equal(key1, "ws-1:inst-alpha:5511999998888");
  assert.equal(key2, "ws-2:inst-alpha:5511999998888");
  assert.equal(key3, "ws-1:inst-beta:5511999998888");

  // Keys must be completely distinct across workspaces and instances:
  assert.notEqual(key1, key2);
  assert.notEqual(key1, key3);

  const parsed = parseConversationKey(key1);
  assert.deepEqual(parsed, {
    workspaceId: "ws-1",
    instanceName: "inst-alpha",
    phone: "5511999998888",
  });
});

test("normalizePhone cleans up phone numbers and handles JID suffixes", () => {
  assert.equal(normalizePhone("5511999998888@s.whatsapp.net"), "5511999998888");
  assert.equal(normalizePhone("+55 (11) 99999-8888"), "5511999998888");
  assert.equal(normalizePhone("12036302@g.us"), "12036302");
});

test("extractText correctly parses diverse Evolution API payloads", () => {
  assert.equal(extractText({ conversation: "Olá mundo" }), "Olá mundo");
  assert.equal(
    extractText({ extendedTextMessage: { text: "Texto estendido" } }),
    "Texto estendido",
  );
  assert.equal(extractText({ imageMessage: { caption: "Foto de amostra" } }), "Foto de amostra");
  assert.equal(extractText({}), "");
});

test("extractMediaInfo extracts proper media type and URLs", () => {
  const audioInfo = extractMediaInfo({
    audioMessage: {
      url: "https://storage.com/audio.ogg",
      mimetype: "audio/ogg; codecs=opus",
      seconds: 42,
    },
  });
  assert.equal(audioInfo.kind, "audio");
  assert.equal(audioInfo.mimetype, "audio/ogg; codecs=opus");
  assert.equal(audioInfo.duration, 42);

  const imageInfo = extractMediaInfo({
    imageMessage: {
      url: "https://storage.com/image.jpeg",
      mimetype: "image/jpeg",
    },
  });
  assert.equal(imageInfo.kind, "image");
  assert.equal(imageInfo.mimetype, "image/jpeg");
});

test("media ingestion finds nested Evolution base64 and identifies GIF playback", () => {
  const payload = { data: { message: { base64: "A".repeat(160) } } };
  assert.equal(extractMediaBase64(payload), "A".repeat(160));
  assert.equal(isGifMedia({ videoMessage: { gifPlayback: true } }, "video/mp4", null), true);
  assert.equal(isGifMedia({ imageMessage: {} }, "image/gif", null), true);
});

test("unwrapMessage and extractMediaInfo support WhatsApp Instant Video Notes (ptvMessage)", () => {
  const ptvPayload = {
    ptvMessage: {
      url: "https://storage.com/videonote.mp4",
      mimetype: "video/mp4",
      seconds: 15,
      caption: "Nota de vídeo rápida",
    },
  };

  const unwrapped = unwrapMessage(ptvPayload);
  assert.ok(unwrapped);

  const text = extractText(ptvPayload);
  assert.equal(text, "Nota de vídeo rápida");

  const media = extractMediaInfo(ptvPayload);
  assert.equal(media.kind, "video");
  assert.equal(media.mimetype, "video/mp4");
  assert.equal(media.duration, 15);
});

test("mapChatDto provides stable normalized fields", () => {
  const mapped = mapChatDto({
    id: "chat-100",
    workspace_id: "ws-1",
    instance_name: "inst-1",
    phone: "5511999991111",
    name: "Cliente VIP",
    last_message: "Confirmado o pedido",
    unread_count: 3,
    ai_paused: true,
  });

  assert.equal(mapped.id, "chat-100");
  assert.equal(mapped.name, "Cliente VIP");
  assert.equal(mapped.unread, 3);
  assert.equal(mapped.aiPaused, true);
  assert.equal(mapped.conversationKey, "ws-1:inst-1:5511999991111");
});

test("mapMessageDto sets explicit states and never starts as read", () => {
  const mapped = mapMessageDto({
    id: "msg-1",
    chat_id: "chat-100",
    direction: "outbound",
    message_type: "text",
    content: "Tudo pronto!",
    status: "sent",
    created_at: new Date().toISOString(),
  });

  assert.equal(mapped.sender, "agent");
  assert.equal(mapped.status, "sent");
  assert.equal(mapped.text, "Tudo pronto!");
});

test("formatAudioDuration formats numbers to mm:ss cleanly", () => {
  assert.equal(formatAudioDuration(0), "00:00");
  assert.equal(formatAudioDuration(45), "00:45");
  assert.equal(formatAudioDuration(75), "01:15");
  assert.equal(formatAudioDuration(360), "06:00");
});

test("WhatsApp LID identifiers are never formatted as international phone numbers", () => {
  function isWhatsAppLid(phone?: string | null): boolean {
    if (!phone) return false;
    if (phone.includes("@lid")) return true;
    const digits = phone.replace(/\D/g, "");
    if (digits.length >= 14 && !digits.startsWith("55")) return true;
    return false;
  }

  function formatPhoneNumber(phone?: string | null): string {
    if (!phone || isWhatsAppLid(phone)) return "";
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
      const ddd = digits.slice(2, 4);
      const rest = digits.slice(4);
      if (rest.length === 9) {
        return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
      } else if (rest.length === 8) {
        return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
      }
    }
    if (digits.length >= 10 && digits.length <= 13) {
      return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
    }
    return "";
  }

  // LIDs must be detected and never formatted as fake phone numbers (+27, +15, +47)
  assert.equal(isWhatsAppLid("27772714909939"), true);
  assert.equal(isWhatsAppLid("156126926655578"), true);
  assert.equal(isWhatsAppLid("47618671534102"), true);
  assert.equal(isWhatsAppLid("user@lid"), true);

  assert.equal(formatPhoneNumber("27772714909939"), "");
  assert.equal(formatPhoneNumber("156126926655578"), "");
  assert.equal(formatPhoneNumber("47618671534102"), "");

  // Valid Brazilian phones must format correctly
  assert.equal(formatPhoneNumber("5511999998888"), "+55 11 99999-8888");
  assert.equal(formatPhoneNumber("5521988887777"), "+55 21 98888-7777");
});

test("deduplicateMessages cleans identical and optimistic messages cleanly", () => {
  interface TestMessage {
    id: string;
    clientMessageId: string | null;
    externalId: string | null;
    text: string;
  }

  function deduplicateMessages(list: TestMessage[]): TestMessage[] {
    const seenIds = new Set<string>();
    const seenExtIds = new Set<string>();
    const seenClientIds = new Set<string>();
    const result: TestMessage[] = [];

    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]!;
      if (m.clientMessageId && seenClientIds.has(m.clientMessageId)) continue;
      if (m.externalId && seenExtIds.has(m.externalId)) continue;
      if (seenIds.has(m.id)) continue;

      seenIds.add(m.id);
      if (m.externalId) seenExtIds.add(m.externalId);
      if (m.clientMessageId) seenClientIds.add(m.clientMessageId);
      result.unshift(m);
    }
    return result;
  }

  const list = [
    { id: "optimistic-uuid-1", clientMessageId: "uuid-1", text: "Oi", externalId: null },
    { id: "db-uuid-1", clientMessageId: "uuid-1", text: "Oi", externalId: "ext-1" },
    { id: "db-uuid-2", clientMessageId: null, text: "Tudo bem?", externalId: "ext-2" },
    { id: "db-uuid-2", clientMessageId: null, text: "Tudo bem?", externalId: "ext-2" },
  ];

  const deduped = deduplicateMessages(list);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].id, "db-uuid-1");
  assert.equal(deduped[1].id, "db-uuid-2");
});

test("mapMessageDto handles deleted messages, edited messages and reactions", () => {
  const deletedMsg = mapMessageDto({
    id: "msg-del",
    chat_id: "chat-100",
    type: "deleted",
    text: "Mensagem apagada",
  });
  assert.equal(deletedMsg.type, "deleted");
  assert.equal(deletedMsg.text, "Mensagem apagada");

  const editedMsg = mapMessageDto({
    id: "msg-edit",
    chat_id: "chat-100",
    type: "text",
    text: "Texto corrigido",
    quoted_message: {
      isEdited: true,
      reactions: [{ emoji: "❤️", senderPhone: "5511999991111" }],
    },
  });
  assert.equal(editedMsg.isEdited, true);
  assert.equal(editedMsg.reactions?.length, 1);
  assert.equal(editedMsg.reactions?.[0]?.emoji, "❤️");
});

test("extractQuotedMessage parses Evolution API contextInfo and quotedMessage correctly", () => {
  // Test case 1: Evolution API contextInfo on root rawRecord
  const rawRecord = {
    contextInfo: {
      stanzaId: "STZ-9988",
      participant: "5511988887777@s.whatsapp.net",
      quotedMessage: {
        conversation: "Das 22:00 e tá todo mundo em forma de 12°",
      },
    },
  };
  const quoted1 = extractQuotedMessage({ conversation: "." }, rawRecord);
  assert.ok(quoted1);
  assert.equal(quoted1.id, "STZ-9988");
  assert.equal(quoted1.text, "Das 22:00 e tá todo mundo em forma de 12°");
  assert.equal(quoted1.senderPhone, "5511988887777");
  assert.equal(quoted1.type, "text");

  // Test case 2: contextInfo inside message extendedTextMessage
  const messageWithExtended = {
    extendedTextMessage: {
      text: "Entendido!",
      contextInfo: {
        stanzaId: "STZ-1122",
        quotedMessage: {
          imageMessage: { caption: "Foto de referência", mimetype: "image/jpeg" },
        },
      },
    },
  };
  const quoted2 = extractQuotedMessage(messageWithExtended);
  assert.ok(quoted2);
  assert.equal(quoted2.id, "STZ-1122");
  assert.equal(quoted2.text, "Foto de referência");
  assert.equal(quoted2.type, "image");

  // Test case 3: non-quoted message returns null
  assert.equal(extractQuotedMessage({ conversation: "Mensagem simples" }), null);
});

test("emoji normalization preserves complete WhatsApp names and media previews", async () => {
  const { stripEmojis, sanitizeSenderName, sanitizeChatName, sanitizeMessagePreview } =
    await import("../src/lib/emoji.ts");

  assert.equal(stripEmojis("BeforeXilf - 69/69 🎬"), "BeforeXilf - 69/69 🎬");
  assert.equal(stripEmojis("Design & Networking 💜"), "Design & Networking 💜");
  assert.equal(stripEmojis("Mamãe ❤️"), "Mamãe ❤️");
  assert.equal(stripEmojis("Araújo 🎩👑"), "Araújo 🎩👑");

  // Preserve accented Portuguese and numbers
  assert.equal(stripEmojis("João da Silva - Ação 123!"), "João da Silva - Ação 123!");

  // Sanitize sender name: never returns 'Participante'
  assert.equal(sanitizeSenderName("🎰", "+55 83 9835-9954"), "🎰");
  assert.equal(sanitizeSenderName("👻", null), "👻");
  assert.equal(sanitizeSenderName("Lipee", "+55 83 9821-4768"), "Lipee");

  // Sanitize chat name
  assert.equal(sanitizeChatName("BeforeXilf - 69/69 🎬", true), "BeforeXilf - 69/69 🎬");
  assert.equal(sanitizeChatName("🎬", true), "🎬");
  assert.equal(sanitizeChatName("🎬", false, "+55 83 9835-9954"), "🎬");

  // Sanitize message preview (media prefixes stripped)
  assert.equal(sanitizeMessagePreview("🎥 Vídeo", "video"), "🎥 Vídeo");
  assert.equal(sanitizeMessagePreview("📷 Foto", "image"), "📷 Foto");
  assert.equal(sanitizeMessagePreview("🎵 Áudio", "audio"), "🎵 Áudio");
  assert.equal(sanitizeMessagePreview(null, "sticker"), "Figurinha");
});

test("group message routing correctly prioritizes group JID over participant remoteJidAlt", () => {
  const groupKey = {
    remoteJid: "120363426286939907@g.us",
    remoteJidAlt: "5511999998888@s.whatsapp.net",
    participant: "5511999998888@s.whatsapp.net",
  };

  const isGroup = Boolean(groupKey.remoteJid?.endsWith("@g.us"));
  assert.equal(isGroup, true);

  // O identificador do chat DEVE ser o JID do grupo, NUNCA o participante:
  const phone = isGroup
    ? normalizePhone(groupKey.remoteJid)
    : normalizePhone(groupKey.remoteJidAlt || groupKey.remoteJid);

  assert.equal(phone, "120363426286939907");
  assert.notEqual(phone, "5511999998888");

  // Já para contatos normais 1-a-1:
  const directKey = {
    remoteJid: "5511999997777@s.whatsapp.net",
    remoteJidAlt: undefined,
  };
  const isDirectGroup = Boolean(directKey.remoteJid?.endsWith("@g.us"));
  assert.equal(isDirectGroup, false);

  const directPhone = isDirectGroup
    ? normalizePhone(directKey.remoteJid)
    : normalizePhone(directKey.remoteJidAlt || directKey.remoteJid);
  assert.equal(directPhone, "5511999997777");
});

test("mapChatDto maps group announcement and canSend permissions accurately", () => {
  // Caso 1: Grupo restrito por administrador e bot não é admin -> canSend deve ser false
  const lockedGroup = mapChatDto({
    id: "grp-1",
    phone: "120363426286939907",
    name: "Grupo Somente Admins",
    is_group: true,
    isAnnouncement: true,
    canSend: false,
    isAdmin: false,
  });

  assert.equal(lockedGroup.isGroup, true);
  assert.equal(lockedGroup.isAnnouncement, true);
  assert.equal(lockedGroup.canSend, false);
  assert.equal(lockedGroup.isAdmin, false);

  // Caso 2: Grupo restrito por administrador mas o bot É admin -> canSend deve ser true
  const adminGroup = mapChatDto({
    id: "grp-2",
    phone: "120363426286939908",
    name: "Grupo Onde Sou Admin",
    is_group: true,
    isAnnouncement: true,
    canSend: true,
    isAdmin: true,
  });

  assert.equal(adminGroup.isGroup, true);
  assert.equal(adminGroup.isAnnouncement, true);
  assert.equal(adminGroup.canSend, true);
  assert.equal(adminGroup.isAdmin, true);

  // Caso 3: Grupo aberto normal -> canSend sempre true
  const openGroup = mapChatDto({
    id: "grp-3",
    phone: "120363426286939909",
    name: "Grupo Aberto Geral",
    is_group: true,
    isAnnouncement: false,
    canSend: true,
  });

  assert.equal(openGroup.isGroup, true);
  assert.equal(openGroup.isAnnouncement, false);
  assert.equal(openGroup.canSend, true);
});

test("premium workspace navigation matches the product information architecture", () => {
  assert.deepEqual(
    appNavigationGroups.map((group) => ({
      label: group.label,
      items: group.items.map((item) => item.id),
    })),
    [
      { label: "HOME", items: ["dashboard", "crm", "clientes"] },
      { label: "GESTÃO", items: ["inbox", "follow-up", "calendario", "conexoes"] },
      { label: "AUTOMAÇÕES", items: ["agentes"] },
    ],
  );

  for (const view of [
    "dashboard",
    "crm",
    "clientes",
    "inbox",
    "follow-up",
    "calendario",
    "conexoes",
    "agentes",
    "configuracoes",
  ] as const) {
    assert.equal(getAppViewMeta(view).implemented, true);
  }
});

test("workspace product areas use real endpoints and persistent modules instead of placeholders", () => {
  const api = readFileSync(
    new URL("../src/features/inbox/workspace-product-api.ts", import.meta.url),
    "utf8",
  );
  const server = readFileSync(
    new URL("../src/server/product/workspace-product.server.ts", import.meta.url),
    "utf8",
  );
  const views = readFileSync(
    new URL("../src/features/inbox/components/ProductViews.tsx", import.meta.url),
    "utf8",
  );
  const migration = readFileSync(
    new URL("../supabase/migrations/20260929011845_workspace_product_modules.sql", import.meta.url),
    "utf8",
  );
  for (const path of [
    "/api/dashboard/",
    "/api/crm/",
    "/api/follow-up/",
    "/api/agents/",
    "/api/billing/",
  ])
    assert.equal(api.includes(path), true);
  assert.match(server, /requirePermission\(request, "crm\.manage"\)/);
  assert.match(server, /GROQ_API_KEY/);
  assert.match(server, /maybeRunAutomaticAgent/);
  assert.match(views, /DashboardView/);
  assert.match(views, /CrmView/);
  assert.match(views, /FollowUpView/);
  assert.match(views, /AgentsView/);
  assert.match(migration, /create table if not exists public\.crm_leads/i);
  assert.match(migration, /create table if not exists public\.automation_agents/i);
});

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolveInboxComposition } from "../src/features/inbox/layout-state.ts";
import {
  normalizePhoneE164,
  isValidCnpj,
  evaluatePassword,
  normalizeOtp,
} from "../src/features/auth/auth-validation.ts";
import { LEGAL_DOCUMENTS, getLegalDocument } from "../src/features/legal/legal-documents.ts";
import {
  clearRegistrationLegalConsentCookie,
  createRegistrationLegalConsentCookie,
  hasReachedLegalDocumentEnd,
  hasRegistrationLegalConsentCookie,
} from "../src/features/legal/legal-consent.ts";
import {
  extractBearerToken,
  normalizePermissionOverrides,
  requestedWorkspaceId,
  roleHasPermission,
} from "../src/server/middleware/auth-policy.ts";
import {
  generateSixDigitCode,
  hashAuthValue,
  passwordHistoryFingerprint,
  secureStringEquals,
} from "../src/server/auth/auth-crypto.ts";
import {
  registrationRateLimitKeys,
  validateRegistrationPayload,
} from "../src/server/auth/registration-policy.ts";
import { verificationCodeEmail } from "../src/server/email/templates.ts";
import { getOrCreateDeviceToken } from "../src/lib/device-token.ts";

test("responsive inbox composition keeps desktop and mobile trees separated", () => {
  assert.deepEqual(
    resolveInboxComposition({ isDesktop: true, currentView: "inbox", hasActiveChat: true }),
    { showConversationList: true, showChatPane: true, showMobileDock: false },
  );
  assert.deepEqual(
    resolveInboxComposition({ isDesktop: false, currentView: "inbox", hasActiveChat: false }),
    { showConversationList: true, showChatPane: false, showMobileDock: true },
  );
  assert.deepEqual(
    resolveInboxComposition({
      isDesktop: false,
      currentView: "configuracoes",
      hasActiveChat: true,
    }),
    { showConversationList: false, showChatPane: false, showMobileDock: true },
  );
});
test("global document does not force smooth scrolling", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /html\s*\{\s*scroll-behavior:\s*smooth;/);
  assert.match(css, /\.smooth-scroll\s*\{[^}]*scroll-behavior:\s*smooth;/s);
});
test("auth validation normalizes phone, CNPJ, password and OTP", () => {
  assert.equal(normalizePhoneE164("BR", "(83) 9 9999-8888"), "+5583999998888");
  assert.equal(isValidCnpj("54.104.241/0001-00"), true);
  assert.equal(isValidCnpj("54.104.241/0001-01"), false);
  assert.equal(evaluatePassword("abc").valid, false);
  assert.equal(evaluatePassword("InboxOS#2026").valid, true);
  assert.equal(normalizeOtp("12 3a45-678"), "123456");
});
test("legal catalog mirrors five versioned documents and scroll gate", () => {
  assert.equal(LEGAL_DOCUMENTS.length, 5);
  assert.equal(getLegalDocument("terms-of-use")?.required, true);
  assert.equal(getLegalDocument("privacy-policy")?.required, true);
  assert.equal(
    hasReachedLegalDocumentEnd({ scrollTop: 800, clientHeight: 400, scrollHeight: 1200 }),
    true,
  );
  assert.equal(
    hasReachedLegalDocumentEnd({ scrollTop: 799, clientHeight: 400, scrollHeight: 1200 }),
    false,
  );
});
test("registration legal consent cookie is scoped, short-lived and rejects invalid values", () => {
  const now = 1_800_000_000_000;
  const cookie = createRegistrationLegalConsentCookie(now);
  assert.match(cookie, /inboxos_registration_legal_consent=1800001800000/);
  assert.match(cookie, /Max-Age=1800/);
  assert.match(cookie, /Path=\/auth\/register/);
  assert.equal(hasRegistrationLegalConsentCookie(cookie, now), true);
  assert.equal(hasRegistrationLegalConsentCookie(cookie, now + 30 * 60 * 1000), false);
  assert.equal(
    hasRegistrationLegalConsentCookie("inboxos_registration_legal_consent=not-a-timestamp", now),
    false,
  );
  assert.equal(
    hasRegistrationLegalConsentCookie("inboxos_registration_legal_consent=%", now),
    false,
  );
  assert.match(clearRegistrationLegalConsentCookie(), /Max-Age=0/);
});
test("auth policy requires explicit workspace and maps permissions", () => {
  assert.equal(extractBearerToken(new Request("https://x.test")), null);
  assert.equal(
    extractBearerToken(new Request("https://x.test", { headers: { Authorization: "Bearer abc" } })),
    "abc",
  );
  assert.equal(requestedWorkspaceId(new Request("https://x.test?workspace_id=ignored")), null);
  assert.equal(
    requestedWorkspaceId(new Request("https://x.test", { headers: { "x-workspace-id": "ws" } })),
    "ws",
  );
  assert.equal(roleHasPermission("agent", "messages.send"), true);
  assert.equal(roleHasPermission("agent", "members.manage"), false);
  assert.equal(roleHasPermission("owner", "billing.manage"), true);
  assert.equal(roleHasPermission("agent", "messages.send", { "messages.send": false }), false);
  assert.equal(roleHasPermission("agent", "members.manage", { "members.manage": true }), false);
  assert.deepEqual(normalizePermissionOverrides({ "messages.send": false, unknown: true }), {
    "messages.send": false,
  });
});
test("human auth and client workspace contain no legacy tenant fallback", () => {
  const a = readFileSync(new URL("../src/server/middleware/auth.ts", import.meta.url), "utf8"),
    w = readFileSync(new URL("../src/lib/current-workspace.ts", import.meta.url), "utf8");
  assert.doesNotMatch(a, /local-user|DEFAULT_WORKSPACE_ID|STRICT_AUTH/);
  assert.match(a, /\.eq\(\s*"status"\s*,\s*"active"\s*\)/);
  assert.doesNotMatch(w, /00000000-0000-0000-0000-000000000001|DEFAULT_WORKSPACE_ID/);
  assert.doesNotMatch(w, /workspace_members/);
  assert.match(w, /\/api\/workspaces\//);
});
test("repository drops stale Supabase project link", () => {
  assert.equal(
    existsSync(new URL("../supabase/.temp/linked-project.json", import.meta.url)),
    false,
  );
  assert.match(
    readFileSync(new URL("../.gitignore", import.meta.url), "utf8"),
    /supabase\/\.temp\//,
  );
});
test("auth crypto scopes OTP and fingerprints password history", () => {
  const s = "test-secret-with-at-least-32-characters";
  const a = hashAuthValue(s, "register", "123456"),
    b = hashAuthValue(s, "register", "123456"),
    c = hashAuthValue(s, "reset", "123456");
  assert.equal(secureStringEquals(a, b), true);
  assert.notEqual(a, c);
  assert.match(generateSixDigitCode(), /^\d{6}$/);
  const p = passwordHistoryFingerprint(s, "user-a", "correct horse battery staple");
  assert.equal(p, passwordHistoryFingerprint(s, "user-a", "correct horse battery staple"));
  assert.notEqual(p, passwordHistoryFingerprint(s, "user-b", "correct horse battery staple"));
  assert.match(p, /^scrypt:v1:/);
});
test("registration policy validates and normalizes without raw PII rate scopes", () => {
  const v = validateRegistrationPayload({
    accountKind: "person",
    firstName: " Ana ",
    lastName: " Lima ",
    email: " ANA@EXAMPLE.COM ",
    countryCode: "BR",
    phone: "(83) 99999-9999",
    password: "Senha-Forte-2026!",
    acceptedTerms: true,
    acceptedPrivacy: true,
  });
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.value.email, "ana@example.com");
    assert.equal(v.value.phoneE164, "+5583999999999");
  }
  assert.deepEqual(validateRegistrationPayload(null), { ok: false, errors: ["payload"] });
  const keys = registrationRateLimitKeys("test-secret-with-at-least-32-characters", {
    email: "ana@example.com",
    deviceToken: "device",
    ip: "203.0.113.7",
  });
  assert.equal(keys.length, 4);
  assert.ok(keys.every((x) => /^[a-f0-9]{64}$/.test(x)));
  assert.ok(keys.every((x) => !x.includes("ana@example.com")));
});
test("registration policy rejects missing or revoked legal consent independently of cookies", () => {
  const payload = {
    accountKind: "person" as const,
    firstName: "Ana",
    lastName: "Lima",
    email: "ana@example.com",
    countryCode: "BR" as const,
    phone: "(83) 99999-9999",
    password: "Senha-Forte-2026!",
    acceptedTerms: true,
    acceptedPrivacy: true,
  };
  assert.deepEqual(validateRegistrationPayload({ ...payload, acceptedTerms: false }), {
    ok: false,
    errors: ["legal"],
  });
  assert.deepEqual(validateRegistrationPayload({ ...payload, acceptedPrivacy: false }), {
    ok: false,
    errors: ["legal"],
  });
  const { acceptedPrivacy: _acceptedPrivacy, ...missingPrivacy } = payload;
  assert.deepEqual(validateRegistrationPayload(missingPrivacy), {
    ok: false,
    errors: ["payload"],
  });
});
test("verification email is accessible and has no tracking pixel", () => {
  const e = verificationCodeEmail({ code: "482913", purpose: "register" });
  assert.match(e.text, /482913/);
  assert.match(e.html, /482913/);
  assert.doesNotMatch(e.html, /<img|tracking|pixel/i);
});
test("workspace email uses tenant branding without trusting raw markup", () => {
  const e = verificationCodeEmail({
    code: "482913",
    purpose: "register",
    branding: { brandName: "Acme <script>", senderName: "Acme\nOps" },
  });
  assert.match(e.subject, /Acme <script>/);
  assert.match(e.html, /Acme &lt;script&gt;/);
  assert.doesNotMatch(e.html, /<script>/);
});
test("device token is random and stable in browser storage", () => {
  const m = new Map<string, string>(),
    storage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => {
        m.set(k, v);
      },
    };
  let calls = 0;
  const f = () => `random-device-${++calls}`;
  assert.equal(getOrCreateDeviceToken(storage, f), "random-device-1");
  assert.equal(getOrCreateDeviceToken(storage, f), "random-device-1");
  assert.equal(calls, 1);
});
test("registration backend and pages wire OTP, Supabase provision and Resend server-side", () => {
  const b = readFileSync(
      new URL("../src/server/auth/registration.server.ts", import.meta.url),
      "utf8",
    ),
    r = readFileSync(new URL("../src/server/email/resend.server.ts", import.meta.url), "utf8"),
    reg = readFileSync(new URL("../src/routes/auth/register.tsx", import.meta.url), "utf8"),
    ver = readFileSync(new URL("../src/routes/auth/verify.tsx", import.meta.url), "utf8");
  assert.match(b, /consume_auth_rate_limit/);
  assert.match(b, /claim_email_challenge/);
  assert.match(b, /provision_verified_account_v2/);
  assert.match(b, /email_confirm\s*:\s*true/);
  assert.match(r, /process\.env\["RESEND_API_KEY"\]/);
  assert.match(r, /api\.resend\.com\/emails/);
  assert.doesNotMatch(r, /VITE_RESEND/);
  assert.match(reg, /\/api\/auth\/register\/start/);
  assert.match(reg, /x-device-token/);
  assert.match(ver, /\/api\/auth\/register\/verify/);
  assert.match(ver, /\/api\/auth\/register\/resend/);
});

test("registration removes the legacy default-workspace auto-grant", () => {
  const server = readFileSync(
    new URL("../src/server/auth/registration.server.ts", import.meta.url),
    "utf8",
  );
  const repair = readFileSync(
    new URL(
      "../supabase/migrations/20261017090000_repair_workspace_isolation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(server, /staleMembershipError/);
  assert.match(server, /defaultWorkspaceId/);
  assert.match(server, /invitedWorkspaceId !== defaultWorkspaceId/);
  assert.match(repair, /delete from public\.workspace_members/i);
  assert.match(repair, /returns trigger/i);
  assert.match(repair, /return new/i);
});

test("registration cleans all temporary artifacts when verification email delivery fails", () => {
  const source = readFileSync(
    new URL("../src/server/auth/registration.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /cleanupRegistrationArtifacts/);
  assert.match(source, /email_challenges.*delete/);
  assert.match(source, /pending_registrations.*delete/);
  assert.match(source, /instanceof ResendDeliveryError/);
  assert.match(source, /503/);
});

test("root route gates InboxShell behind a real Supabase session", () => {
  const source = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  assert.match(source, /supabase\.auth\.getSession/);
  assert.match(source, /window\.location\.replace\("\/auth\/login"\)/);
  assert.doesNotMatch(source, /local-user|DEFAULT_WORKSPACE_ID/);
});
test("root route transition keeps navigation movement short and accessible", () => {
  const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(root, /useRouterState/);
  assert.match(root, /route-transition-shell/);
  assert.match(css, /inboxos-route-enter 180ms/);
  assert.match(css, /route-transition-shell[\s\S]*animation: none !important/);
  assert.doesNotMatch(css, /@view-transition\s*\{\s*navigation:\s*auto/);
});
test("integration contract no longer expects anonymous private APIs", () => {
  const source = readFileSync(new URL("./integration.test.ts", import.meta.url), "utf8");
  assert.match(source, /APIs privadas exigem autenticação/);
  assert.doesNotMatch(source, /modo sem página de autenticação|status, 200/);
});

import {
  parseSupabaseSessionClaims,
  appSessionTokenHash,
} from "../src/server/auth/session-token.ts";
test("app session identity uses stable JWT session_id instead of raw access token", () => {
  const payload = Buffer.from(
    JSON.stringify({ session_id: "session-123", exp: 1893456000 }),
  ).toString("base64url");
  const token = `x.${payload}.y`;
  assert.deepEqual(parseSupabaseSessionClaims(token), {
    sessionId: "session-123",
    expiresAt: 1893456000,
  });
  const hash = appSessionTokenHash("test-secret-with-at-least-32-characters", "session-123");
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, "session-123");
});
test("login implementation requires device challenge for untrusted devices and creates revocable app session", () => {
  const source = readFileSync(
    new URL("../src/server/auth/login.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /login_device/);
  assert.match(source, /user_devices/);
  assert.match(source, /trusted_until/);
  assert.match(source, /renewTrustedDevice/);
  assert.match(source, /trusted device was revoked during login/);
  assert.match(source, /user_sessions/);
  assert.match(source, /token_hash/);
  assert.match(source, /claim_email_challenge/);
  assert.match(source, /90\s*\*\s*24\s*\*\s*60\s*\*\s*60/);
  assert.match(source, /ResendDeliveryError/);
  assert.match(source, /email_challenges.*delete/);
  assert.match(source, /servi[çc]o de verifica/);
});
test("requireAuth rejects revoked sessions and rate-limits protected mutations with database enforcement", () => {
  const source = readFileSync(new URL("../src/server/middleware/auth.ts", import.meta.url), "utf8");
  assert.match(source, /user_sessions/);
  assert.match(source, /revoked_at/);
  assert.match(source, /token_hash/);
  assert.match(source, /appSessionTokenHash/);
  assert.match(source, /consume_auth_rate_limit/);
  assert.match(source, /api-mutation/);
  assert.match(source, /p_limit\s*:\s*300/);
});

test("password recovery is anti-enumeration, grant-based and checks the last three password hashes", () => {
  const source = readFileSync(
    new URL("../src/server/auth/password-recovery.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /lookup_auth_user_by_email/);
  assert.match(source, /password_reset/);
  assert.match(source, /claim_email_challenge/);
  assert.match(source, /grant_token_hash/);
  assert.match(source, /\.limit\(3\)/);
  assert.match(source, /passwordHistoryFingerprint/);
  assert.match(source, /updateUserById/);
  assert.match(source, /user_sessions/);
  assert.match(source, /Se o e-mail estiver cadastrado/);
});
test("forgot password UI performs start, verify and reset without revealing account existence", () => {
  const source = readFileSync(
    new URL("../src/routes/auth/forgot-password.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /\/api\/auth\/password\/start/);
  assert.match(source, /\/api\/auth\/password\/verify/);
  assert.match(source, /\/api\/auth\/password\/reset/);
  assert.match(source, /Se o e-mail estiver cadastrado/);
});

test("password recovery returns an opaque challenge id without account-existence branching in the client", () => {
  const server = readFileSync(
      new URL("../src/server/auth/password-recovery.server.ts", import.meta.url),
      "utf8",
    ),
    ui = readFileSync(new URL("../src/routes/auth/forgot-password.tsx", import.meta.url), "utf8");
  assert.match(server, /user_id\s*:\s*row\?\.user_id\s*\?\?\s*null/);
  assert.match(server, /challengeId/);
  assert.match(ui, /if \(data\.challengeId\) setChallengeId\(data\.challengeId\)/);
  assert.doesNotMatch(ui, /Cole o ID recebido/);
});

test("security session endpoints support listing and revocation scoped to the authenticated user", () => {
  const source = readFileSync(
    new URL("../src/server/auth/security-sessions.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /requireAuth/);
  assert.match(source, /user_devices/);
  assert.match(source, /user_sessions/);
  assert.match(source, /revoke_others/);
  assert.match(source, /revoked_at/);
  assert.match(source, /user_id/);
});
test("apiFetch emits a session-revoked signal on protected 401 responses", () => {
  const source = readFileSync(new URL("../src/lib/api-fetch.ts", import.meta.url), "utf8");
  assert.match(source, /inboxos:session-revoked/);
  assert.match(source, /response\.status\s*===\s*401/);
});
test("root route renders a disconnected-device overlay when the app session is revoked", () => {
  const source = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  assert.match(source, /Este dispositivo foi desconectado/);
  assert.match(source, /inboxos:session-revoked/);
});

test("profile backend scopes personal and company writes and rejects immutable tenant identity fields", () => {
  const source = readFileSync(
    new URL("../src/server/auth/profile.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /requireAuth/);
  assert.match(source, /requireWorkspace/);
  assert.match(source, /workspace_company_profiles/);
  assert.match(source, /profiles/);
  assert.match(source, /profile-media/);
  assert.match(source, /user_id|userId/);
  assert.match(source, /workspace_id|workspaceId/);
  assert.match(source, /isValidCnpj/);
  assert.match(source, /normalizePhoneE164/);
});

test("email change requires old-email OTP then new-email OTP before mutating auth identity", () => {
  const s = readFileSync(
    new URL("../src/server/auth/email-change.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(s, /email_change_old/);
  assert.match(s, /email_change_new/);
  assert.match(s, /claim_email_challenge/);
  assert.match(s, /updateUserById/);
  assert.match(s, /profiles/);
  assert.match(s, /email\.changed/);
  const mutation = s.indexOf("updateUserById"),
    secondClaim = s.lastIndexOf("claim_email_challenge");
  assert.ok(mutation > secondClaim, "email must change only after second OTP claim");
});

test("phone change stores E.164 only after an authenticated OTP challenge", () => {
  const s = readFileSync(
    new URL("../src/server/auth/phone-change.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(s, /phone_change/);
  assert.match(s, /normalizePhoneE164/);
  assert.match(s, /claim_email_challenge/);
  assert.match(s, /profiles/);
  const verify = s.slice(s.indexOf("export async function verifyPhoneChange"));
  const update = verify.indexOf("phone_e164"),
    claim = verify.indexOf("claim_email_challenge");
  assert.ok(update > claim);
});
test("workspace backend scopes member mutations, invitations and active workspace to verified membership", () => {
  const s = readFileSync(
    new URL("../src/server/workspace/workspaces.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(s, /requirePermission/);
  assert.match(s, /members\.manage/);
  assert.match(s, /workspace_invitations/);
  assert.match(s, /token_hash/);
  assert.match(s, /workspace_members/);
  assert.match(s, /last_workspace_id/);
  assert.match(s, /status.*active/);
  assert.doesNotMatch(s, /DEFAULT_WORKSPACE_ID|00000000-0000-0000-0000-000000000001/);
});

test("registration validates workspace invitation token before persisting invitation_id", () => {
  const policy = readFileSync(
      new URL("../src/server/auth/registration-policy.ts", import.meta.url),
      "utf8",
    ),
    server = readFileSync(
      new URL("../src/server/auth/registration.server.ts", import.meta.url),
      "utf8",
    ),
    ui = readFileSync(new URL("../src/routes/auth/register.tsx", import.meta.url), "utf8");
  assert.match(policy, /invitationToken/);
  assert.match(server, /workspace_invitations/);
  assert.match(server, /workspace-invite/);
  assert.match(server, /secureStringEquals/);
  assert.match(ui, /invitationToken/);
  const persist = server.indexOf("invitation_id:"),
    verify = server.indexOf("token_hash");
  assert.ok(verify >= 0 && verify < persist);
});

test("Evolution server requires explicit workspace context and contains no default tenant UUID", () => {
  for (const file of ["../src/lib/evolution.server.ts", "../src/server/evolution/sync-engine.ts"]) {
    const s = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(s, /00000000-0000-0000-0000-000000000001|DEFAULT_WORKSPACE_ID/);
  }
  const lib = readFileSync(new URL("../src/lib/evolution.server.ts", import.meta.url), "utf8");
  assert.match(lib, /workspaceId: string;/);
});

test("notification email delivery is audited through system events before Resend", () => {
  const delivery = readFileSync(
      new URL("../src/server/email/delivery.server.ts", import.meta.url),
      "utf8",
    ),
    resend = readFileSync(new URL("../src/server/email/resend.server.ts", import.meta.url), "utf8");
  assert.match(delivery, /system_events/);
  assert.match(delivery, /notification_deliveries/);
  assert.match(delivery, /sendTransactionalEmail/);
  assert.match(resend, /Idempotency-Key/);
  assert.match(
    readFileSync(new URL("../src/server/email/resend-retry-policy.ts", import.meta.url), "utf8"),
    /429/,
  );
  assert.match(resend, /attempts/);
});

test("duplicate WhatsApp instance index cleanup keeps the canonical global identity index", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260927102921_drop_duplicate_whatsapp_instance_name_index.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /drop index if exists public\.idx_whatsapp_instances_global_name/i);
  assert.doesNotMatch(
    migration,
    /drop index if exists public\.whatsapp_instances_evolution_name_unique/i,
  );
});

test("route tree includes every current file route including workspace product APIs", () => {
  const tree = readFileSync(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8");
  const routeSources = [
    "/api/dashboard/",
    "/api/crm/",
    "/api/crm/stages",
    "/api/follow-up/",
    "/api/agents/",
    "/api/agents/test",
    "/api/billing/",
  ];
  for (const route of routeSources) assert.equal(tree.includes(`'${route}'`), true);
  const visit = (dir: URL): number =>
    readdirSync(dir, { withFileTypes: true }).reduce((count, entry) => {
      const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
      if (entry.isDirectory()) return count + visit(path);
      if (!/\.(tsx?|mts)$/.test(entry.name)) return count;
      return count + (readFileSync(path, "utf8").includes("createFileRoute(") ? 1 : 0);
    }, 0);
  assert.equal(
    (tree.match(/RouteImport\.update\(/g) ?? []).length,
    visit(new URL("../src/routes/", import.meta.url)),
  );
});

test("workspace product runtime guards prevent duplicate auto replies and cross-tenant references", () => {
  const relational = readFileSync(
    new URL(
      "../supabase/migrations/20260929013234_workspace_product_relational_guards.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const runtime = readFileSync(
    new URL(
      "../supabase/migrations/20260929014139_workspace_product_runtime_guards.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const ownerGuards = readFileSync(
    new URL(
      "../supabase/migrations/20260930155753_workspace_product_owner_guards.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const server = readFileSync(
    new URL("../src/server/product/workspace-product.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(relational, /foreign key \(workspace_id, stage_id\)/i);
  assert.match(relational, /foreign key \(workspace_id, instance_id\)/i);
  assert.match(relational, /foreign key \(workspace_id, trigger_message_id\)/i);
  assert.match(runtime, /automation_agent_runs_agent_trigger_uidx/i);
  assert.match(runtime, /automation_agents_one_auto_instance_uidx/i);
  assert.match(runtime, /workspace_billing_provider_subscription_uidx/i);
  assert.match(ownerGuards, /foreign key \(workspace_id, owner_user_id\)/i);
  assert.match(ownerGuards, /references public\.workspace_members\(workspace_id, user_id\)/i);
  assert.match(server, /\.eq\("status", "active"\)/);
  assert.match(server, /pipelineByCurrency/);
  assert.match(server, /outbound_messages/);
  assert.match(server, /persistMessage\(\{/);
});

test("logout revokes the current app session before clearing the browser session", () => {
  const security = readFileSync(
    new URL("../src/server/auth/security-sessions.server.ts", import.meta.url),
    "utf8",
  );
  const rail = readFileSync(
    new URL("../src/features/inbox/components/AccountRail.tsx", import.meta.url),
    "utf8",
  );
  assert.match(security, /revoke_current/);
  assert.match(security, /revoke_reason\s*:\s*"logout"/);
  assert.match(rail, /securityAction\("revoke_current"\)/);
  assert.match(rail, /supabase\.auth\.signOut\(\)/);
});
