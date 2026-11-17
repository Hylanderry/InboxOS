/**
 * Canonical backend origin for links and internally authenticated HTTP calls.
 * Never derive it from Request.url / Host / X-Forwarded-Host: those values are
 * influenced by the inbound connection and can leak secrets through SSRF.
 *
 * Deploy previews need their own provider-generated origin. Using
 * PUBLIC_APP_URL there could accidentally target production.
 */
export function isPreviewDeployment(env: Record<string, string | undefined>): boolean {
  return env["VERCEL"] === "1" && env["VERCEL_ENV"] === "preview";
}

export function trustedAppOrigin(env: Record<string, string | undefined>): string {
  const vercelPreview = env["VERCEL"] === "1" && env["VERCEL_ENV"] === "preview";
  const configured = (
    vercelPreview ? env["VERCEL_BRANCH_URL"] || env["VERCEL_URL"] : env["PUBLIC_APP_URL"]
  )?.trim();
  const raw =
    configured && vercelPreview && !/^[a-z][a-z\d+.-]*:\/\//i.test(configured)
      ? `https://${configured}`
      : configured;
  if (!raw) {
    throw new Error(
      vercelPreview
        ? "VERCEL_URL HTTPS não configurada no preview"
        : "PUBLIC_APP_URL HTTPS não configurada",
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Origem pública inválida");
  }

  const host = url.hostname.toLowerCase();
  const numericOrLocal =
    /^(?:\d+\.){3}\d+$/.test(host) ||
    host.includes(":") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local");
  if (
    url.protocol !== "https:" ||
    !host.includes(".") ||
    numericOrLocal ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("A URL pública deve ser uma origem HTTPS com domínio DNS");
  }

  if (vercelPreview && !host.endsWith(".vercel.app")) {
    throw new Error("VERCEL_URL deve apontar para um preview da Vercel");
  }
  return url.origin;
}
