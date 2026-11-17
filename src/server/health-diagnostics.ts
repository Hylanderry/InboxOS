/** Exposes configured delivery mode, not a misleading hardcoded queue flag.
 * This is a diagnostic hint; real worker availability requires a staging test.
 */
export function getEvolutionDeliveryDiagnostics(
  _request: Request,
  env: Record<string, string | undefined>,
) {
  const vercelDeployment = env["VERCEL"] === "1";
  return {
    queueConfigured: false,
    deliveryMode: vercelDeployment ? "vercel-background" : "inline",
    recoveryEnabled: env["ENABLE_EVOLUTION_RECOVERY"] === "true",
  };
}
