import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evolutionQueueConsumerSignature,
  verifyEvolutionQueueConsumerRequest,
} from "../src/server/evolution/background-dispatch.ts";
import { interpretWebhookRateResult } from "../src/server/evolution/webhook-rate-limit.ts";

const EVENT_ID = "4f2086d7-e990-471e-83d0-0c71330a20c5";
const BODY = JSON.stringify({
  event: "MESSAGES_UPSERT",
  instance: "test-tenant",
  data: { key: { id: "msg-1" } },
});
const SECRET = "test-secret-must-have-at-least-32-characters-abcdef";

function signedRequest(
  body: string,
  sentAt: string,
  eventId = EVENT_ID,
  signature?: string,
): Request {
  return new Request("https://example.test/api/public/webhooks/evolution", {
    method: "POST",
    headers: {
      "x-inbox-queue-consumer": "1",
      "x-inbox-event-id": eventId,
      "x-inbox-sent-at": sentAt,
      "x-inbox-internal-signature":
        signature ?? evolutionQueueConsumerSignature(eventId, sentAt, BODY),
    },
    body,
  });
}

test("internal Evolution queue consumer requires a fresh HMAC binding event ID and exact payload", () => {
  const prior = process.env["AUTH_CRYPTO_SECRET"];
  process.env["AUTH_CRYPTO_SECRET"] = SECRET;
  try {
    const now = 1_780_000_000_000;
    const sentAt = String(now);
    assert.equal(verifyEvolutionQueueConsumerRequest(signedRequest(BODY, sentAt), BODY, now), true);
    assert.equal(
      verifyEvolutionQueueConsumerRequest(signedRequest(BODY + " ", sentAt), BODY + " ", now),
      false,
    );
    assert.equal(
      verifyEvolutionQueueConsumerRequest(
        signedRequest(BODY, sentAt, "e0bc29f9-92bc-47df-8c4f-d4d8eb1467cd"),
        BODY,
        now,
      ),
      true,
    );
    assert.equal(
      verifyEvolutionQueueConsumerRequest(signedRequest(BODY, sentAt), BODY, now + 300_001),
      false,
    );
    assert.equal(
      verifyEvolutionQueueConsumerRequest(signedRequest(BODY, sentAt), BODY, now - 300_001),
      false,
    );
    const request = signedRequest(BODY, sentAt);
    request.headers.delete("x-inbox-internal-signature");
    assert.equal(verifyEvolutionQueueConsumerRequest(request, BODY, now), false);
    const invalidEvent = signedRequest(BODY, sentAt);
    invalidEvent.headers.set("x-inbox-event-id", "../other");
    assert.equal(verifyEvolutionQueueConsumerRequest(invalidEvent, BODY, now), false);
  } finally {
    if (prior === undefined) delete process.env["AUTH_CRYPTO_SECRET"];
    else process.env["AUTH_CRYPTO_SECRET"] = prior;
  }
});

test("group bootstrap gives the slow Evolution catalog enough time and defers picture backfill", () => {
  const syncEngine = readFileSync("src/server/evolution/sync-engine.ts", "utf8");
  const webhook = readFileSync("src/routes/api/public/webhooks/evolution.ts", "utf8");
  assert.match(syncEngine, /fetchAllGroups\/.*timeoutMs: 45_000/s);
  assert.match(webhook, /event === "SYNC_GROUPS"[\s\S]*fetchMissingPictures: false/);
});

test("internal signature is not accepted without the application secret", () => {
  const prior = process.env["AUTH_CRYPTO_SECRET"];
  delete process.env["AUTH_CRYPTO_SECRET"];
  try {
    const req = new Request("https://example.test/webhook", {
      method: "POST",
      headers: {
        "x-inbox-queue-consumer": "1",
        "x-inbox-event-id": EVENT_ID,
        "x-inbox-sent-at": "1780000000000",
        "x-inbox-internal-signature": "a".repeat(64),
      },
      body: BODY,
    });
    assert.equal(verifyEvolutionQueueConsumerRequest(req, BODY, 1_780_000_000_000), false);
  } finally {
    if (prior !== undefined) process.env["AUTH_CRYPTO_SECRET"] = prior;
  }
});

