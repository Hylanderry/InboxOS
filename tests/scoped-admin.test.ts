import assert from "node:assert/strict";
import test from "node:test";
import { createScopedAdmin } from "../src/integrations/supabase/scoped-admin.ts";

const WS = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function fakeClient() {
  const calls: Array<{ op: string; args: unknown[]; eq: unknown[][] }> = [];
  const builder = (op: string) => (...args: unknown[]) => {
    const call = { op, args, eq: [] as unknown[][] };
    calls.push(call);
    const chain = { eq: (...e: unknown[]) => (call.eq.push(e), chain) };
    return chain;
  };
  const client = {
    from: () => ({
      select: builder("select"),
      insert: builder("insert"),
      upsert: builder("upsert"),
      update: builder("update"),
      delete: builder("delete"),
    }),
  };
  return { client, calls };
}

test("rejeita workspaceId ausente ou inválido", () => {
  const { client } = fakeClient();
  assert.throws(() => createScopedAdmin(client, ""));
  assert.throws(() => createScopedAdmin(client, "abc"));
  assert.throws(() => createScopedAdmin(client, undefined as unknown as string));
});

test("select, update e delete sempre filtram por workspace_id", () => {
  const { client, calls } = fakeClient();
  const db = createScopedAdmin(client, WS);
  db.from("chats").select("id");
  db.from("chats").update({ name: "x" });
  db.from("chats").delete();
  assert.equal(calls.length, 3);
  for (const call of calls) assert.deepEqual(call.eq, [["workspace_id", WS]]);
});

test("insert e upsert carimbam workspace_id em cada linha", () => {
  const { client, calls } = fakeClient();
  const db = createScopedAdmin(client, WS);
  db.from("chats").insert([{ phone: "1" }, { phone: "2" }]);
  db.from("chats").upsert({ phone: "3" }, { onConflict: "phone" });
  assert.deepEqual(calls[0].args[0], [
    { phone: "1", workspace_id: WS },
    { phone: "2", workspace_id: WS },
  ]);
  assert.deepEqual(calls[1].args[0], { phone: "3", workspace_id: WS });
});

test("linha de outro workspace é recusada", () => {
  const { client } = fakeClient();
  const db = createScopedAdmin(client, WS);
  assert.throws(() => db.from("chats").insert({ phone: "1", workspace_id: OTHER }));
  assert.throws(() => db.from("chats").update({ workspace_id: OTHER }));
});
