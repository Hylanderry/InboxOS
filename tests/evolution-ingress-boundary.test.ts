import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evolutionWebhookUrl,
  assertEvolutionWebhookConfigurationAllowed,
} from "../src/server/evolution/webhook-url.ts";
import {
  readEvolutionWebhookBody,
  EvolutionWebhookBodyTooLarge,
  MAX_EVOLUTION_WEBHOOK_BYTES,
} from "../src/server/evolution/webhook-body.ts";

const destination = "https://inboxos.example.org";
const preview = "https://inboxos-fase16-preview-8y8a3eq0l.vercel.app";
const makeRequest = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://inboxos.example.org/api/public/webhooks/evolution", {
    method: "POST",
    headers,
    body,
  });

test("Evolution webhook callback uses only trusted environment origin", () => {
  assert.equal(
    evolutionWebhookUrl({ CONTEXT: "production", PUBLIC_APP_URL: destination }),
    `${destination}/api/public/webhooks/evolution`,
  );
  assert.equal(
    evolutionWebhookUrl({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      PUBLIC_APP_URL: destination,
      VERCEL_URL: preview.slice("https://".length),
    }),
    `${preview}/api/public/webhooks/evolution`,
  );
  assert.throws(
    () =>
      evolutionWebhookUrl({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        PUBLIC_APP_URL: destination,
      }),
    /VERCEL_URL/,
  );
  assert.throws(
    () =>
      evolutionWebhookUrl({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        PUBLIC_APP_URL: destination,
        VERCEL_URL: destination.slice("https://".length),
      }),
    /preview da Vercel/,
  );
  const source = readFileSync(new URL("../src/lib/evolution.server.ts", import.meta.url), "utf8");
  assert.match(source, /return evolutionWebhookUrl\(process\.env\)/);
  assert.doesNotMatch(source, /const configured = process\.env\["PUBLIC_APP_URL"\]/);
});

test("Evolution body reader preserves exact payload and Unicode across stream chunks", async () => {
  const payload = '{"name":"🐑 teste","event":"MESSAGES_UPSERT"}';
  const bytes = new TextEncoder().encode(payload);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  const request = new Request(destination, {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
  assert.equal(await readEvolutionWebhookBody(request, bytes.byteLength), payload);
  assert.equal(await readEvolutionWebhookBody(makeRequest(""), 100), "");
});

test("Evolution reader rejects oversized declared and streamed bodies", async () => {
  await assert.rejects(
    () => readEvolutionWebhookBody(makeRequest("{}", { "content-length": "999" }), 10),
    EvolutionWebhookBodyTooLarge,
  );
  await assert.rejects(
    () => readEvolutionWebhookBody(makeRequest('{"more":"bytes"}'), 10),
    EvolutionWebhookBodyTooLarge,
  );
  assert.equal(MAX_EVOLUTION_WEBHOOK_BYTES, 4 * 1024 * 1024);
});

test("Evolution reader rejects corrupted UTF-8 or ambiguous Content-Length", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array([0xff]));
      c.close();
    },
  });
  const request = new Request(destination, {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(() => readEvolutionWebhookBody(request), TypeError);
  await assert.rejects(
    () => readEvolutionWebhookBody(makeRequest("{}", { "content-length": "NaN" })),
    TypeError,
  );
});

test("webhook route maps too-large requests to HTTP 413 before JSON parsing", () => {
  const source = readFileSync(
    new URL("../src/routes/api/public/webhooks/evolution.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /Allow: "POST"/);
  assert.match(source, /await readEvolutionWebhookBody\(request\)/);
  assert.match(source, /error instanceof EvolutionWebhookBodyTooLarge/);
  assert.match(source, /permitido" }, 413\)/);
});

test("Evolution preview must opt into remotely modifying sandbox webhooks", () => {
  assert.throws(
    () => assertEvolutionWebhookConfigurationAllowed({ VERCEL: "1", VERCEL_ENV: "preview" }),
    /instância sandbox/,
  );
  assert.throws(
    () =>
      assertEvolutionWebhookConfigurationAllowed({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE: "false",
      }),
    /EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE/,
  );
  assert.doesNotThrow(() =>
    assertEvolutionWebhookConfigurationAllowed({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE: "true",
    }),
  );
  assert.doesNotThrow(() => assertEvolutionWebhookConfigurationAllowed({}));
  assert.throws(
    () => assertEvolutionWebhookConfigurationAllowed({ VERCEL: "1", VERCEL_ENV: "preview" }),
    /sandbox/,
  );
  assert.doesNotThrow(() =>
    assertEvolutionWebhookConfigurationAllowed({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE: "true",
    }),
  );
  const source = readFileSync(new URL("../src/lib/evolution.server.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /configureEvolutionWebhook\(instanceName: string\) \{\s*assertEvolutionWebhookConfigurationAllowed\(process\.env\)/,
  );
});
