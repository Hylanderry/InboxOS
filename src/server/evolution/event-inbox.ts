import { evolutionQueueConsumerSignature } from "./background-dispatch";
import { fetchCredentialed } from "../security/credentialed-fetch.ts";
import { decideEvolutionRecovery, MAX_EVOLUTION_ATTEMPTS } from "./recovery-policy";
import { trustedAppOrigin } from "../security/trusted-app-origin";
import { logServerError, redactLogText } from "../logging.ts";
import {
  connectionSyncPhases,
  connectionSyncPayload,
  groupParticipantSyncPayload,
} from "./connection-sync";

// Re-export to preserve the existing public API of event-inbox.
export { evolutionEventKey, sanitizeEvolutionPayload } from "./event-key.ts";

export interface EvolutionQueueMessage {
  eventId: string;
}

interface EvolutionQueueProducer {
  send: (message: EvolutionQueueMessage) => Promise<void>;
  sendBatch?: (messages: Array<{ body: EvolutionQueueMessage }>) => Promise<void>;
}

const MAX_QUEUE_ATTEMPTS = MAX_EVOLUTION_ATTEMPTS;

export async function consumeEvolutionQueueMessage(
  message: EvolutionQueueMessage,
  env: Record<string, unknown>,
  dispatch: (request: Request) => Promise<Response> = (request) => fetchCredentialed(request),
): Promise<void> {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server");
  const { data: event, error } = await supabaseAdmin
    .from("evolution_events")
    .select(
      "id,payload,status,attempts,last_error,event_type,instance_name,instance_id,workspace_id,received_at,processing_at,next_attempt_at",
    )
    .eq("id", message.eventId)
    .maybeSingle();
  if (error || !event) throw new Error("Queued Evolution event was not found");
  if (
    event.status === "completed" ||
    event.status === "dead_letter" ||
    event.status === "processing"
  )
    return;

  // A Worker pode ser interrompida por limite de CPU/subrequisições antes de
  // registrar a falha. A entrega seguinte encerra um trabalho já esgotado.
  if (event.attempts >= MAX_QUEUE_ATTEMPTS) {
    const { error: exhaustedError } = await supabaseAdmin
      .from("evolution_events")
      .update({
        status: "dead_letter",
        last_error: event.last_error || "Limite de tentativas da fila atingido",
        next_attempt_at: null,
      })
      .eq("id", event.id)
      .eq("status", event.status)
      .eq("attempts", event.attempts);
    if (exhaustedError) throw exhaustedError;
    return;
  }

  // A reentrega assinada de um evento failed não pode ignorar o backoff
  // persistido. Uma mensagem de fila duplicada pode chegar antes do cron.
  if (
    event.status === "failed" &&
    decideEvolutionRecovery({
      id: event.id,
      status: "failed",
      attempts: event.attempts,
      received_at: event.received_at,
      processing_at: event.processing_at,
      next_attempt_at: event.next_attempt_at,
    }) !== "dispatch"
  )
    return;

  const nextAttempts = event.attempts + 1;

  // Compare-and-swap: concurrent background workers may receive the same event.
  // Only the worker that atomically transitions this exact attempt to
  // `processing` is allowed to call the public handler / provider.
  let claim = supabaseAdmin
    .from("evolution_events")
    .update({
      status: "processing",
      processing_at: new Date().toISOString(),
      attempts: nextAttempts,
      last_error: null,
    })
    .eq("id", event.id)
    .eq("status", event.status)
    .eq("attempts", event.attempts);
  // The retry timestamp itself may have changed between read and claim.
  // Never claim a retry based on a stale due-date observation.
  if (event.status === "failed") {
    claim = event.next_attempt_at
      ? claim.eq("next_attempt_at", event.next_attempt_at)
      : claim.is("next_attempt_at", null);
  }
  const { data: claimed, error: claimError } = await claim.select("id").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return;

  try {
    const baseUrl = trustedAppOrigin(env as Record<string, string | undefined>);
    const { resolveManagedIntegration } = await import("../admin/integration-vault.server");
    const managed = await resolveManagedIntegration("evolution");
    if (managed.disabled) throw new Error("Evolution desativada no ADM");
    const token = String(
      managed.secrets["webhook_token"] ||
        managed.secrets["api_key"] ||
        env["EVOLUTION_WEBHOOK_TOKEN"] ||
        env["EVOLUTION_API_KEY"] ||
        "",
    );
    if (!token) throw new Error("Evolution webhook token is not configured");

    const requestBody = JSON.stringify(event.payload);
    const sentAt = String(Date.now());
    const response = await dispatch(
      new Request(`${baseUrl}/api/public/webhooks/evolution`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-webhook-token": token,
          "x-inbox-queue-consumer": "1",
          "x-inbox-event-id": event.id,
          "x-inbox-sent-at": sentAt,
          "x-inbox-internal-signature": evolutionQueueConsumerSignature(
            event.id,
            sentAt,
            requestBody,
          ),
        },
        body: requestBody,
      }),
    );

    if (!response.ok) {
      // Persist failure once in the common catch block with CAS, never overwrite
      // the outcome of a newer attempt or issue two competing status updates.
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Evolution handler HTTP ${response.status}: ${detail}`);
    }

    const eventData =
      event.payload && typeof event.payload === "object"
        ? (event.payload as { data?: { state?: unknown; connection?: unknown } }).data
        : undefined;
    const connectionState = eventData?.state ?? eventData?.connection;
    const phases =
      event.event_type === "CONNECTION_UPDATE" ? connectionSyncPhases(connectionState) : [];
    const queue = env["EVOLUTION_EVENTS_QUEUE"] as EvolutionQueueProducer | undefined;

    // A sincronização cara é persistida e distribuída em fases independentes.
    // Assim, uma falha em grupos não repete contatos já concluídos.
    if (phases.length > 0) {
      for (const phase of phases) {
        const eventKey = `connection-sync:${event.id}:${phase}`;
        const { data: inserted, error: insertError } = await supabaseAdmin
          .from("evolution_events")
          .upsert(
            {
              workspace_id: event.workspace_id,
              instance_id: event.instance_id,
              instance_name: event.instance_name,
              event_key: eventKey,
              event_type: `SYNC_${phase.toUpperCase()}`,
              payload: connectionSyncPayload(event.instance_name, phase),
              request_id: event.id,
            },
            { onConflict: "workspace_id,event_key", ignoreDuplicates: true },
          )
          .select("id,status")
          .maybeSingle();
        if (insertError) throw insertError;

        let phaseEvent = inserted;
        if (!phaseEvent) {
          const { data: existing, error: existingError } = await supabaseAdmin
            .from("evolution_events")
            .select("id,status")
            .eq("workspace_id", event.workspace_id)
            .eq("event_key", eventKey)
            .maybeSingle();
          if (existingError) throw existingError;
          phaseEvent = existing;
        }
        if (queue && phaseEvent && !["completed", "dead_letter"].includes(phaseEvent.status)) {
          await queue.send({ eventId: phaseEvent.id });
        }
      }
    }

    if (event.event_type === "SYNC_GROUPS") {
      const { data: groups, error: groupsError } = await supabaseAdmin
        .from("chats")
        .select("id,remote_jid")
        .eq("workspace_id", event.workspace_id)
        .eq("instance_name", event.instance_name)
        .eq("is_group", true)
        .eq("archived", false)
        .not("remote_jid", "is", null);
      if (groupsError) throw groupsError;

      const jobs = (groups ?? []).flatMap((group) =>
        group.remote_jid
          ? [
              {
                workspace_id: event.workspace_id,
                instance_id: event.instance_id,
                instance_name: event.instance_name,
                event_key: `group-participants:${event.id}:${group.id}`,
                event_type: "SYNC_GROUP_PARTICIPANTS",
                payload: groupParticipantSyncPayload(event.instance_name, group.remote_jid),
                request_id: event.id,
              },
            ]
          : [],
      );
      if (jobs.length > 0) {
        const { error: jobsError } = await supabaseAdmin
          .from("evolution_events")
          .upsert(jobs, { onConflict: "workspace_id,event_key", ignoreDuplicates: true });
        if (jobsError) throw jobsError;

        const { data: pendingJobs, error: pendingError } = await supabaseAdmin
          .from("evolution_events")
          .select("id,status")
          .eq("request_id", event.id)
          .eq("event_type", "SYNC_GROUP_PARTICIPANTS")
          .not("status", "in", "(completed,dead_letter)");
        if (pendingError) throw pendingError;

        for (let start = 0; queue && start < (pendingJobs ?? []).length; start += 100) {
          const batch = (pendingJobs ?? []).slice(start, start + 100);
          if (queue.sendBatch) {
            await queue.sendBatch(batch.map((job) => ({ body: { eventId: job.id } })));
          } else {
            for (const job of batch) await queue.send({ eventId: job.id });
          }
        }
      }
    }

    const { data: completion, error: completionError } = await supabaseAdmin
      .from("evolution_events")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        next_attempt_at: null,
        last_error: null,
      })
      .eq("id", event.id)
      .eq("status", "processing")
      .eq("attempts", nextAttempts)
      .select("id")
      .maybeSingle();
    if (completionError) throw completionError;
    if (!completion) throw new Error("Evolution completion CAS lost ownership");
  } catch (processingError) {
    // A queue failure (including configuration/network failures) must not
    // leave this event labelled 'processing' indefinitely. Do not overwrite
    // state from a newer worker attempt.
    const exhausted = nextAttempts >= MAX_QUEUE_ATTEMPTS;
    const detail = redactLogText(
      processingError instanceof Error ? processingError.message : "Unknown worker failure",
    );
    const { error: failureError } = await supabaseAdmin
      .from("evolution_events")
      .update({
        status: exhausted ? "dead_letter" : "failed",
        last_error: detail,
        next_attempt_at: exhausted
          ? null
          : new Date(Date.now() + 30_000 * 2 ** Math.min(nextAttempts - 1, 5)).toISOString(),
      })
      .eq("id", event.id)
      .eq("status", "processing")
      .eq("attempts", nextAttempts);
    if (failureError) {
      logServerError("[evolution-worker] could not persist failure", failureError);
      throw failureError; // Never ACK exhaustion when the DB write failed.
    }
    if (!exhausted) throw processingError;
  }
}
