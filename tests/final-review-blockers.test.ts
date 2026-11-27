import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const dir = "src/features/inbox";

test("carregamentos do workspace não usam cache sem escopo", () => {
  assert.doesNotMatch(read(`${dir}/workspace-product-api.ts`), /swrCache|cachedRead/);
});

test("painel do chat é remontado por conversa e a citação fica presa ao chat", () => {
  const shell = read(`${dir}/components/InboxShell.tsx`);
  assert.match(shell, /<div\n\s+key=\{activeChat\.id\}/);
  assert.match(shell, /replyState\.chatId === activeChat\?\.id/);
});

test("texto enviado não volta como rascunho", () => {
  const composer = read(`${dir}/components/MessageComposer.tsx`);
  assert.match(composer, /useState\(\(\) => draftCache\.get\(chatId\) \?\? ""\)/);
  assert.match(composer, /draftCache\.delete\(chatId\);\n\s+let delivered = false;/);
});

test("lembrete inoperante fica fora e o histórico exige messages.read", () => {
  const server = read("src/server/product/calendar-clients.server.ts");
  assert.doesNotMatch(server, /outbound_messages|sendReminder/);
  assert.doesNotMatch(read(`${dir}/components/ProductViews.tsx`), /sendReminder/);
  assert.match(server, /canReadMessages\n\s+\? client/);
});
