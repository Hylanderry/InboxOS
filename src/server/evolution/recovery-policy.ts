/** Pure rules for the scheduled Evolution inbox recovery. No credentials or DB side effects. */
export const MAX_EVOLUTION_ATTEMPTS = 5;
export const EVOLUTION_STALE_AFTER_MS = 20 * 60_000;
export const EVOLUTION_QUEUE_GRACE_MS = 90_000;
export const EVOLUTION_RECOVERY_BATCH_SIZE = 18;

export type RecoverableStatus = "queued" | "failed" | "processing";

export interface RecoverableEvolutionEvent {
  id: string;
  status: RecoverableStatus;
  attempts: number;
  received_at: string;
  processing_at: string | null;
  next_attempt_at: string | null;
}

export type RecoveryAction = "dispatch" | "reset-and-dispatch" | "dead-letter" | "skip";

export function decideEvolutionRecovery(
  event: RecoverableEvolutionEvent,
  now = Date.now(),
): RecoveryAction {
  if (!event.id || !Number.isInteger(event.attempts) || event.attempts < 0) return "skip";
  if (event.attempts >= MAX_EVOLUTION_ATTEMPTS) return "dead-letter";
  if (event.status === "queued") {
    const received = Date.parse(event.received_at);
    return Number.isFinite(received) && received <= now - EVOLUTION_QUEUE_GRACE_MS
      ? "dispatch"
      : "skip";
  }
  if (event.status === "failed") {
    // Legacy failures may have no next_attempt_at. Apply the same grace period
    // as queued events, rather than losing them forever.
    const dueAt = Date.parse(event.next_attempt_at || event.received_at);
    const grace = event.next_attempt_at ? 0 : EVOLUTION_QUEUE_GRACE_MS;
    return Number.isFinite(dueAt) && dueAt <= now - grace ? "dispatch" : "skip";
  }
  if (event.status === "processing") {
    // Never reclaim a live background worker before its lease expires.
    const started = Date.parse(event.processing_at || event.received_at);
    return Number.isFinite(started) && started <= now - EVOLUTION_STALE_AFTER_MS
      ? "reset-and-dispatch"
      : "skip";
  }
  return "skip";
}

/** Alternate statuses so one busy category does not starve all the others. */
export function interleaveEvolutionRecovery(
  categories: readonly (readonly RecoverableEvolutionEvent[])[],
  limit = EVOLUTION_RECOVERY_BATCH_SIZE,
): RecoverableEvolutionEvent[] {
  const bounded = Math.max(0, Math.min(100, Math.floor(limit)));
  const output: RecoverableEvolutionEvent[] = [];
  const seen = new Set<string>();
  const maxLength = Math.max(0, ...categories.map((category) => category.length));
  for (let i = 0; i < maxLength && output.length < bounded; i++) {
    for (const category of categories) {
      const event = category[i];
      if (!event || seen.has(event.id)) continue;
      seen.add(event.id);
      output.push(event);
      if (output.length === bounded) break;
    }
  }
  return output;
}
