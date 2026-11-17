import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hashAuthValue } from "../src/server/auth/auth-crypto.ts";
import { recoveryCodeIsVerified } from "../src/server/auth/password-recovery-policy.ts";

const secret = "test-only-local-entropy-0123456789abcdef";
const userId = "user-test-123";
const confirmedAt = "2026-10-01T12:00:00.000Z";

function hash(purpose: string, code: string) {
  return hashAuthValue(secret, `${purpose}-code`, `${userId}\0${code}`);
}

test("a previously confirmed phone-change challenge rejects a different code", () => {
  const correctHash = hash("phone_change", "123456");
  assert.equal(
    recoveryCodeIsVerified(false, confirmedAt, hash("phone_change", "654321"), correctHash),
    false,
  );
  assert.equal(recoveryCodeIsVerified(false, confirmedAt, correctHash, correctHash), true);
});

test("both stages of email change reject a different code even after prior verification", () => {
  for (const purpose of ["email_change_old", "email_change_new"]) {
    const correctHash = hash(purpose, "135791");
    assert.equal(
      recoveryCodeIsVerified(false, confirmedAt, hash(purpose, "999999"), correctHash),
      false,
      purpose,
    );
    assert.equal(
      recoveryCodeIsVerified(false, confirmedAt, correctHash, correctHash),
      true,
      purpose,
    );
    assert.equal(recoveryCodeIsVerified(false, null, correctHash, correctHash), false, purpose);
  }
});

test("email and phone handlers never accept verified_at alone as code proof", () => {
  for (const [file, count] of [
    ["email-change.server.ts", 2],
    ["phone-change.server.ts", 1],
  ] as const) {
    const source = readFileSync(new URL(`../src/server/auth/${file}`, import.meta.url), "utf8");
    assert.equal(
      (
        source.match(
          /recoveryCodeIsVerified\(\s*ok\s*===\s*true\s*,\s*c\.verified_at\s*,\s*h\s*,\s*c\.code_hash\s*\)/g,
        ) ?? []
      ).length,
      count,
    );
    assert.doesNotMatch(source, /if\(!ok&&!c\.verified_at\)/);
    assert.equal(
      (
        source.match(
          /c\.blocked_until\s*&&\s*new Date\(c\.blocked_until\)\.getTime\(\)\s*>\s*Date\.now\(\)/g,
        ) ?? []
      ).length,
      count,
    );
  }
});

test("account change handlers check critical persistence errors before reporting success", () => {
  const email = readFileSync(
    new URL("../src/server/auth/email-change.server.ts", import.meta.url),
    "utf8",
  );
  const phone = readFileSync(
    new URL("../src/server/auth/phone-change.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(email, /if\s*\(grantError\)\s*throw grantError/);
  assert.match(phone, /if\s*\(consumeError\)\s*throw consumeError/);
});
