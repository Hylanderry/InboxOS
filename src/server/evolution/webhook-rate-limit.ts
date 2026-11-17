/** Fail-closed webhook admission control. The credential has already been
 * verified by isValidManagedWebhookRequest before this function is called.
 * Proxy IP headers are client-controlled on some deployments; using them as
 * the rate-limit key permits an attacker to evade throttling.
 */
import { logServerError } from "../logging.ts";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface WebhookRateDecision {
  allowed: boolean;
  unavailable: boolean;
  retryAfterSeconds: number;
}

export function interpretWebhookRateResult(
  data: Array<{ allowed?: unknown; retry_after_seconds?: unknown }> | null | undefined,
  error?: unknown,
): WebhookRateDecision {
  const row = data?.[0];
  if (error || typeof row?.allowed !== "boolean") {
    return { allowed: false, unavailable: true, retryAfterSeconds: 30 };
  }
  if (row.allowed) return { allowed: true, unavailable: false, retryAfterSeconds: 0 };
  const seconds = Number(row.retry_after_seconds);
  return {
    allowed: false,
    unavailable: false,
    retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60,
  };
}

export async function consumeEvolutionWebhookRateLimit(
  request: Request,
): Promise<WebhookRateDecision> {
  // Never accept an unverified / missing credential as an independent quota.
  const credential = request.headers.get("x-webhook-token") || request.headers.get("apikey");
  if (!credential) return { allowed: false, unavailable: true, retryAfterSeconds: 30 };
  try {
    const { supabaseAdmin } = await import("../../integrations/supabase/client.server");
    const scope = await sha256(`evolution-webhook-v2:${credential}`);
    const { data, error } = await supabaseAdmin.rpc("consume_auth_rate_limit", {
      p_action: "evolution-webhook-v2",
      p_scope_hash: scope,
      p_limit: 1200,
      p_window_seconds: 60,
      p_block_seconds: 60,
    });
    const decision = interpretWebhookRateResult(
      Array.isArray(data)
        ? (data as Array<{ allowed?: unknown; retry_after_seconds?: unknown }>)
        : null,
      error,
    );
    if (decision.unavailable) logServerError("[evolution-webhook] rate limiter unavailable", error);
    return decision;
  } catch (error) {
    logServerError("[evolution-webhook] rate limiter unavailable", error);
    return { allowed: false, unavailable: true, retryAfterSeconds: 30 };
  }
}
