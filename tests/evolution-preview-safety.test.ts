import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { validateEvolutionSmokeEnvironment } from "../scripts/lib/evolution-smoke-policy.mjs";

const env = {
  EVOLUTION_STAGING_WEBHOOK_URL:
    "https://inboxos-fase16-uiux-consolidado-2026-10-11-8y8a3eq0l.vercel.app/api/public/webhooks/evolution",
  EVOLUTION_STAGING_INSTANCE: "smoke-test-01",
  EVOLUTION_STAGING_WEBHOOK_TOKEN: "synthetic-staging-token-123456",
  EVOLUTION_STAGING_SUPABASE_REF: "bbbbbbbbbbbbbbbbbbbb",
  EVOLUTION_PRODUCTION_SUPABASE_REF: "aaaaaaaaaaaaaaaaaaaa",
  PRODUCTION_APP_URL: "https://app.inboxos.example",
  STAGING_ISOLATED_DB_CONFIRMED: "yes",
  STAGING_AUTOREPLY_DISABLED_CONFIRMED: "yes",
  STAGING_VERCEL_PREVIEW_CONFIRMED: "yes",
};

test("synthetic webhook smoke accepts only explicitly confirmed isolated preview", () => {
  const result = validateEvolutionSmokeEnvironment(env);
  assert.equal(result.valid, true);
  assert.equal(
    result.url?.hostname,
    "inboxos-fase16-uiux-consolidado-2026-10-11-8y8a3eq0l.vercel.app",
  );
  assert.equal(JSON.stringify(result).includes(env.EVOLUTION_STAGING_WEBHOOK_TOKEN), false);
});

test("synthetic webhook smoke accepts the Vercel preview used by the primary runtime", () => {
  const result = validateEvolutionSmokeEnvironment({
    ...env,
    EVOLUTION_STAGING_WEBHOOK_URL:
      "https://inboxos-fase16-uiux-consolidado-2026-10-11-8y8a3eq0l.vercel.app/api/public/webhooks/evolution",
  });
  assert.equal(result.valid, true);
  assert.equal(
    result.url?.hostname,
    "inboxos-fase16-uiux-consolidado-2026-10-11-8y8a3eq0l.vercel.app",
  );
});

test("webhook smoke rejects production ref, including the historically documented one", () => {
  assert.equal(
    validateEvolutionSmokeEnvironment({
      ...env,
      EVOLUTION_STAGING_SUPABASE_REF: env.EVOLUTION_PRODUCTION_SUPABASE_REF,
    }).valid,
    false,
  );
  assert.equal(
    validateEvolutionSmokeEnvironment({ ...env, EVOLUTION_PRODUCTION_SUPABASE_REF: "" }).valid,
    false,
  );
});

test("webhook smoke refuses missing isolation or disabled-autoreply confirmations", () => {
  for (const key of [
    "STAGING_ISOLATED_DB_CONFIRMED",
    "STAGING_AUTOREPLY_DISABLED_CONFIRMED",
  ] as const) {
    const result = validateEvolutionSmokeEnvironment({ ...env, [key]: "" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((x) => x.includes(key)));
  }
});

test("Vercel webhook smoke refuses an unconfirmed deployment alias", () => {
  const result = validateEvolutionSmokeEnvironment({
    ...env,
    STAGING_VERCEL_PREVIEW_CONFIRMED: "",
    EVOLUTION_STAGING_WEBHOOK_URL:
      "https://inboxos-fase16-uiux-consolidado-2026-10-11-8y8a3eq0l.vercel.app/api/public/webhooks/evolution",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((x) => x.includes("STAGING_VERCEL_PREVIEW_CONFIRMED")));
});

test("webhook smoke refuses URL tricks, non-preview sites and non-exact paths", () => {
  const forbidden = [
    "https://preview.example.invalid/api/public/webhooks/evolution",
    "https://inboxos.vercel.app/api/public/webhooks/evolution",
    "https://inboxos-fase16-uiux-consolidado-2026-10-11-8y8a3eq0l.vercel.app.evil.invalid/api/public/webhooks/evolution",
    "https://inboxos-fase16-uiux-consolidado-2026-10-11-8y8a3eq0l.vercel.app.evil.invalid/api/public/webhooks/evolution",
    "http://inboxos-fase16-uiux-consolidado-2026-10-11-8y8a3eq0l.vercel.app/api/public/webhooks/evolution",
    "https://user:pass@inboxos-fase16-uiux-consolidado-2026-10-11-8y8a3eq0l.vercel.app/api/public/webhooks/evolution",
    "https://inboxos-fase16-uiux-consolidado-2026-10-11-8y8a3eq0l.vercel.app/api/public/webhooks/evolution?token=abc",
    "https://inboxos-fase16-uiux-consolidado-2026-10-11-8y8a3eq0l.vercel.app/api/public/webhooks/evolution/extra",
  ];
  for (const raw of forbidden)
    assert.equal(
      validateEvolutionSmokeEnvironment({ ...env, EVOLUTION_STAGING_WEBHOOK_URL: raw }).valid,
      false,
      raw,
    );
});

test("webhook smoke refuses short token and a production-origin match", () => {
  assert.equal(
    validateEvolutionSmokeEnvironment({ ...env, EVOLUTION_STAGING_WEBHOOK_TOKEN: "short" }).valid,
    false,
  );
  assert.equal(
    validateEvolutionSmokeEnvironment({
      ...env,
      PRODUCTION_APP_URL: "https://inboxos-fase16-uiux-consolidado-2026-10-11-8y8a3eq0l.vercel.app",
    }).valid,
    false,
  );
});

test("the default webhook smoke mode never makes requests or requires credentials", () => {
  const proc = spawnSync(process.execPath, ["scripts/evolution-preview-smoke.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" },
    timeout: 5000,
  });
  assert.equal(proc.status, 0);
  assert.match(proc.stdout, /DRY RUN/);
  assert.match(proc.stdout, /zero network requests/);
});

test("execute without staging credentials fails closed before network activity", () => {
  const proc = spawnSync(process.execPath, ["scripts/evolution-preview-smoke.mjs", "--execute"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" },
    timeout: 5000,
  });
  assert.equal(proc.status, 2);
  assert.match(proc.stderr, /BLOCKED:/);
  assert.doesNotMatch(proc.stdout, /HTTP 2\d\d/);
});
