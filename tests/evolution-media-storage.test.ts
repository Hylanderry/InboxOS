import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMediaStoragePath } from "../src/server/evolution/media-storage.ts";

test("media storage paths are tenant-scoped for every inbound and outbound asset", () => {
  const path = buildMediaStoragePath("workspace-123", "image/png", "foto.png", "chat");

  assert.match(path, /^workspace-123\/chat\/\d{4}-\d{2}-\d{2}\/\d+-[a-z0-9]+\.png$/);
  assert.ok(path.startsWith("workspace-123/"));
});

test("chat media bucket is private and service-role-only", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261019131000_chat_media_bucket_boundary.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /insert into storage\.buckets/i);
  assert.match(migration, /'chat-media'.*false/s);
  assert.match(migration, /chat_media_service_read[\s\S]*to service_role/i);
  assert.match(migration, /chat_media_service_insert[\s\S]*to service_role/i);
  assert.match(migration, /chat_media_service_update[\s\S]*to service_role/i);
  assert.match(migration, /chat_media_service_delete[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /to (?:public|anon|authenticated)\s+(?:for|using|with)/i);
});

test("media storage path keeps safe extension for GIF, audio, video and documents", () => {
  assert.match(buildMediaStoragePath("ws", "image/gif", "sticker.gif", "chat"), /\.gif$/);
  assert.match(buildMediaStoragePath("ws", "audio/ogg", "voice.ogg", "chat"), /\.ogg$/);
  assert.match(buildMediaStoragePath("ws", "video/mp4", "clip.mp4", "chat"), /\.mp4$/);
  assert.match(buildMediaStoragePath("ws", "application/pdf", "arquivo.pdf", "chat"), /\.pdf$/);
});

