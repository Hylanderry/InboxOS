import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveAuthDatabase } from "../auth/live-auth-database";
import {
  ResendDeliveryError,
  sendTransactionalEmail,
  type TransactionalEmailInput,
} from "./resend.server";
import { redactLogText } from "../logging";

export interface AuditedEmailInput extends TransactionalEmailInput {
  eventType: string;
  templateKey: string;
  workspaceId?: string | null;
  userId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  payload?: Record<string, unknown>;
}

async function db() {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient<LiveAuthDatabase>;
}

function errorMessage(error: unknown) {
  return redactLogText(error instanceof Error ? error.message : "unknown delivery error");
}

/**
 * Transactional email boundary for InboxOS.
 *
 * Every send is first recorded as a system event and notification delivery.
 * Resend idempotency remains the final duplicate-delivery protection.
 */
export async function deliverTransactionalEmail(input: AuditedEmailInput) {
  const database = await db();
  const { data: event, error: eventError } = await database
    .from("system_events")
    .insert({
      workspace_id: input.workspaceId ?? null,
      user_id: input.userId ?? null,
      event_type: input.eventType,
      subject_type: input.subjectType ?? null,
      subject_id: input.subjectId ?? null,
      payload: {
        ...(input.payload ?? {}),
        template_key: input.templateKey,
        idempotency_key: input.idempotencyKey,
      },
    })
    .select("id")
    .single();
  if (eventError || !event) throw eventError ?? new Error("Unable to persist system event");

  const { data: delivery, error: deliveryError } = await database
    .from("notification_deliveries")
    .insert({
      event_id: event.id,
      channel: "email",
      template_key: input.templateKey,
      recipient: input.to,
      status: "pending",
      attempts: 0,
    })
    .select("id")
    .single();
  if (deliveryError || !delivery) {
    throw deliveryError ?? new Error("Unable to persist notification delivery");
  }

  try {
    const sent = await sendTransactionalEmail(input);
    const now = new Date().toISOString();
    await Promise.all([
      database
        .from("notification_deliveries")
        .update({
          status: "sent",
          provider_message_id: sent.id,
          attempts: sent.attempts,
          last_error: null,
          last_attempt_at: now,
          delivered_at: null,
        })
        .eq("id", delivery.id),
      database.from("system_events").update({ processed_at: now }).eq("id", event.id),
    ]);
    return sent;
  } catch (error) {
    await database
      .from("notification_deliveries")
      .update({
        status: "failed",
        attempts: error instanceof ResendDeliveryError ? error.attempts : 1,
        last_error: errorMessage(error),
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
    throw error;
  }
}
