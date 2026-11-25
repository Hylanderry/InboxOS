import assert from "node:assert/strict";
import test from "node:test";
import { TenantCache } from "../src/server/evolution/tenant-cache.ts";

test("workspaces diferentes nunca compartilham entradas", () => {
  const c = new TenantCache<string>();
  c.set("ws-a:inst:5511999", "Ana");
  c.set("ws-b:inst:5511999", "Bruno");
  assert.equal(c.get("ws-a:inst:5511999"), "Ana");
  assert.equal(c.get("ws-b:inst:5511999"), "Bruno");
  assert.equal(c.get("ws-c:inst:5511999"), undefined);
});

test("clearWorkspace limpa só a partição indicada", () => {
  const c = new TenantCache<string>();
  c.set("ws-a:i:1", "x");
  c.set("ws-b:i:1", "y");
  c.clearWorkspace("ws-a");
  assert.equal(c.get("ws-a:i:1"), undefined);
  assert.equal(c.get("ws-b:i:1"), "y");
});

test("limite por workspace descarta a entrada mais antiga sem afetar outros", () => {
  const c = new TenantCache<number>(2);
  c.set("ws-a:i:1", 1);
  c.set("ws-a:i:2", 2);
  c.set("ws-b:i:1", 9);
  c.set("ws-a:i:3", 3);
  assert.equal(c.get("ws-a:i:1"), undefined);
  assert.equal(c.get("ws-a:i:3"), 3);
  assert.equal(c.get("ws-b:i:1"), 9);
  assert.equal(c.sizeOf("ws-a"), 2);
});

test("chave sem workspace não é armazenada e stats contam hit/miss", () => {
  const c = new TenantCache<string>();
  c.set(":i:1", "x");
  c.set("ws-a:i:1", "ok");
  c.get("ws-a:i:1");
  c.get("ws-a:i:2");
  const s = c.stats("ws-a");
  assert.equal(c.get(":i:1"), undefined);
  assert.equal(s.hits, 1);
  assert.equal(s.misses, 1);
  assert.equal(s.size, 1);
});
