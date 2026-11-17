/** Offline regressions for group metadata and persistence acknowledgement.
 * These tests use synthetic fixtures; they do not call Supabase/Evolution.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  recordGroupMetadata,
  getGroupMetadata,
  getAllGroupMetadata,
} from "../src/server/evolution/group-metadata-cache.ts";
import { permissionsAfterOwnGroupParticipantUpdate } from "../src/server/evolution/group-participant-permissions.ts";

const ID = "120363000000@g.us";
test("same group JID cannot share metadata across different workspaces or instances", () => {
  recordGroupMetadata("ws-A", "inst-1", ID, {
    subject: "Grupo da empresa A",
    announce: true,
    isAdmin: false,
    canSend: false,
  });
  recordGroupMetadata("ws-B", "inst-1", ID, {
    subject: "Grupo da empresa B",
    announce: false,
    isAdmin: true,
    canSend: true,
  });
  recordGroupMetadata("ws-A", "inst-2", ID, {
    subject: "Segunda conexão",
    announce: false,
    canSend: true,
  });
  assert.equal(getGroupMetadata("ws-A", "inst-1", ID)?.subject, "Grupo da empresa A");
  assert.equal(getGroupMetadata("ws-A", "inst-1", ID)?.canSend, false);
  assert.equal(getGroupMetadata("ws-B", "inst-1", ID)?.subject, "Grupo da empresa B");
  assert.equal(getGroupMetadata("ws-A", "inst-2", ID)?.subject, "Segunda conexão");
  recordGroupMetadata("ws-B", "inst-1", ID, { subject: "Atualizado apenas para B" });
  assert.equal(getGroupMetadata("ws-A", "inst-1", ID)?.subject, "Grupo da empresa A");
  assert.equal(getGroupMetadata("ws-B", "inst-1", ID)?.subject, "Atualizado apenas para B");
  assert.equal(getGroupMetadata("ws-C", "inst-1", ID), null);
  assert.equal(getGroupMetadata("", "inst-1", ID), null);
  assert.equal(getGroupMetadata("ws-A", "", ID), null);
  assert.equal(recordGroupMetadata("ws-A", "", ID, { subject: "Never write" }), null);
  assert.deepEqual(Object.keys(getAllGroupMetadata("ws-A", "inst-1")), ["120363000000"]);
  assert.deepEqual(getAllGroupMetadata("ws-C", "inst-1"), {});
});

test("partial group metadata updates preserve earlier title and permissions within their scope", () => {
  recordGroupMetadata("ws-A", "inst-1", ID, { restrict: true, desc: "Descrição nova" });
  const a = getGroupMetadata("ws-A", "inst-1", ID);
  assert.equal(a?.subject, "Grupo da empresa A");
  assert.equal(a?.canSend, false);
  assert.equal(a?.desc, "Descrição nova");
  assert.equal(getGroupMetadata("ws-B", "inst-1", ID)?.desc, null);
  // Announcement restrictions change without a separate canSend payload.
  recordGroupMetadata("ws-A", "inst-2", ID, { announce: true, isAdmin: false });
  assert.equal(getGroupMetadata("ws-A", "inst-2", ID)?.canSend, false);
  recordGroupMetadata("ws-A", "inst-2", ID, { announce: false });
  assert.equal(getGroupMetadata("ws-A", "inst-2", ID)?.canSend, true);
});

test("group participant add and demote permit normal member to send unless announce-only", () => {
  assert.deepEqual(permissionsAfterOwnGroupParticipantUpdate("add", false), {
    isAdmin: false,
    canSend: true,
  });
  assert.deepEqual(permissionsAfterOwnGroupParticipantUpdate("add", true), {
    isAdmin: false,
    canSend: false,
  });
  assert.deepEqual(permissionsAfterOwnGroupParticipantUpdate("promote", true), {
    isAdmin: true,
    canSend: true,
  });
  assert.deepEqual(permissionsAfterOwnGroupParticipantUpdate("demote", false), {
    isAdmin: false,
    canSend: true,
  });
  assert.deepEqual(permissionsAfterOwnGroupParticipantUpdate("demote", true), {
    isAdmin: false,
    canSend: false,
  });
  assert.deepEqual(permissionsAfterOwnGroupParticipantUpdate("remove", false), {
    isAdmin: false,
    canSend: false,
  });
  assert.equal(permissionsAfterOwnGroupParticipantUpdate("unknown", false), null);
});

test("Evolution write errors are not silently acknowledged as success", () => {
  const route = readFileSync(
    new URL("../src/routes/api/public/webhooks/evolution.ts", import.meta.url),
    "utf8",
  );
  for (const error of [
    "instanceLookupError",
    "currentGroupError",
    "connectionError",
    "qrError",
    "groupUpdateError",
    "archiveError",
    "ownPermissionsError",
    "groupChatError",
    "groupChatLookupError",
  ]) {
    assert.match(
      route,
      new RegExp(`if \\(\\b${error}\\b\\) throw ${error};`),
      `Missing propagation of ${error}`,
    );
  }
  assert.match(route, /permissionsAfterOwnGroupParticipantUpdate\(/);
  assert.match(route, /recordGroupMetadata\(workspaceId, instanceName, groupId, permissions\)/);
  const worker = readFileSync(
    new URL("../src/server/evolution/event-inbox.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    worker,
    /\.eq\("status", "processing"\)\s*\.eq\("attempts", nextAttempts\)\s*\.select\("id"\)\s*\.maybeSingle\(\)/,
  );
  assert.match(
    worker,
    /if \(!completion\) throw new Error\("Evolution completion CAS lost ownership"\)/,
  );
  assert.match(worker, /if \(exhaustedError\) throw exhaustedError/);
  assert.match(worker, /if \(failureError\) \{/);
});
