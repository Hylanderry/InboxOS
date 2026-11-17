import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  extractSupabaseProjectRef,
  validateProductionEnvironment,
  validatePackageLock,
} from "../scripts/lib/release-validation.mjs";

const good = {
  SUPABASE_URL: "https://staging-ref.supabase.co",
  VITE_SUPABASE_URL: "https://staging-ref.supabase.co",
  EXPECTED_SUPABASE_PROJECT_REF: "stagingref1234567890",
  PUBLIC_APP_URL: "https://inboxos.example.org",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789012",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789012",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_abcdefghijklmnopqrstuv",
  AUTH_CRYPTO_SECRET: "a".repeat(64),
  INTEGRATION_VAULT_KEY: Buffer.alloc(32, 42).toString("base64"),
  ENABLE_BILLING: "false",
  VITE_ENABLE_BILLING: "false",
  ENABLE_EVOLUTION_RECOVERY: "true",
  SYSTEM_ADMIN_BOOTSTRAP_EMAILS: "",
};

test("production config accepts a structurally valid isolated environment", () => {
  assert.deepEqual(validateProductionEnvironment(good), []);
});

test("Supabase JWT project refs are extracted without exposing token contents", () => {
  const payload = Buffer.from(
    JSON.stringify({ ref: "publictestref1234567890", role: "service_role" }),
  ).toString("base64url");
  const token = `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
  assert.equal(extractSupabaseProjectRef(token), "publictestref1234567890");
  assert.equal(extractSupabaseProjectRef("sb_publishable_public-value"), null);
  assert.equal(extractSupabaseProjectRef("not-a-token"), null);
});

test("production config rejects a staging Supabase project", () => {
  const errors = validateProductionEnvironment({ ...good, CONTEXT: "production" });
  assert.ok(errors.some((x) => x.includes("staging")));
});

test("production config rejects missing server secret and leaks no values", () => {
  const secret = "SUPER-PRIVATE-BYTES-MUST-NEVER-PRINT";
  const errors = validateProductionEnvironment({
    ...good,
    SUPABASE_SERVICE_ROLE_KEY: secret,
    AUTH_CRYPTO_SECRET: "",
    INTEGRATION_VAULT_KEY: "invalid",
    ENABLE_BILLING: "true",
    SYSTEM_ADMIN_BOOTSTRAP_EMAILS: "owner@example.org",
  });
  assert.ok(errors.some((x) => x.includes("AUTH_CRYPTO_SECRET")));
  assert.ok(errors.some((x) => x.includes("INTEGRATION_VAULT_KEY")));
  assert.ok(errors.some((x) => x.includes("SYSTEM_ADMIN_BOOTSTRAP_EMAILS")));
  assert.ok(errors.some((x) => x.includes("Billing")));
  assert.ok(!errors.join("\n").includes(secret));
});

test("release config disallows cross-project urls, non-HTTPS and placeholder domains", () => {
  const errors = validateProductionEnvironment({
    ...good,
    SUPABASE_URL: "http://localhost:54321",
    PUBLIC_APP_URL: "https://example.com",
  });
  assert.ok(errors.some((x) => x.includes("SUPABASE_URL")));
  assert.ok(errors.some((x) => x.includes("PUBLIC_APP_URL")));
});

test("lockfile consistency checker catches root and resolved mismatches", () => {
  const manifest = {
    name: "test",
    dependencies: { alpha: "1.0.0" },
    devDependencies: { beta: "^2.0.0" },
  };
  const lock = {
    lockfileVersion: 3,
    packages: {
      "": { name: "test", dependencies: { alpha: "1.0.0" }, devDependencies: { beta: "^2.0.0" } },
      "node_modules/alpha": {
        version: "1.0.0",
        integrity: "sha512-abc",
        resolved: "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
      },
      "node_modules/beta": {
        version: "2.0.1",
        integrity: "sha512-def",
        resolved: "https://registry.npmjs.org/beta/-/beta-2.0.1.tgz",
      },
    },
  };
  assert.deepEqual(validatePackageLock(manifest, lock), []);
  assert.ok(
    validatePackageLock(manifest, {
      ...lock,
      packages: { ...lock.packages, "node_modules/beta": undefined },
    }).some((x) => x.includes("beta")),
  );
  assert.ok(
    validatePackageLock(manifest, {
      ...lock,
      packages: {
        ...lock.packages,
        "": { ...lock.packages[""], devDependencies: { beta: "2.0.0" } },
      },
    }).some((x) => x.includes("beta")),
  );
});

test("actual repository lock produces an actionable, secret-free diagnostic regardless of sync state", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  const issues = validatePackageLock(manifest, lock);
  // The test must KEEP PASSING after npm regenerates the lockfile.
  assert.ok(Array.isArray(issues));
  assert.ok(issues.every((issue) => typeof issue === "string" && issue.length > 0));
  assert.ok(issues.every((issue) => !issue.includes("sb_secret_")));
});

test("production refuses to ship with durable Evolution recovery switched off", () => {
  const errors = validateProductionEnvironment({ ...good, ENABLE_EVOLUTION_RECOVERY: "false" });
  assert.ok(errors.some((issue) => issue.includes("ENABLE_EVOLUTION_RECOVERY")));
});

test("release lint ignores generated deployment artifacts", () => {
  const fixtureRoot = mkdtempSync(resolve(".eslint-artifact-fixtures-"));
  const generatedFiles = [
    join(fixtureRoot, ".vercel", "generated.js"),
    join(fixtureRoot, ".tmp-vercel-preview-99", "generated.js"),
  ];

  try {
    for (const file of generatedFiles) {
      mkdirSync(resolve(file, ".."), { recursive: true });
      writeFileSync(file, "const = ;\n", "utf8");
    }

    const eslintCli = resolve("node_modules", "eslint", "bin", "eslint.js");
    const result = spawnSync(
      process.execPath,
      [eslintCli, "--no-warn-ignored", ...generatedFiles],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 30_000,
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
