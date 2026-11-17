import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recoveryCodeIsVerified } from "../src/server/auth/password-recovery-policy.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("recovery verifier never treats verified_at alone as possession of the OTP", () => {
  const stored = "a".repeat(64);
  const wrong = "b".repeat(64);
  assert.equal(recoveryCodeIsVerified(false, null, wrong, stored), false);
  assert.equal(recoveryCodeIsVerified(false, "2026-10-02T00:00:00Z", wrong, stored), false);
  assert.equal(recoveryCodeIsVerified(false, "2026-10-02T00:00:00Z", stored, stored), true);
  assert.equal(recoveryCodeIsVerified(true, null, stored, stored), true);
});

test("password recovery start cannot send an email when throttle declines", () => {
  const source = read("../src/server/auth/password-recovery.server.ts");
  assert.match(source, /p_action\s*:\s*"password-reset-start"/);
  assert.match(
    source,
    /if\s*\(\s*limitError\s*\|\|\s*limit\?\.\[0\]\?\.allowed\s*!==\s*true\s*\)[\s\S]{0,120}genericPasswordRecoveryResponse\(started,\s*null\)/,
  );
  assert.match(
    source,
    /recoveryCodeIsVerified\(\s*ok\s*===\s*true\s*,\s*c\.verified_at\s*,\s*h\s*,\s*c\.code_hash\s*\)/,
  );
});

test("authenticated writes fail closed when mutation throttle RPC is unavailable", () => {
  const source = read("../src/server/middleware/auth.ts");
  assert.match(
    source,
    /if\s*\(\s*limitError\s*\|\|\s*\(limited\?\.\[0\]\?\.allowed\s*!==\s*true\s*&&\s*limited\?\.\[0\]\?\.allowed\s*!==\s*false\s*\)\s*\)/,
  );
  assert.match(source, /Limitador indisponível; tente novamente/);
});
