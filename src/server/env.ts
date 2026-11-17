const requiredServerEnv = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function validateServerEnvironment() {
  const missing = requiredServerEnv.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`Server configuration incomplete. Missing: ${missing.join(", ")}`);
  }
  return true;
}

export function getOptionalIntegrations() {
  return {
    resend: Boolean(process.env["RESEND_API_KEY"]),
    evolution: Boolean(process.env["EVOLUTION_API_URL"] && process.env["EVOLUTION_API_KEY"]),
    groq: Boolean(process.env["GROQ_API_KEY"]),
  };
}
