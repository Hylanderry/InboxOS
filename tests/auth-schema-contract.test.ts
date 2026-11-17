import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/20261012150000_auth_session_control_plane.sql", import.meta.url),
  "utf8",
);

test("auth/session control-plane migration contains every table used by server auth", () => {
  for (const table of ["workspace_invitations", "user_devices", "user_sessions"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`, "i"));
  }
  assert.match(
    sql,
    /foreach table_name in array array\['workspace_invitations','user_devices','user_sessions'\]/i,
  );
  assert.match(sql, /alter table public\.%I enable row level security/i);
  assert.match(sql, /grant all on table public\.%I to service_role/i);
});

test("auth/session control-plane migration prevents duplicate device/session identities", () => {
  assert.match(sql, /user_devices_user_token_unique/);
  assert.match(sql, /user_sessions_token_hash_unique/);
  assert.match(sql, /workspace_invitations_pending_unique/);
});

test("auth foundation migration contains the tables and atomic OTP RPCs used by registration", () => {
  const sql = readFileSync(
    new URL(
      "../supabase/migrations/20260925000000_auth_multitenant_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const table of [
    "profiles",
    "pending_registrations",
    "email_challenges",
    "password_history",
    "security_events",
    "system_events",
    "notification_deliveries",
    "auth_rate_limits",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`, "i"));
  }
  assert.match(sql, /lookup_auth_user_by_email/i);
  assert.match(sql, /consume_auth_rate_limit/i);
  assert.match(sql, /claim_email_challenge/i);
  assert.match(sql, /revoke all on table public\.%I from anon, authenticated/i);
});

test("verified provisioning is service-role-only and validates invitations", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20261018093000_auth_provisioning_runtime.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /create or replace function public\.provision_verified_account_v2/i);
  assert.match(sql, /expires_at > now\(\)/i);
  assert.match(sql, /accepted_at is null/i);
  assert.match(sql, /workspace_members/i);
  assert.match(sql, /legal_acceptances/i);
  assert.match(sql, /revoke all on function public\.provision_verified_account_v2/i);
});
