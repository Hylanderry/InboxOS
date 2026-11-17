import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchCredentialed } from "../src/server/security/credentialed-fetch.ts";

test("credentialed requests always refuse redirects and omit browser credentials", async () => {
  let observed: RequestInit | undefined;
  const transport = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    observed = init;
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
  const response = await fetchCredentialed(
    "https://api.example.com/v1",
    {
      redirect: "follow",
      credentials: "include",
      referrerPolicy: "unsafe-url",
      headers: { apikey: "test-only-key" },
      signal: AbortSignal.timeout(1000),
    },
    transport,
  );
  assert.equal(response.status, 200);
  assert.equal(observed?.redirect, "error");
  assert.equal(observed?.credentials, "omit");
  assert.equal(observed?.referrerPolicy, "no-referrer");
  assert.equal((observed?.headers as Record<string, string>).apikey, "test-only-key");
  assert.ok(observed?.signal);
});

test("credentialed requests propagate blocked redirects and transport errors", async () => {
  const rejecting = (async () => {
    throw new TypeError("Redirect mode is set to error");
  }) as typeof fetch;
  await assert.rejects(
    () => fetchCredentialed("https://api.example.com", {}, rejecting),
    /Redirect mode/,
  );
});

test("provider calls carrying API keys use the redirect-protected transport", () => {
  const root = new URL("../", import.meta.url);
  for (const path of [
    "src/lib/evolution.server.ts",
    "src/server/email/resend.server.ts",
    "src/server/product/workspace-product.server.ts",
    "src/server/admin/newsletter.server.ts",
    "src/server/admin/admin-newsletter-audience.server.ts",
    "src/server/admin/integration-vault.server.ts",
    "src/server/evolution/background-dispatch.ts",
  ]) {
    const source = readFileSync(new URL(path, root), "utf8");
    assert.match(source, /fetchCredentialed\(/, `${path} must use protected HTTP transport`);
  }
});

test("transactional email calls use a bounded timeout", () => {
  const source = readFileSync(
    new URL("../src/server/email/resend.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /signal:\s*AbortSignal\.timeout\(15_000\)/);
});

test("internally signed Evolution dispatch is also redirect protected", () => {
  const source = readFileSync(
    new URL("../src/server/evolution/event-inbox.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /\(request\) => fetchCredentialed\(request\)/);
});

test("Vercel background invocation applies a default 5-second timeout", () => {
  const source = readFileSync(
    new URL("../src/server/evolution/background-dispatch.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /signal: signal \?\? AbortSignal\.timeout\(5_000\)/);
});

test("Resend retries only transient outcomes and keeps a bounded attempt count", async () => {
  const { shouldRetryResend } = await import("../src/server/email/resend-retry-policy.ts");
  assert.equal(shouldRetryResend(null, 1, 3), true);
  assert.equal(shouldRetryResend(429, 2, 3), true);
  assert.equal(shouldRetryResend(503, 1, 3), true);
  assert.equal(shouldRetryResend(400, 1, 3), false);
  assert.equal(shouldRetryResend(401, 1, 3), false);
  assert.equal(shouldRetryResend(301, 1, 3), false);
  assert.equal(shouldRetryResend(429, 3, 3), false);
  assert.equal(shouldRetryResend(null, 4, 3), false);
});

test("Resend network retry keeps the same idempotency key and does not log secrets", () => {
  const source = readFileSync(
    new URL("../src/server/email/resend.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /"Idempotency-Key": input\.idempotencyKey/);
  assert.match(source, /catch \{[\s\S]*?shouldRetryResend\(null, attempt, MAX_ATTEMPTS\)/);
});

test("Resend never uses the sandbox onboarding sender when a server sender is configured", () => {
  const source = readFileSync(
    new URL("../src/server/email/resend.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /onboarding@resend\.dev/);
  assert.match(source, /RESEND_FROM_EMAIL/);
  assert.match(source, /PLATFORM_BRAND_NAME/);
  assert.match(source, /senderFor\(selected, senderName\)/);
});