test("failed outbound media releases its temporary object URL", () => {
  const source = readFileSync(
    new URL("../src/features/inbox/hooks/useMessages.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /const details = errorDetails\(error, "Erro de envio"\);/);
  assert.match(
    source,
    /const details = errorDetails\(error, "Erro de envio"\);[\s\S]{0,250}URL\.revokeObjectURL\(input\.media\)/,
  );
  assert.match(
    source,
    /const details = errorDetails\(error, "Erro de envio"\);[\s\S]*status: "failed"/,
  );
});

test("outbound media contract preserves sticker payloads for Evolution", () => {
  const source = readFileSync(
    new URL("../src/routes/api/messages/send.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /type: z\.enum\(\["image", "video", "audio", "document", "sticker"\]\)/);
  assert.match(source, /\/message\/sendSticker\//);
  assert.match(source, /sticker: uploadedMediaUrl \|\| base64Only/);
});

test("private inbound media is signed before browser rendering", () => {
  const source = readFileSync(
    new URL("../src/routes/api/chats/$id/messages.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /createSignedUrl\(path, 60 \* 60\)/);
  assert.match(source, /signedMediaByMessage\.get\(String\(msg\.id\)\)/);
});

test("realtime media paths are reconciled to signed URLs", () => {
  const source = readFileSync(
    new URL("../src/features/inbox/hooks/useMessages.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /message\.mediaUrl\?\.startsWith\("\/api\/media\/"\)/);
  assert.match(source, /if \(mediaPath\) await fetchMessages\(\)/);
});

test("media and avatar fallbacks reset when realtime URLs are reconciled", () => {
  const source = readFileSync(
    new URL("../src/features/inbox/components/MessageBubble.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /setMediaFailed\(false\)/);
  assert.match(source, /\[message\.id, message\.mediaUrl\]/);
  assert.match(source, /setAvatarFailed\(false\)/);
  assert.match(source, /\[message\.id, message\.senderAvatar\]/);
});

test("pending media never renders as an empty message bubble and failed group avatars request repair", () => {
  const bubble = readFileSync(
    new URL("../src/features/inbox/components/MessageBubble.tsx", import.meta.url),
    "utf8",
  );
  const timeline = readFileSync(
    new URL("../src/features/inbox/components/MessageTimeline.tsx", import.meta.url),
    "utf8",
  );
  assert.match(bubble, /Mídia sendo carregada/);
  assert.match(bubble, /inboxos:avatar-error/);
  assert.match(bubble, /activeInstanceName/);
  assert.match(timeline, /activeInstanceName=\{activeInstanceName\}/);
});

test("chat list keeps contact avatars even when the agenda has no display name", () => {
  const source = readFileSync(new URL("../src/routes/api/chats/index.ts", import.meta.url), "utf8");
  assert.match(source, /if \(best \|\| c\.profile_pic_url\)/);
  assert.match(source, /name: best \|\| ""/);
});

test("GIF video payloads render as looping video instead of a broken image", () => {
  const source = readFileSync(
    new URL("../src/features/inbox/components/MessageBubble.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /message\.mimetype\?\.startsWith\("video\/"\)/);
  assert.match(source, /autoPlay[\s\S]{0,80}loop[\s\S]{0,80}muted/);
});

test("animated video stickers render as looping media and open in the video preview", () => {
  const source = readFileSync(
    new URL("../src/features/inbox/components/MessageBubble.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /const stickerIsVideo = message\.mimetype\?\.startsWith\("video\/"\)/);
  assert.match(source, /name: stickerIsVideo \? "figurinha\.mp4" : "figurinha\.webp"/);
});

test("audio player resets a stale load error after signed URL reconciliation", () => {
  const source = readFileSync(
    new URL("../src/features/media/components/AudioPlayer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /setHasError\(false\)/);
  assert.match(source, /audio\.load\(\)/);
  assert.match(source, /\[audioUrl\]/);
});

test("missing inbound media is repaired only on existing, instance-scoped rows", () => {
  const route = readFileSync(
    new URL("../src/routes/api/chats/sync-media.ts", import.meta.url),
    "utf8",
  );
  const hook = readFileSync(
    new URL("../src/features/inbox/hooks/useMessages.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /requireApiPermission\(request,\s*["']messages\.read["']\)/);
  assert.match(route, /\.is\("media_url", null\)/);
  assert.match(route, /\.eq\("instance_id", instance\.id\)/);
  assert.match(route, /getBase64FromMediaMessage/);
  assert.match(route, /\.update\(\{ media_url: stored\.url \}\)/);
  assert.match(hook, /\/api\/chats\/sync-media\?instanceName=/);
  assert.match(hook, /message\.type !== "deleted"/);
  assert.match(hook, /const hasMediaType = \["image", "video", "audio", "document", "sticker"\]/);
});

test("Evolution media downloads send the complete message key", () => {
  const webhook = readFileSync(
    new URL("../src/routes/api/public/webhooks/evolution.ts", import.meta.url),
    "utf8",
  );
  const worker = readFileSync(
    new URL("../src/server/evolution/sync-engine.ts", import.meta.url),
    "utf8",
  );
  for (const source of [webhook, worker]) {
    assert.match(source, /getBase64FromMediaMessage/);
    assert.match(source, /remoteJid: (?:key\.remoteJid|undefined)/);
    assert.match(source, /fromMe: Boolean\(key\.fromMe\)/);
  }
});

test("profile-picture backfill refreshes the visible conversation list when photos arrive", () => {
  const source = readFileSync(
    new URL("../src/features/inbox/hooks/useConversations.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /payload\?\.updated/);
  assert.match(source, /fetchConversations\(null, true\)/);
  assert.match(source, /\}, \[fetchConversations\]\);/);
});

test("live messages queue a bounded, instance-scoped sender avatar repair", () => {
  const source = readFileSync(
    new URL("../src/routes/api/public/webhooks/evolution.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /const liveAvatarJobs = new Map<string, Promise<void>>\(\)/);
  assert.match(source, /fetchContactProfilePicture\(/);
  assert.match(source, /AbortSignal\.timeout\(2500\)/);
  assert.match(source, /WHATSAPP_CONTACTS_ON_CONFLICT/);
  assert.match(source, /\.eq\("instance_id", instRow\.id\)/);
  assert.match(
    source,
    /Promise\.allSettled\(\[\.\.\.liveAvatarJobs\.values\(\)\]\.slice\(0, 3\)\)/,
  );
});

test("reactions have a scoped API path and an operator picker", () => {
  const route = readFileSync(
    new URL("../src/routes/api/messages/reaction.ts", import.meta.url),
    "utf8",
  );
  const bubble = readFileSync(
    new URL("../src/features/inbox/components/MessageBubble.tsx", import.meta.url),
    "utf8",
  );
  assert.match(route, /sendReaction/);
  assert.match(bubble, /Ver \$\{reactions\.length\} rea/);
  assert.match(route, /eq\("workspace_id", auth\.workspaceId\)/);
  assert.match(route, /eq\("instance_id", message\.instance_id\)/);
  assert.match(bubble, /Adicionar reação/);
});
