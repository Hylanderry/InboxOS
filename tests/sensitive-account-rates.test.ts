import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  enforceSensitiveChallengeRateLimit,
  sensitiveChallengeRateDecision,
} from "../src/server/auth/sensitive-challenge-rate.ts";

const SECRET = "test-only-32-byte-minimum-key-0123456789abcdef";

test("sensitive OTP issue denies throttled/missing/unavailable rate limiter", () => {
  assert.deepEqual(sensitiveChallengeRateDecision(null, null), {
    allowed: false,
    status: 503,
    retryAfterSeconds: 60,
  });
  assert.deepEqual(sensitiveChallengeRateDecision([], new Error("db failed")), {
    allowed: false,
    status: 503,
    retryAfterSeconds: 60,
  });
  assert.deepEqual(
    sensitiveChallengeRateDecision([{ allowed: false, retry_after_seconds: 32 }], null),
    {
      allowed: false,
      status: 429,
      retryAfterSeconds: 32,
    },
  );
  assert.deepEqual(sensitiveChallengeRateDecision([{ allowed: true }], null), { allowed: true });
});

test("OTP rate limiter hashes user identity and sets five requests per hour", async () => {
  let params: Record<string, unknown> | null = null;
  const client = {
    rpc: async (operation: string, args: Record<string, unknown>) => {
      assert.equal(operation, "consume_auth_rate_limit");
      params = args;
      return { data: [{ allowed: true, retry_after_seconds: 0 }], error: null };
    },
  };
  const result = await enforceSensitiveChallengeRateLimit(
    client as never,
    SECRET,
    "user-1",
    "email-change-old-start",
  );
  assert.deepEqual(result, { allowed: true });
  assert.equal(params?.["p_action"], "email-change-old-start");
  assert.equal(params?.["p_limit"], 5);
  assert.equal(params?.["p_window_seconds"], 3600);
  assert.equal(params?.["p_block_seconds"], 3600);
  assert.match(String(params?.["p_scope_hash"]), /^[a-f\d]{64}$/);
  assert.doesNotMatch(String(params?.["p_scope_hash"]), /user-1/);
});

test("new-email and phone OTP sends also pass their action-specific limiter before delivery", () => {
  const email = readFileSync(
    new URL("../src/server/auth/email-change.server.ts", import.meta.url),
    "utf8",
  );
  const phone = readFileSync(
    new URL("../src/server/auth/phone-change.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    email,
    /enforceSensitiveChallengeRateLimit\(\s*authDb\s*,\s*secret\(\)\s*,\s*auth\.user\.id\s*,\s*"email-change-old-start"\s*,?\s*\)/,
  );
  assert.match(
    email,
    /enforceSensitiveChallengeRateLimit\(\s*authDb\s*,\s*secret\(\)\s*,\s*auth\.user\.id\s*,\s*"email-change-new-start"\s*,?\s*\)/,
  );
  assert.match(
    phone,
    /enforceSensitiveChallengeRateLimit\(\s*d\s*,\s*secret\(\)\s*,\s*auth\.user\.id\s*,\s*"phone-change-start"\s*,?\s*\)/,
  );
});

test("recovery, phone and new-email changes are one-use and require DB compare-and-set", () => {
  const recovery = readFileSync(
    new URL("../src/server/auth/password-recovery.server.ts", import.meta.url),
    "utf8",
  );
  const email = readFileSync(
    new URL("../src/server/auth/email-change.server.ts", import.meta.url),
    "utf8",
  );
  const phone = readFileSync(
    new URL("../src/server/auth/phone-change.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    recovery,
    /eq\(\s*"grant_token_hash"\s*,\s*c\.grant_token_hash\s*\)\s*\.is\(\s*"consumed_at"\s*,\s*null\s*\)\s*\.select\(\s*"id"\s*\)\s*\.maybeSingle\(\s*\)/,
  );
  assert.ok(recovery.indexOf("if (!consumed)") < recovery.indexOf("updateUserById(c.user_id"));
  assert.match(email, /if\s*\(!consumedOld\)[\s\S]{0,120}409/);
  assert.match(email, /if\s*\(!consumedNew\)[\s\S]{0,120}409/);
  assert.ok(email.indexOf("if (!consumedNew)") < email.indexOf("updateUserById(auth.user.id"));
  assert.match(phone, /if\s*\(!consumed\)[\s\S]{0,120}409/);
  assert.ok(phone.indexOf("if (!consumed)") < phone.indexOf('from("profiles")'));
});

test("verification limiter allows at most ten attempts per challenge per ten minutes", async () => {
  const { enforceSensitiveChallengeVerifyLimit } =
    await import("../src/server/auth/sensitive-challenge-rate.ts");
  const calls: Array<Record<string, unknown>> = [];
  const mock = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      calls.push(args);
      return { data: [{ allowed: calls.length < 2, retry_after_seconds: 420 }], error: null };
    },
  };
  assert.deepEqual(
    await enforceSensitiveChallengeVerifyLimit(
      mock as never,
      SECRET,
      "challenge-one",
      "password-reset-verify",
    ),
    { allowed: true },
  );
  assert.deepEqual(
    await enforceSensitiveChallengeVerifyLimit(
      mock as never,
      SECRET,
      "challenge-one",
      "password-reset-verify",
    ),
    { allowed: false, status: 429, retryAfterSeconds: 420 },
  );
  assert.equal(calls[0]?.["p_limit"], 10);
  assert.equal(calls[0]?.["p_window_seconds"], 600);
  assert.equal(calls[0]?.["p_block_seconds"], 600);
  assert.equal(calls[0]?.["p_action"], "password-reset-verify");
});

test("password reset, email and phone verify routes all enforce challenge-specific throttling", () => {
  const recovery = readFileSync(
    new URL("../src/server/auth/password-recovery.server.ts", import.meta.url),
    "utf8",
  );
  const email = readFileSync(
    new URL("../src/server/auth/email-change.server.ts", import.meta.url),
    "utf8",
  );
  const phone = readFileSync(
    new URL("../src/server/auth/phone-change.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    recovery,
    /enforceSensitiveChallengeVerifyLimit\(\s*db\s*,\s*s\s*,\s*p\.id\s*,\s*"password-reset-verify"\s*,?\s*\)/,
  );
  assert.match(
    email,
    /enforceSensitiveChallengeVerifyLimit\(\s*authDb\s*,\s*secret\(\)\s*,\s*id\s*,\s*"email-change-old-verify"\s*,?\s*\)/,
  );
  assert.match(
    email,
    /enforceSensitiveChallengeVerifyLimit\(\s*authDb\s*,\s*secret\(\)\s*,\s*id\s*,\s*"email-change-new-verify"\s*,?\s*\)/,
  );
  assert.match(
    phone,
    /enforceSensitiveChallengeVerifyLimit\(\s*d\s*,\s*secret\(\)\s*,\s*id\s*,\s*"phone-change-verify"\s*,?\s*\)/,
  );
});
