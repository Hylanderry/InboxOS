/** Stable, tenant-scoped deduplication keys for Evolution callbacks. */
import type { Json } from "../../integrations/supabase/types";

function stripLargeBinary(value: unknown, depth = 0): unknown {
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.map((item) => stripLargeBinary(item, depth + 1));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.length > 64_000) return "[binary omitted]";
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      /base64|fileData|mediaData/i.test(key) && typeof item === "string"
        ? "[binary omitted]"
        : stripLargeBinary(item, depth + 1),
    ]),
  );
}

export function sanitizeEvolutionPayload(payload: unknown): Json {
  return stripLargeBinary(payload) as Json;
}

export async function evolutionEventKey(
  workspaceId: string,
  eventType: string,
  instanceName: string,
  payload: unknown,
): Promise<string> {
  const data =
    payload && typeof payload === "object" ? (payload as { data?: unknown }).data : undefined;
  const dataObject =
    data && typeof data === "object" ? (data as { messages?: unknown[] }) : undefined;
  const records = Array.isArray(data)
    ? data
    : Array.isArray(dataObject?.messages)
      ? dataObject.messages
      : [data];
  const stableIds = records
    .map((record: unknown) => {
      if (!record || typeof record !== "object") return undefined;
      const value = record as {
        key?: { id?: unknown };
        keyId?: unknown;
        id?: unknown;
        messageId?: unknown;
      };
      return value.key?.id || value.keyId || value.id || value.messageId;
    })
    .filter((id: unknown) => typeof id === "string" && id.length > 0);
  const fallback = JSON.stringify(sanitizeEvolutionPayload(payload));
  // Creation events can be deduplicated by their message IDs. Update events
  // cannot: the SAME message ID legitimately advances from sent -> delivered
  // -> read, and its edited/reaction/contact payload can change independently.
  const idOnlyEvents = new Set(["MESSAGES_UPSERT", "MESSAGES_SET", "SEND_MESSAGE"]);
  const identity =
    idOnlyEvents.has(eventType.toUpperCase()) && stableIds.length
      ? JSON.stringify(stableIds)
      : fallback;
  // Structured fields prevent the ambiguous `a,b` vs `a`+`b` ID collision.
  const material = JSON.stringify([workspaceId, instanceName, eventType, identity]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
