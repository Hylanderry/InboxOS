import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../supabase/migrations/20261001134743_atomic_workspace_owner_transfer.sql",
    import.meta.url,
  ),
  "utf8",
);

test("owner transfer has a transaction lock and preserves owner-before-demote ordering", () => {
  assert.match(sql, /pg_advisory_xact_lock\s*\(/);
  assert.ok(sql.indexOf("set role = 'owner'") < sql.indexOf("set role = 'admin'"));
  assert.match(sql, /and w.status = 'active'/);
  assert.match(sql, /and m.status = 'active'/);
  assert.match(sql, /p_from_user_id = p_to_user_id/);
});

test("owner-transfer reconciliation restricts execution to service_role", () => {
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/);
  assert.match(
    sql,
    /revoke all on function public\.transfer_workspace_ownership\(uuid,uuid,uuid\) from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.transfer_workspace_ownership\(uuid,uuid,uuid\) to service_role/i,
  );
});
