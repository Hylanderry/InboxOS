import { Buffer } from "node:buffer";

/** No secret values are ever included in diagnostics. */
export function extractSupabaseProjectRef(value) {
  const token = String(value ?? "").trim();
  if (!token.startsWith("eyJ")) return null;
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof decoded?.ref === "string" && /^[a-z0-9]{10,40}$/.test(decoded.ref)
      ? decoded.ref
      : null;
  } catch {
    return null;
  }
}

export function validateProductionEnvironment(env) {
  const errors = [];
  const productionRef = String(env.EXPECTED_SUPABASE_PROJECT_REF ?? "").trim();
  const isProduction =
    String(env.VERCEL_ENV ?? "").toLowerCase() === "production" ||
    String(env.CONTEXT ?? "").toLowerCase() === "production";
  const required = (name, min = 1) => {
    const value = String(env[name] ?? "").trim();
    if (value.length < min || /^REPLACE|^YOUR|^PROJECT\b|example\.com/i.test(value)) {
      errors.push(`${name}: não configurada ou contém placeholder`);
    }
    return value;
  };
  for (const name of ["SUPABASE_URL", "PUBLIC_APP_URL", "VITE_SUPABASE_URL"]) {
    const raw = required(name);
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        parsed.hostname === "localhost" ||
        !parsed.hostname.includes(".")
      ) {
        errors.push(`${name}: deve ser URL HTTPS pública sem credenciais`);
      }
    } catch {
      errors.push(`${name}: URL inválida`);
    }
  }
  required("SUPABASE_PUBLISHABLE_KEY", 16);
  required("VITE_SUPABASE_PUBLISHABLE_KEY", 16);
  required("SUPABASE_SERVICE_ROLE_KEY", 24);
  required("AUTH_CRYPTO_SECRET", 32);
  const vault = required("INTEGRATION_VAULT_KEY", 40);
  if (vault) {
    const decoded = Buffer.from(vault, "base64");
    if (
      decoded.length !== 32 ||
      decoded.toString("base64").replace(/=+$/, "") !== vault.replace(/=+$/, "")
    ) {
      errors.push("INTEGRATION_VAULT_KEY: esperado base64 de exatamente 32 bytes");
    }
  }
  if (env["ENABLE_EVOLUTION_RECOVERY"] !== "true") {
    errors.push(
      "ENABLE_EVOLUTION_RECOVERY: deve estar true no release de produção após homologação da fila",
    );
  }
  if (env["ENABLE_BILLING"] !== "false" || env["VITE_ENABLE_BILLING"] !== "false") {
    errors.push(
      "Billing: ENABLE_BILLING e VITE_ENABLE_BILLING devem estar explicitamente false no core",
    );
  }
  if (String(env["SYSTEM_ADMIN_BOOTSTRAP_EMAILS"] ?? "").trim()) {
    errors.push(
      "SYSTEM_ADMIN_BOOTSTRAP_EMAILS: remover após o bootstrap e antes do release de produção",
    );
  }
  try {
    const app = new URL(String(env.PUBLIC_APP_URL));
    const browser = new URL(String(env.VITE_SUPABASE_URL));
    const server = new URL(String(env.SUPABASE_URL));
    if (browser.origin !== server.origin)
      errors.push("SUPABASE_URL/VITE_SUPABASE_URL: apontam para projetos diferentes");
    if (isProduction) {
      const refs = [
        browser.hostname.split(".")[0],
        server.hostname.split(".")[0],
        env.VITE_SUPABASE_PROJECT_ID,
      ]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
      if (!productionRef || !/^[a-z0-9]{10,40}$/.test(productionRef))
        errors.push(
          "EXPECTED_SUPABASE_PROJECT_REF: declarar o project ref de producao no ambiente do deploy",
        );
      if (productionRef && refs.some((ref) => ref !== productionRef))
        errors.push("Supabase: produção não pode apontar para o projeto de staging");
    }
    if (app.origin === browser.origin)
      errors.push("PUBLIC_APP_URL: não deve ser o endpoint do Supabase");
  } catch {
    /* URLs already reported above */
  }
  return errors;
}

export function validatePackageLock(manifest, lock) {
  const errors = [];
  if (lock?.lockfileVersion !== 3) errors.push("package-lock.json: exige lockfileVersion 3");
  if (!lock?.packages?.[""]) return [...errors, "package-lock.json: pacote raiz ausente"];
  const root = lock.packages[""];
  if (root.name !== manifest.name) errors.push("package-lock.json: nome do pacote raiz diverge");
  for (const group of ["dependencies", "devDependencies"]) {
    const wanted = manifest[group] ?? {};
    const actual = root[group] ?? {};
    for (const [name, range] of Object.entries(wanted)) {
      if (actual[name] !== range)
        errors.push(`${group}: ${name} ausente/divergente no pacote raiz do lock`);
      const pkg = lock.packages[`node_modules/${name}`];
      if (!pkg) errors.push(`${group}: pacote instalado ${name} não consta no lock`);
      else if (!pkg.link && (!pkg.version || !pkg.resolved || !pkg.integrity)) {
        errors.push(`${group}: pacote ${name} sem versão, resolução ou integridade no lock`);
      }
    }
    for (const name of Object.keys(actual)) {
      if (!(name in wanted)) errors.push(`${group}: pacote ${name} existe apenas no lock`);
    }
  }
  return errors;
}
