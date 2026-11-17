import { fetchCredentialed } from "../security/credentialed-fetch.ts";
import { hashAuthValue, secureStringEquals } from "../auth/auth-crypto.ts";

const PURPOSE = "evolution-background-event";
const QUEUE_CONSUMER_PURPOSE = "evolution-queue-consumer-v1";
const MAX_CONSUMER_SIGNATURE_AGE_MS = 5 * 60_000;
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret() {
  const value = process.env["AUTH_CRYPTO_SECRET"]?.trim();
  if (!value || value.length < 32) throw new Error("AUTH_CRYPTO_SECRET missing");
  return value;
}

/** A short-lived signature for invoking the internal background worker.
 * A leaked signature cannot be replayed indefinitely.
 */
export function evolutionBackgroundSignature(eventId: string, sentAt: string) {
  if (!UUID_FORMAT.test(eventId) || !/^\d{13}$/.test(sentAt)) {
    throw new Error("Invalid Evolution background event or timestamp");
  }
  return hashAuthValue(secret(), PURPOSE, `${eventId}\0${sentAt}`);
}

export function verifyEvolutionBackgroundSignature(
  eventId: string,
  sentAt: string,
  signature: string,
  now = Date.now(),
) {
  if (
    !UUID_FORMAT.test(eventId) ||
    !/^\d{13}$/.test(sentAt) ||
    !/^[a-f0-9]{64}$/i.test(signature) ||
    !Number.isFinite(now) ||
    Math.abs(now - Number(sentAt)) > 15 * 60_000
  )
    return false;
  try {
    return secureStringEquals(evolutionBackgroundSignature(eventId, sentAt), signature);
  } catch {
    return false;
  }
}

/** The public Evolution webhook token is not sufficient to impersonate a queue worker.
 * Bind internal delivery to its event ID, timestamp and exact request body.
 */
export function evolutionQueueConsumerSignature(eventId: string, sentAt: string, body: string) {
  if (!UUID_FORMAT.test(eventId) || !/^\d{13}$/.test(sentAt)) {
    throw new Error("Invalid internal queue identity or timestamp");
  }
  return hashAuthValue(secret(), QUEUE_CONSUMER_PURPOSE, `${eventId}\0${sentAt}\0${body}`);
}

export function verifyEvolutionQueueConsumerRequest(
  request: Request,
  body: string,
  now = Date.now(),
) {
  if (request.headers.get("x-inbox-queue-consumer") !== "1") return false;
  const eventId = request.headers.get("x-inbox-event-id") || "";
  const sentAt = request.headers.get("x-inbox-sent-at") || "";
  const signature = request.headers.get("x-inbox-internal-signature") || "";
  if (!UUID_FORMAT.test(eventId) || !/^\d{13}$/.test(sentAt) || !/^[a-f0-9]{64}$/i.test(signature))
    return false;
  if (!Number.isFinite(now) || Math.abs(now - Number(sentAt)) > MAX_CONSUMER_SIGNATURE_AGE_MS)
    return false;
  try {
    return secureStringEquals(evolutionQueueConsumerSignature(eventId, sentAt, body), signature);
  } catch {
    return false;
  }
}

/** Invoke the portable TanStack worker route used by Vercel Functions. */
export async function invokeVercelEvolutionBackground(
  origin: string,
  eventId: string,
  signal?: AbortSignal,
) {
  const endpoint = `${origin.replace(/\/$/, "")}/api/internal/evolution-events`;
  const sentAt = String(Date.now());
  const response = await fetchCredentialed(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-inbox-background-signature": evolutionBackgroundSignature(eventId, sentAt),
      "x-inbox-background-sent-at": sentAt,
    },
    body: JSON.stringify({ eventId }),
    signal: signal ?? AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Vercel background invocation failed with ${response.status}`);
}

export function createVercelEvolutionProducer(origin: string) {
  return {
    send: ({ eventId }: { eventId: string }) =>
      invokeVercelEvolutionBackground(origin, eventId, AbortSignal.timeout(5_000)),
    sendBatch: async (messages: Array<{ body: { eventId: string } }>) => {
      for (let start = 0; start < messages.length; start += 8) {
        await Promise.all(
          messages
            .slice(start, start + 8)
            .map(({ body }) =>
              invokeVercelEvolutionBackground(origin, body.eventId, AbortSignal.timeout(5_000)),
            ),
        );
      }
    },
  };
}