test("webhook rate limiter fails closed if RPC fails or no valid decision is returned", () => {
  assert.deepEqual(interpretWebhookRateResult(null, { code: "network-unavailable" }), {
    allowed: false,
    unavailable: true,
    retryAfterSeconds: 30,
  });
  assert.deepEqual(interpretWebhookRateResult([]), {
    allowed: false,
    unavailable: true,
    retryAfterSeconds: 30,
  });
  assert.deepEqual(interpretWebhookRateResult([{ allowed: "true" }]), {
    allowed: false,
    unavailable: true,
    retryAfterSeconds: 30,
  });
  assert.deepEqual(interpretWebhookRateResult([{ allowed: false, retry_after_seconds: 12 }]), {
    allowed: false,
    unavailable: false,
    retryAfterSeconds: 12,
  });
  assert.deepEqual(interpretWebhookRateResult([{ allowed: true, retry_after_seconds: 0 }]), {
    allowed: true,
    unavailable: false,
    retryAfterSeconds: 0,
  });
});

test("Evolution route verifies signed queue consumer and responds HTTP 503 on throttling outage", () => {
  const route = readFileSync(
    new URL("../src/routes/api/public/webhooks/evolution.ts", import.meta.url),
    "utf8",
  );
  const worker = readFileSync(
    new URL("../src/server/evolution/event-inbox.ts", import.meta.url),
    "utf8",
  );
  const limiter = readFileSync(
    new URL("../src/server/evolution/webhook-rate-limit.ts", import.meta.url),
    "utf8",
  );
  const evolution = readFileSync(
    new URL("../src/lib/evolution.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    route,
    /isQueueConsumer && !verifyEvolutionQueueConsumerRequest\(request, rawBody\)/,
  );
  assert.match(route, /status: limit\.unavailable \? 503 : 429/);
  assert.ok(
    route.indexOf("verifyEvolutionQueueConsumerRequest(request, rawBody)") <
      route.indexOf("if (!isQueueConsumer)"),
  );
  assert.match(
    worker,
    /["']x-inbox-internal-signature["']\s*:\s*evolutionQueueConsumerSignature\(\s*event\.id\s*,\s*sentAt\s*,\s*requestBody\s*,?\s*\)/,
  );
  assert.doesNotMatch(limiter, /x-forwarded-for|cf-connecting-ip|x-nf-client-connection-ip/);
  assert.doesNotMatch(evolution, /new URL\(request\.url\)\.searchParams\.get\("token"\)/);
});

test("duplicate Evolution queue delivery can only be claimed by one worker and failures are recorded", () => {
  const worker = readFileSync(
    new URL("../src/server/evolution/event-inbox.ts", import.meta.url),
    "utf8",
  );
  assert.match(worker, /event\.status\s*===\s*["']processing["']\s*\)\s*return/);
  assert.match(worker, /\.eq\("status", event\.status\)\s*\.eq\("attempts", event\.attempts\)/);
  assert.match(worker, /claim\.select\("id"\)\.maybeSingle\(\)/);
  assert.match(worker, /claim\.eq\("next_attempt_at", event\.next_attempt_at\)/);
  assert.match(worker, /claim\.is\("next_attempt_at", null\)/);
  assert.match(worker, /decideEvolutionRecovery\(/);
  assert.match(worker, /if \(!claimed\) return;/);
  assert.match(worker, /catch \(processingError\)/);
  assert.match(worker, /\.eq\("status", "processing"\)\s*\.eq\("attempts", nextAttempts\)/);
  assert.match(worker, /status: exhausted \? "dead_letter" : "failed"/);
});
