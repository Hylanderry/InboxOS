import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mutationRateBucket } from "../src/server/middleware/rate-limit-policy.ts";

test("A5: endpoints críticos usam bucket próprio e mais apertado", () => {
  const critical = [
    "/api/instances",
    "/api/instances/minha-instancia",
    "/api/admin/users",
    "/api/admin/integrations/rotate",
    "/api/billing",
    "/api/privacy/requests",
    "/api/workspaces/abc/members",
    "/api/workspaces/abc/invitations",
    "/api/company",
  ];
  for (const path of critical) {
    const bucket = mutationRateBucket(path);
    assert.equal(bucket.action, "api-mutation-critical", path);
    assert.ok(bucket.limit < 300);
  }
});

test("A5: ações comuns continuam no bucket padrão e não consomem a cota crítica", () => {
  for (const path of [
    "/api/messages/send",
    "/api/crm/leads",
    "/api/chats/1/flags",
    "/api/instancesx",
  ]) {
    assert.equal(mutationRateBucket(path).action, "api-mutation", path);
  }
  assert.notEqual(
    mutationRateBucket("/api/messages/send").action,
    mutationRateBucket("/api/instances").action,
  );
});

test("A5: middleware aplica o bucket e responde 429 com Retry-After e X-RateLimit", () => {
  const auth = readFileSync("src/server/middleware/auth.ts", "utf8");
  assert.match(auth, /mutationRateBucket\(new URL\(request\.url\)\.pathname\)/);
  assert.match(auth, /"Retry-After": String\(retryAfter\)/);
  assert.match(auth, /"X-RateLimit-Limit"/);
});
