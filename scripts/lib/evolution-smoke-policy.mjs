import { isIsolatedPreviewHost } from "./preview-host-policy.mjs";

/**
 * Fail-closed preflight for a synthetic Evolution webhook smoke test.
 * Pure: does not read secrets from logs, make network calls or modify a DB.
 * Environment declarations cannot independently prove a preview's DB wiring;
 * operators must verify the target in the hosting dashboard before executing.
 */
const projectRefPattern = /^[a-z0-9]{20}$/;

export function validateEvolutionSmokeEnvironment(env) {
  const errors = [];
  let url;
  try {
    url = new URL(String(env.EVOLUTION_STAGING_WEBHOOK_URL ?? ""));
  } catch {
    errors.push("EVOLUTION_STAGING_WEBHOOK_URL: URL inválida");
  }

  if (
    url &&
    (url.protocol !== "https:" ||
      !isIsolatedPreviewHost(url.hostname) ||
      url.pathname !== "/api/public/webhooks/evolution" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      url.port)
  ) {
    errors.push(
      "EVOLUTION_STAGING_WEBHOOK_URL: exige HTTPS e rota exata de preview Vercel isolado",
    );
  }

  const instance = String(env.EVOLUTION_STAGING_INSTANCE ?? "");
  if (!/^[a-z0-9_-]{3,80}$/i.test(instance)) {
    errors.push("EVOLUTION_STAGING_INSTANCE: nome de instância de teste inválido");
  }
  if (String(env.EVOLUTION_STAGING_WEBHOOK_TOKEN ?? "").trim().length < 16) {
    errors.push("EVOLUTION_STAGING_WEBHOOK_TOKEN: deve conter no mínimo 16 caracteres");
  }

  const stagingRef = String(env.EVOLUTION_STAGING_SUPABASE_REF ?? "");
  const productionRef = String(env.EVOLUTION_PRODUCTION_SUPABASE_REF ?? "");
  if (!projectRefPattern.test(stagingRef)) {
    errors.push("EVOLUTION_STAGING_SUPABASE_REF: project ref de staging inválido");
  }
  if (!projectRefPattern.test(productionRef)) {
    errors.push(
      "EVOLUTION_PRODUCTION_SUPABASE_REF: declarar explicitamente o project ref de produção",
    );
  }
  if (stagingRef && stagingRef === productionRef) {
    errors.push("EVOLUTION_STAGING_SUPABASE_REF: coincide com referência protegida de produção");
  }

  let productionOrigin;
  try {
    const production = new URL(String(env.PRODUCTION_APP_URL ?? ""));
    if (
      production.protocol !== "https:" ||
      production.username ||
      production.password ||
      !production.hostname.includes(".")
    ) {
      throw new Error("not public HTTPS");
    }
    productionOrigin = production.origin;
  } catch {
    errors.push("PRODUCTION_APP_URL: URL HTTPS de produção é obrigatória para comparação");
  }
  if (url && productionOrigin && url.origin === productionOrigin) {
    errors.push("EVOLUTION_STAGING_WEBHOOK_URL: a origem coincide com produção");
  }
  if (env.STAGING_ISOLATED_DB_CONFIRMED !== "yes") {
    errors.push("STAGING_ISOLATED_DB_CONFIRMED: verificar conexão do Preview ao banco de teste");
  }
  if (
    url &&
    isIsolatedPreviewHost(url.hostname) &&
    url.hostname.endsWith(".vercel.app") &&
    env.STAGING_VERCEL_PREVIEW_CONFIRMED !== "yes"
  ) {
    errors.push(
      "STAGING_VERCEL_PREVIEW_CONFIRMED: confirmar que a URL Vercel é um deployment de staging, não um alias de produção",
    );
  }
  if (env.STAGING_AUTOREPLY_DISABLED_CONFIRMED !== "yes") {
    errors.push(
      "STAGING_AUTOREPLY_DISABLED_CONFIRMED: desabilitar agentes e respostas automáticas antes de injetar mensagens",
    );
  }
  // Return only the URL and a boolean. Never return/copy the webhook secret.
  return { valid: errors.length === 0, errors, url: errors.length ? undefined : url };
}
