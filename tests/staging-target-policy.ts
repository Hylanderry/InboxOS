import { isIsolatedPreviewHost } from "../scripts/lib/preview-host-policy.mjs";

/** A remote smoke may not target production, even when run outside GitHub Actions. */
export function validateSmokeTarget(
  rawBase: string,
  rawProduction?: string,
  options: { vercelPreviewConfirmed?: string } = {},
): string {
  const target = new URL(rawBase);
  if (
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== "/"
  ) {
    throw new Error("TEST_BASE_URL must be a clean origin without credentials, path or query");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  if (local && target.protocol === "http:") return target.origin;
  if (target.protocol !== "https:" || !target.hostname.includes(".")) {
    throw new Error("Remote smoke target requires a public HTTPS hostname");
  }
  if (!rawProduction) throw new Error("PRODUCTION_APP_URL is required for remote smoke tests");
  const production = new URL(rawProduction);
  if (production.origin === target.origin) {
    throw new Error("Refusing to execute staging smoke tests against production");
  }
  if (!isIsolatedPreviewHost(target.hostname)) {
    throw new Error("Remote smoke tests require an isolated Vercel preview hostname");
  }
  if (target.hostname.endsWith(".vercel.app") && options.vercelPreviewConfirmed !== "yes") {
    throw new Error("STAGING_VERCEL_PREVIEW_CONFIRMED must be yes for a Vercel deployment target");
  }
  return target.origin;
}
