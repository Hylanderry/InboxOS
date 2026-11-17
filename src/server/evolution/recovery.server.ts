/** Server-only, bounded recovery for durable Evolution inbox messages.
 * A Vercel cron invokes this; it never uses browser credentials.
 */
import type { supabaseAdmin } from "../../integrations/supabase/client.server";
import {
  decideEvolutionRecovery,
  EVOLUTION_QUEUE_GRACE_MS,
  EVOLUTION_RECOVERY_BATCH_SIZE,
  EVOLUTION_STALE_AFTER_MS,
  interleaveEvolutionRecovery,
  type RecoverableEvolutionEvent,
} from "./recovery-policy.ts";

type RecoveryDatabase = Pick<typeof supabaseAdmin, "from">;

type RecoverySender = (eventId: string) => Promise<void>;

export interface EvolutionRecoveryReport {
  examined: number;
  dispatched: number;
  reset: number;
  deadLettered: number;
  failedToDispatch: number;
}

export async function recoverEvolutionInbox(
  db: RecoveryDatabase,
  send: RecoverySender,
  options: { now?: number; maxBatch?: number; concurrency?: number } = {},
): Promise<EvolutionRecoveryReport> {
  const now = options.now ?? Date.now();
  if (!Number.isFinite(now)) throw new Error("Invalid recovery clock");
  const maxBatch = Math.max(
    1,
    Math.min(48, Math.floor(options.maxBatch ?? EVOLUTION_RECOVERY_BATCH_SIZE)),
  );
  const concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency ?? 3)));
  const cutOff = new Date(now - EVOLUTION_STALE_AFTER_MS).toISOString();
  const queuedCutOff = new Date(now - EVOLUTION_QUEUE_GRACE_MS).toISOString();
  const nowIso = new Date(now).toISOString();
  const fields = "id,status,attempts,received_at,processing_at,next_attempt_at";

  const [stale, failed, queued, staleWithoutTimestamp, failedWithoutRetry] = await Promise.all([
    db
      .from("evolution_events")
      .select(fields)
      .eq("status", "processing")
      .lte("processing_at", cutOff)
      .order("processing_at", { ascending: true })
      .limit(maxBatch),
    db
      .from("evolution_events")
      .select(fields)
      .eq("status", "failed")
      .lte("next_attempt_at", nowIso)
      .order("next_attempt_at", { ascending: true })
      .limit(maxBatch),
    db
      .from("evolution_events")
      .select(fields)
      .eq("status", "queued")
      .lte("received_at", queuedCutOff)
      .order("received_at", { ascending: true })
      .limit(maxBatch),
    db
      .from("evolution_events")
      .select(fields)
      .eq("status", "processing")
      .is("processing_at", null)
      .lte("received_at", cutOff)
      .order("received_at", { ascending: true })
      .limit(maxBatch),
    db
      .from("evolution_events")
      .select(fields)
      .eq("status", "failed")
      .is("next_attempt_at", null)
      .lte("received_at", queuedCutOff)
      .order("received_at", { ascending: true })
      .limit(maxBatch),
  ]);
  for (const result of [stale, failed, queued, staleWithoutTimestamp, failedWithoutRetry]) {
    if (result.error) throw new Error(`Evolution recovery scan failed: ${result.error.message}`);
  }

  const candidates = interleaveEvolutionRecovery(
    [
      [...(stale.data ?? []), ...(staleWithoutTimestamp.data ?? [])] as RecoverableEvolutionEvent[],
      [...(failed.data ?? []), ...(failedWithoutRetry.data ?? [])] as RecoverableEvolutionEvent[],
      (queued.data ?? []) as RecoverableEvolutionEvent[],
    ],
    maxBatch,
  );
  const report: EvolutionRecoveryReport = {
    examined: candidates.length,
    dispatched: 0,
    reset: 0,
    deadLettered: 0,
    failedToDispatch: 0,
  };

  async function consume(event: RecoverableEvolutionEvent): Promise<void> {
    const action = decideEvolutionRecovery(event, now);
    if (action === "skip") return;
    if (action === "dead-letter" || action === "reset-and-dispatch") {
      // Compare-and-set: a running or newer worker is never overwritten.
      // The worker increments attempts only when it takes the next claim.
      let update = db
        .from("evolution_events")
        .update(
          action === "dead-letter"
            ? {
                status: "dead_letter",
                next_attempt_at: null,
                last_error: "Limite de tentativas atingido",
              }
            : {
                status: "failed",
                next_attempt_at: nowIso,
                last_error: "Worker interrompido: lease expirado",
              },
        )
        .eq("id", event.id)
        .eq("status", event.status)
        .eq("attempts", event.attempts);
      if (event.status === "processing") {
        update = event.processing_at
          ? update.eq("processing_at", event.processing_at)
          : update.is("processing_at", null);
      }
      const { data, error } = await update.select("id").maybeSingle();
      if (error) throw new Error(`Evolution recovery transition failed: ${error.message}`);
      if (!data) return; // Another worker made progress after our scan.
      if (action === "dead-letter") {
        report.deadLettered++;
        return;
      }
      report.reset++;
    }
    try {
      await send(event.id);
      report.dispatched++;
    } catch {
      // Keep the durable status/next_attempt_at unchanged for the next cron run.
      // Do not leak credentials or URLs into logs.
      report.failedToDispatch++;
    }
  }

  // Keep each cron invocation bounded to minimize serverless execution time.
  for (let offset = 0; offset < candidates.length; offset += concurrency) {
    await Promise.all(candidates.slice(offset, offset + concurrency).map(consume));
  }
  return report;
}
