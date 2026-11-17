import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveAuthDatabase } from "./live-auth-database";
import { hashAuthValue } from "./auth-crypto.ts";

export type SensitiveChallengeAction =
  "email-change-old-start" | "email-change-new-start" | "phone-change-start";
export type ChallengeRateDecision =
  { allowed: true } | { allowed: false; status: 429 | 503; retryAfterSeconds: number };

/** A missing/broken limiter must NEVER be treated as an allowed send. */
export function sensitiveChallengeRateDecision(
  rows: ReadonlyArray<{ allowed: boolean; retry_after_seconds?: number }> | null | undefined,
  error: unknown,
): ChallengeRateDecision {
  if (error || typeof rows?.[0]?.allowed !== "boolean") {
    return { allowed: false, status: 503, retryAfterSeconds: 60 };
  }
  if (rows[0].allowed !== true) {
    const raw = rows[0].retry_after_seconds;
    const retryAfterSeconds =
      typeof raw === "number" && Number.isFinite(raw)
        ? Math.min(3600, Math.max(1, Math.ceil(raw)))
        : 3600;
    return { allowed: false, status: 429, retryAfterSeconds };
  }
  return { allowed: true };
}

/** In addition to the general per-request limiter, cap outbound OTP issuance. */
export async function enforceSensitiveChallengeRateLimit(
  database: SupabaseClient<LiveAuthDatabase>,
  secret: string,
  userId: string,
  action: SensitiveChallengeAction,
): Promise<ChallengeRateDecision> {
  try {
    const { data, error } = await database.rpc("consume_auth_rate_limit", {
      p_action: action,
      p_scope_hash: hashAuthValue(secret, "account-change-otp-request", `${action}\0${userId}`),
      p_limit: 5,
      p_window_seconds: 3600,
      p_block_seconds: 3600,
    });
    return sensitiveChallengeRateDecision(data, error);
  } catch {
    return { allowed: false, status: 503, retryAfterSeconds: 60 };
  }
}

export type SensitiveVerifyAction =
  | "password-reset-verify"
  | "email-change-old-verify"
  | "email-change-new-verify"
  | "phone-change-verify";

/** A six-digit code has low entropy: cap attempts by challenge UUID, across IPs. */
export async function enforceSensitiveChallengeVerifyLimit(
  database: SupabaseClient<LiveAuthDatabase>,
  secret: string,
  challengeId: string,
  action: SensitiveVerifyAction,
): Promise<ChallengeRateDecision> {
  try {
    const { data, error } = await database.rpc("consume_auth_rate_limit", {
      p_action: action,
      p_scope_hash: hashAuthValue(
        secret,
        "account-change-otp-verification",
        `${action}\0${challengeId}`,
      ),
      p_limit: 10,
      p_window_seconds: 600,
      p_block_seconds: 600,
    });
    return sensitiveChallengeRateDecision(data, error);
  } catch {
    return { allowed: false, status: 503, retryAfterSeconds: 60 };
  }
}
