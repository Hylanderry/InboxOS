import { isPreviewDeployment, trustedAppOrigin } from "../security/trusted-app-origin.ts";

/** Production uses PUBLIC_APP_URL; Vercel previews use VERCEL_BRANCH_URL or VERCEL_URL.
 * In particular, a preview MUST NOT reconfigure the live Evolution instance.
 */
export function evolutionWebhookUrl(env: Record<string, string | undefined>): string {
  return `${trustedAppOrigin(env)}/api/public/webhooks/evolution`;
}

/** Webhook configuration MUTATES the remote Evolution instance. A Deploy
 * Preview must never silently rewrite the live instance callback. Enable only
 * with a dedicated sandbox Evolution instance and explicit opt-in.
 */
export function assertEvolutionWebhookConfigurationAllowed(
  env: Record<string, string | undefined>,
): void {
  if (isPreviewDeployment(env) && env["EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE"] !== "true") {
    throw new Error(
      "Webhook Evolution em preview exige instância sandbox e EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE=true",
    );
  }
}
