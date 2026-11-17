import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { trustedAppOrigin } from "../src/server/security/trusted-app-origin.ts";

const production = { CONTEXT: "production", PUBLIC_APP_URL: "https://inboxos.example.org/" };
const preview = {
  CONTEXT: "deploy-preview",
  PUBLIC_APP_URL: "https://inboxos.example.org/",
  DEPLOY_PRIME_URL: "https://unrecognized-preview.example/",
};

test("unrecognized preview variables do not override the configured public origin", () => {
  assert.equal(trustedAppOrigin(production), "https://inboxos.example.org");
  assert.equal(
    trustedAppOrigin({ PUBLIC_APP_URL: "https://inboxos.example.org" }),
    "https://inboxos.example.org",
  );
  assert.equal(trustedAppOrigin(preview), "https://inboxos.example.org");
});

test("Vercel preview uses its deployment origin and never production", () => {
  const vercelPreview = {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_URL: "inboxos-git-fase16.vercel.app",
    PUBLIC_APP_URL: "https://inboxos.example.org/",
  };
  assert.equal(trustedAppOrigin(vercelPreview), "https://inboxos-git-fase16.vercel.app");
  assert.equal(
    trustedAppOrigin({ ...vercelPreview, VERCEL_BRANCH_URL: "inboxos-branch-fase16.vercel.app" }),
    "https://inboxos-branch-fase16.vercel.app",
  );
  assert.throws(() => trustedAppOrigin({ ...vercelPreview, VERCEL_URL: undefined }), /VERCEL_URL/);
  assert.throws(
    () => trustedAppOrigin({ ...vercelPreview, VERCEL_URL: "https://inboxos.example.org/" }),
    /preview da Vercel/,
  );
});

test("origin rejects unsafe or ambiguous destinations", () => {
  for (const value of [
    "http://example.org",
    "https://127.0.0.1",
    "https://localhost",
    "https://[::1]",
    "https://10.0.0.2",
    "https://example.org:8080",
    "https://user:pass@example.org",
    "https://example.org/redirect",
    "https://example.org/?token=foo",
    "https://example.org/#fragment",
    "https://example.org.evil.local",
    "https://example.org@127.0.0.1",
    "not-a-url",
    "",
  ]) {
    assert.throws(
      () => trustedAppOrigin({ CONTEXT: "production", PUBLIC_APP_URL: value }),
      /pública|PUBLIC_APP_URL|HTTPS/,
      value,
    );
  }
});

test("webhook, worker, background and invites never build sensitive links from Request.url", () => {
  const files = [
    "../src/routes/api/public/webhooks/evolution.ts",
    "../src/server/evolution/event-inbox.ts",
    "../src/server/workspace/workspaces.server.ts",
    "../src/server/admin/admin-invitations.server.ts",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /trustedAppOrigin\(/, file);
    assert.doesNotMatch(source, /new URL\(request\.url\)\.origin/, file);
  }
  const invites = readFileSync(
    new URL("../src/server/workspace/workspaces.server.ts", import.meta.url),
    "utf8",
  );
  const inviteOrigin = invites.indexOf("trustedAppOrigin(process.env)");
  assert.ok(
    inviteOrigin >= 0 &&
      invites.indexOf('.from("workspace_invitations")', inviteOrigin) > inviteOrigin,
    "origin must be validated before a signed invite is persisted",
  );
  const adminInvites = readFileSync(
    new URL("../src/server/admin/admin-invitations.server.ts", import.meta.url),
    "utf8",
  );
  const adminInviteOrigin = adminInvites.indexOf("trustedAppOrigin(process.env)");
  assert.ok(
    adminInviteOrigin >= 0 &&
      adminInvites.indexOf('.from("workspace_invitations")', adminInviteOrigin) > adminInviteOrigin,
    "system-admin invitation origin must be validated before persisting",
  );
});

test("failed event retry due-time is checked and atomically compared before claim", () => {
  const inbox = readFileSync(
    new URL("../src/server/evolution/event-inbox.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    inbox,
    /if\s*\(\s*event\.status\s*===\s*["']failed["']\s*&&\s*decideEvolutionRecovery\(/,
  );
  assert.match(inbox, /next_attempt_at,received_at|received_at,processing_at,next_attempt_at/);
  assert.match(inbox, /claim\.eq\("next_attempt_at", event\.next_attempt_at\)/);
  assert.match(inbox, /claim\.is\("next_attempt_at", null\)/);
});
