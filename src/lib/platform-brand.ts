/**
 * Public platform fallback used before a workspace is resolved (auth, errors
 * and the initial shell). Workspace branding still takes precedence after
 * authentication. This value is intentionally non-secret and may be exposed
 * to the browser.
 */
const configuredBrand = import.meta.env?.["VITE_PLATFORM_BRAND_NAME"];

export const PLATFORM_BRAND_NAME =
  typeof configuredBrand === "string" && configuredBrand.trim()
    ? configuredBrand.trim()
    : "Inbox OS";
