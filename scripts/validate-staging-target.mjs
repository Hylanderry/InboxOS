#!/usr/bin/env node
/** Only permit no-credential, isolated Vercel previews. */
import { validateSmokeTarget } from "../tests/staging-target-policy.ts";
try {
  if (!process.env.TEST_BASE_URL) throw new Error("TEST_BASE_URL is required");
  const origin = validateSmokeTarget(process.env.TEST_BASE_URL, process.env.PRODUCTION_APP_URL, {
    vercelPreviewConfirmed: process.env.STAGING_VERCEL_PREVIEW_CONFIRMED,
  });
  if (origin.startsWith("http://"))
    throw new Error("GitHub staging workflow requires a remote HTTPS Deploy Preview");
  console.log("PASS: isolated Vercel preview target verified");
} catch (error) {
  console.error(`BLOCKED: ${error instanceof Error ? error.message : "invalid staging target"}`);
  process.exitCode = 1;
}
