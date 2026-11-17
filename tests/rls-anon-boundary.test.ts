import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261020100000_revoke_legacy_anon_inbox_grants.sql",
    import.meta.url,
  ),
  "utf8",
);

test("legacy anonymous Inbox grants are revoked without changing authenticated RLS", () => {
  for (const table of [
    "whatsapp_instances",
    "chats",
    "messages",
    "whatsapp_contacts",
    "whatsapp_presence",
    "contact_identity_aliases",
    "group_participants",
    "evolution_events",
    "outbound_messages",
    "inbox_events",
  ]) {
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon;`));
  }
  assert.match(migration, /revoke all on storage\.objects from anon;/);
  assert.doesNotMatch(migration, /grant .* on storage\.objects to anon/);
  assert.doesNotMatch(migration, /revoke all on public\.messages from authenticated/);
});
