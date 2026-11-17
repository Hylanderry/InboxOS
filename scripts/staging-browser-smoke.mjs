#!/usr/bin/env node
/**
 * Safe browser smoke for an isolated staging/preview URL.
 * It exercises public UI only: no login, database write, provider call or message send.
 */
import { chromium } from "playwright";
import { validateSmokeTarget } from "../tests/staging-target-policy.ts";

const baseUrl = process.env.TEST_BASE_URL;
if (!baseUrl) {
  console.error("BLOCKED: TEST_BASE_URL is required");
  process.exit(1);
}

let origin;
try {
  origin = validateSmokeTarget(baseUrl, process.env.PRODUCTION_APP_URL, {
    vercelPreviewConfirmed: process.env.STAGING_VERCEL_PREVIEW_CONFIRMED,
  });
  if (!origin.startsWith("https://")) throw new Error("remote browser smoke requires HTTPS");
} catch (error) {
  console.error(`BLOCKED: ${error instanceof Error ? error.message : "invalid staging target"}`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
});
const page = await context.newPage();
const runtimeErrors = [];
page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  const url = request.url();
  if (url.startsWith(origin)) runtimeErrors.push(`requestfailed: ${url}`);
});

async function visit(pathname, assertion) {
  const response = await page.goto(`${origin}${pathname}`, { waitUntil: "domcontentloaded" });
  if (!response || response.status() >= 400) {
    throw new Error(`${pathname} returned ${response?.status() ?? "no response"}`);
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  await assertion();
}

try {
  await visit("/auth/login", async () => {
    await page.getByRole("heading", { name: /Entre na sua conta/i }).waitFor();
    await page.locator("#remember-device").check();
    await page.locator(".auth-theme-toggle").click();
    await page.locator(".auth-theme-toggle").click();
  });

  await visit("/auth/register", async () => {
    await page.getByRole("heading", { name: /Crie sua conta/i }).waitFor();
    await page.locator(".auth-country-trigger").click();
    await page.getByRole("listbox", { name: /Selecionar país/i }).waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".auth-legal-row").click();
    await page.locator(".legal-dialog-overlay").waitFor();
    await page.locator(".legal-dialog-close").click();
  });

  for (const pathname of ["/legal/terms", "/legal/privacy", "/legal/cookies"]) {
    await visit(pathname, async () => {
      if (!(await page.locator("body").innerText()).trim())
        throw new Error(`${pathname} rendered empty content`);
    });
  }

  if (runtimeErrors.length) {
    throw new Error(`runtime errors: ${runtimeErrors.join(" | ")}`);
  }
  console.log("PASS: staging browser smoke (auth UI, legal UI, mobile viewport, no writes)");
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : "browser smoke failed"}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
