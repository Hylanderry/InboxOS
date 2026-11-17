import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deploymentGateSteps } from "../scripts/release-build-gate.mjs";

test("Vercel production runs tests/lint/typecheck/env check before bundling", () => {
  const stages = deploymentGateSteps("production").map(({ label }) => label);
  assert.deepEqual(stages, [
    "unit-and-regression",
    "release-preflight",
    "eslint",
    "typescript",
    "production-environment",
    "vite-vercel-build",
  ]);
});

test("preview builds still test source but never require production secrets", () => {
  const stages = deploymentGateSteps("deploy-preview").map(({ label }) => label);
  assert.deepEqual(stages, [
    "unit-and-regression",
    "release-preflight",
    "eslint",
    "typescript",
    "vite-vercel-build",
  ]);
});

test("the release gate is exposed explicitly for Vercel promotions", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts["release:check"], "node scripts/release-build-gate.mjs");
});
