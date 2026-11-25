import assert from "node:assert/strict";
import test from "node:test";
import { createPresenceStore, presenceKey } from "../src/features/inbox/hooks/presence-store.ts";

test("evento sem instância é ignorado", () => {
  const store = createPresenceStore();
  store.update("5511999990000", "composing");
  assert.deepEqual(store.getSnapshot(), {});
});

test("presença de um contato não altera o snapshot de outro", () => {
  const store = createPresenceStore();
  const a = presenceKey("5511999990001", "inst");
  const b = presenceKey("5511999990002", "inst");
  store.update("5511999990001", "composing", undefined, "inst");
  const stateA = store.getState(a);
  store.update("5511999990002", "recording", undefined, "inst");
  assert.equal(store.getState(a), stateA);
  assert.equal(store.getState(b), "recording");
  store.clear();
});

test("mesmo estado repetido não notifica ouvintes", () => {
  const store = createPresenceStore();
  let notifications = 0;
  store.subscribe(() => notifications++);
  store.update("5511999990001", "composing", undefined, "inst");
  store.update("5511999990001", "composing", undefined, "inst");
  store.update("5511999990001", "composing", undefined, "inst");
  assert.equal(notifications, 1);
  store.update("5511999990001", "unavailable", undefined, "inst");
  assert.equal(notifications, 2);
  store.clear();
});

test("evento antigo (>15s) remove a presença e clear esvazia tudo", () => {
  const store = createPresenceStore();
  store.update("5511999990001", "composing", undefined, "inst");
  const old = new Date(Date.now() - 20_000).toISOString();
  store.update("5511999990001", "composing", old, "inst");
  assert.deepEqual(store.getSnapshot(), {});
  store.update("5511999990003", "composing", undefined, "inst");
  store.clear();
  assert.deepEqual(store.getSnapshot(), {});
});

test("unsubscribe remove o ouvinte", () => {
  const store = createPresenceStore();
  const off = store.subscribe(() => {});
  assert.equal(store.listenerCount(), 1);
  off();
  assert.equal(store.listenerCount(), 0);
});
