import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eligibleBootstrapIdentity } from "../src/server/admin/bootstrap-policy.ts";

const confirmed = {
  id: "u-01",
  email: " Admin@Example.com ",
  email_confirmed_at: "2026-09-30T10:00:00.000Z",
};

test("first System Admin requires confirmed allowlisted email and matching authenticated ID", () => {
  assert.equal(
    eligibleBootstrapIdentity("u-01", confirmed, "other@example.com,admin@example.com"),
    true,
  );
  assert.equal(eligibleBootstrapIdentity("u-02", confirmed, "admin@example.com"), false);
  assert.equal(
    eligibleBootstrapIdentity(
      "u-01",
      { ...confirmed, email_confirmed_at: null },
      "admin@example.com",
    ),
    false,
  );
  assert.equal(
    eligibleBootstrapIdentity(
      "u-01",
      { ...confirmed, email_confirmed_at: "invalid" },
      "admin@example.com",
    ),
    false,
  );
  assert.equal(
    eligibleBootstrapIdentity(
      "u-01",
      { ...confirmed, email_confirmed_at: "2099-01-01T00:00:00Z" },
      "admin@example.com",
    ),
    false,
  );
  assert.equal(
    eligibleBootstrapIdentity(
      "u-01",
      { ...confirmed, email: "evil@example.com" },
      "admin@example.com",
    ),
    false,
  );
  assert.equal(eligibleBootstrapIdentity("u-01", confirmed, "@example.com"), false);
  assert.equal(eligibleBootstrapIdentity("u-01", null, "admin@example.com"), false);
  assert.equal(eligibleBootstrapIdentity("u-01", confirmed, ""), false);
});

test("server authorizes the verified Auth identity before attempting atomic bootstrap", () => {
  const code = readFileSync(
    resolve(import.meta.dirname, "../src/server/admin/admin-auth.server.ts"),
    "utf8",
  );
  const verifyIndex = code.indexOf("eligibleBootstrapIdentity(");
  const rpcIndex = code.indexOf('.rpc("claim_system_admin_bootstrap"');
  assert.ok(verifyIndex >= 0 && rpcIndex > verifyIndex);
  assert.match(code, /db\.auth\.admin\.getUserById\(\s*auth\.user\.id\s*,?\s*\)/);
});

test("database migration adds serialized protection for last privileged accounts", () => {
  const migration = readFileSync(
    resolve(
      import.meta.dirname,
      "../supabase/migrations/20261001230000_protect_last_privileged_members.sql",
    ),
    "utf8",
  );
  assert.equal((migration.match(/pg_advisory_xact_lock\(/g) || []).length, 3);
  for (const table of ["workspace_members", "system_admins", "system_user_controls"]) {
    assert.ok(migration.includes(`on public.${table}`), table);
  }
  assert.match(migration, /m\.user_id <> old\.user_id/);
  assert.match(migration, /s\.user_id <> new\.user_id/);
  assert.match(migration, /errcode = '23514'/);
  assert.match(migration, /function private\.guard_last_active_workspace_owner/);
});

test("database concurrency guard violations return HTTP 409, not retryable server errors", () => {
  const handler = readFileSync(
    resolve(import.meta.dirname, "../src/server/admin/admin-operations.server.ts"),
    "utf8",
  );
  assert.equal((handler.match(/error\.code\s*===\s*"23514"/g) || []).length, 6);
  assert.equal(
    (handler.match(/error\.code\s*===\s*"23514"\s*\?\s*409\s*:\s*500/g) || []).length,
    3,
  );
});

test("all newly activated System Admins must have verified Auth emails", () => {
  const handler = readFileSync(
    resolve(import.meta.dirname, "../src/server/admin/admin-operations.server.ts"),
    "utf8",
  );
  assert.match(handler, /status\s*===\s*"active"\s*&&\s*!exists\.data\.user\.email_confirmed_at/);
});
