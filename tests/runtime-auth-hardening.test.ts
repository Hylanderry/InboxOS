import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("authenticated mutation throttling is not keyed by spoofable IP headers", () => {
  const source = readFileSync(new URL("../src/server/middleware/auth.ts", import.meta.url), "utf8");
  // O escopo continua sendo (segredo, ação do bucket, usuário): nunca IP/cabeçalhos do cliente.
  assert.match(source, /hashAuthValue\(\s*secret\s*,\s*bucket\.action\s*,\s*user\.id\s*\)/);
  const policy = readFileSync(
    new URL("../src/server/middleware/rate-limit-policy.ts", import.meta.url),
    "utf8",
  );
  assert.match(policy, /action:\s*"api-mutation"/);
  assert.doesNotMatch(source, /const clientIp=request\.headers\.get/);
});

test("session activity update awaits network response rather than dropping the query builder", () => {
  const source = readFileSync(new URL("../src/server/middleware/auth.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /const sessionActivity\s*=\s*await db\s*\.from\(\s*"user_sessions"\s*\)\s*\.update/,
  );
  assert.doesNotMatch(source, /void db\.from\("user_sessions"\)/);
  assert.match(source, /last_seen_at/);
  assert.match(source, /300_000/);
});

test("workflow invokes shared target policy instead of duplicating permissive URL logic", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/staging-smoke.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /scripts\/validate-staging-target\.mjs/);
  const cli = readFileSync(
    new URL("../scripts/validate-staging-target.mjs", import.meta.url),
    "utf8",
  );
  assert.match(cli, /validateSmokeTarget/);
});
