/**
 * Cloudflare Turnstile server-side verification.
 * Validates the token sent by the client widget against Cloudflare's API.
 * Returns true if valid, false otherwise.
 */

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerifyResult {
  success: boolean;
  error?: string;
}

export async function verifyTurnstileToken(
  token: string | undefined | null,
  ip?: string | null,
): Promise<TurnstileVerifyResult> {
  const secret = process.env["CLOUDFLARE_TURNSTILE_SECRET_KEY"]?.trim();

  // If Turnstile is not configured, skip verification (dev mode or disabled)
  if (!secret) {
    return { success: true };
  }

  if (!token || typeof token !== "string" || token.length < 10) {
    return { success: false, error: "Token do Turnstile ausente ou inválido" };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secret);
    formData.append("response", token);
    if (ip) {
      formData.append("remoteip", ip);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`[turnstile] HTTP error: ${response.status}`);
      return { success: false, error: "Falha na verificação do Turnstile" };
    }

    const data = await response.json();

    if (!data.success) {
      const errorCodes = data["error-codes"] as string[] | undefined;
      const errorMsg = errorCodes?.join(", ") || "Token inválido";
      return { success: false, error: `Turnstile: ${errorMsg}` };
    }

    return { success: true };
  } catch (error) {
    console.error("[turnstile] verification error:", error);
    return { success: false, error: "Erro ao verificar Turnstile" };
  }
}

/**
 * Extract Turnstile token from request payload.
 * Expected field name: "cf-turnstile-response" or "turnstileToken"
 */
export function extractTurnstileToken(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  const token = p["cf-turnstile-response"] || p["turnstileToken"];
  return typeof token === "string" ? token.trim() : null;
}

/**
 * Get the Turnstile site key for client-side use.
 * Returns null if not configured.
 */
export function getTurnstileSiteKey(): string | null {
  return process.env["VITE_CLOUDFLARE_TURNSTILE_SITE_KEY"]?.trim() || null;
}