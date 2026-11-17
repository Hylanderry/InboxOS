import test from "node:test";
import assert from "node:assert/strict";
import { validateSmokeTarget } from "./staging-target-policy.ts";

test("staging smoke accepts localhost without a production URL", () => {
  assert.equal(validateSmokeTarget("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
});

test("staging smoke requires explicit production origin and HTTPS for remote tests", () => {
  const production = "https://inboxos.example.com";
  assert.throws(
    () => validateSmokeTarget("https://legacy-preview.example/", production),
    /isolated Vercel preview/,
  );
  assert.equal(
    validateSmokeTarget("https://inboxos-fase16-preview-8y8a3eq0l.vercel.app/", production, {
      vercelPreviewConfirmed: "yes",
    }),
    "https://inboxos-fase16-preview-8y8a3eq0l.vercel.app",
  );
  assert.throws(
    () => validateSmokeTarget("https://inboxos-fase16-preview-8y8a3eq0l.vercel.app/", production),
    /STAGING_VERCEL_PREVIEW_CONFIRMED/,
  );
  assert.throws(() => validateSmokeTarget(production, production), /Refusing/);
  assert.throws(() => validateSmokeTarget("https://legacy-preview.example/"), /PRODUCTION_APP_URL/);
  assert.throws(() => validateSmokeTarget("http://evil.example.com/", production), /HTTPS/);
  assert.throws(
    () => validateSmokeTarget("https://staging.example.com/path", production),
    /clean origin/,
  );
  assert.throws(
    () => validateSmokeTarget("https://u:p@staging.example.com/", production),
    /clean origin/,
  );
  assert.throws(
    () => validateSmokeTarget("https://anything.attacker.invalid/", production),
    /isolated Vercel preview/,
  );
  assert.throws(
    () => validateSmokeTarget("https://inboxos.example/", production),
    /isolated Vercel preview/,
  );
  assert.throws(
    () => validateSmokeTarget("https://inboxos-fase16-preview.vercel.app/", production),
    /isolated Vercel preview/,
  );
  assert.throws(
    () => validateSmokeTarget("https://preview-0.example/", production),
    /isolated Vercel preview/,
  );
  assert.throws(
    () => validateSmokeTarget("https://preview-5.example.evil.org/", production),
    /isolated Vercel preview/,
  );
  assert.throws(
    () => validateSmokeTarget("https://inboxos.vercel.app.evil.org/", production),
    /isolated Vercel preview/,
  );
});
