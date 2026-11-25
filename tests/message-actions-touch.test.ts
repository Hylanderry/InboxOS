import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/features/inbox/components/MessageBubble.tsx", "utf8");

test("B1: ações da mensagem só se escondem quando há hover real", () => {
  assert.ok(!/sm:opacity-0/.test(source), "não esconder por breakpoint de largura");
  assert.ok(!/ opacity-0 group-hover\/(row|sticker-row):opacity-100/.test(source));
  assert.match(source, /\[@media\(hover:hover\)\]:opacity-0/);
  assert.match(source, /group-focus-within\/row/);
});

test("B1: alvo de toque ampliado e long-press abre reações", () => {
  assert.match(source, /\[@media\(pointer:coarse\)\]:before:-inset-3/);
  assert.match(source, /function useLongPress/);
  assert.match(source, /\{\.\.\.longPress\}/);
});

test("B1: menu de reação fecha com Escape e clique fora", () => {
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /addEventListener\("pointerdown"/);
});
