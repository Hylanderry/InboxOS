import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("scripts/staging-browser-smoke.mjs", "utf8");

test("staging browser smoke remains public and read-only", () => {
  assert.match(source, /validateSmokeTarget/);
  assert.match(source, /\/auth\/login/);
  assert.match(source, /\/auth\/register/);
  assert.match(source, /\/legal\/terms/);
  assert.doesNotMatch(source, /api\/messages\/send|api\/public\/webhooks|api\/sync\/evolution/);
  assert.doesNotMatch(source, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
});
