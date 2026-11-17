/** Decisions are intentionally conservative: never resend a message after an
 * ambiguous gateway outcome or while a competing request could be sending it.
 */
export type OutboundStatus =
  "pending" | "sending" | "accepted" | "confirmed" | "unknown" | "failed";
export type OutboundDecision = "create" | "claim-failed" | "duplicate" | "in-flight" | "ambiguous";

export function decideOutboundAttempt(status: OutboundStatus | null): OutboundDecision {
  if (status === null) return "create";
  if (status === "failed") return "claim-failed";
  if (status === "accepted" || status === "confirmed") return "duplicate";
  if (status === "unknown") return "ambiguous";
  return "in-flight";
}

/** 0 = network/timeout with no response. 5xx and HTTP 408 are not proof that
 * the upstream did not accept the message; blind retries can send duplicates.
 */
export function isAmbiguousEvolutionSendFailure(status: number): boolean {
  return status === 0 || status === 408 || status >= 500;
}
