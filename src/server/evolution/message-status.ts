/** Evolution sends delivery acknowledgements as either names or numeric codes.
 * Keep transitions monotonic: late callbacks must not overwrite READ/DELIVERED.
 * Database writes use the returned "previousStatuses" as an atomic SQL filter.
 */
export type EvolutionDeliveryStatus = "sent" | "delivered" | "read";

export interface EvolutionDeliveryUpdate {
  externalId: string;
  status: EvolutionDeliveryStatus;
  previousStatuses: readonly string[];
}

/**
 * Evolution has emitted message updates in three equivalent envelopes across
 * versions: the record itself, `data` as an array, and `data.messages` (or
 * `messages`) as an array. Keep the normalization here so a READ receipt is
 * never silently lost just because the provider changed its envelope shape.
 */
function deliveryEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const root = payload as Record<string, unknown>;
  const data = root["data"];
  const candidates = [
    root["messages"],
    root["updates"],
    data,
    data && typeof data === "object" ? (data as Record<string, unknown>)["messages"] : null,
    data && typeof data === "object" ? (data as Record<string, unknown>)["updates"] : null,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  // The common `{ data: { key, update } }` form is itself one record.
  if (data && typeof data === "object") return [data];
  return [root];
}

export function parseEvolutionDeliveryStatus(raw: unknown): EvolutionDeliveryStatus | null {
  const normalized = String(raw ?? "")
    .trim()
    .toUpperCase();
  switch (normalized) {
    case "2":
    case "SERVER_ACK":
    case "SENT":
      return "sent";
    case "3":
    case "DELIVERY_ACK":
    case "DELIVERED":
      return "delivered";
    case "4":
    case "5":
    case "READ":
    case "PLAYED":
      return "read";
    default:
      return null;
  }
}

export function previousDeliveryStatuses(status: EvolutionDeliveryStatus): readonly string[] {
  if (status === "read") return ["pending", "sent", "delivered"];
  if (status === "delivered") return ["pending", "sent"];
  return ["pending"];
}

export function collectEvolutionDeliveryUpdates(payload: unknown): EvolutionDeliveryUpdate[] {
  const entries = deliveryEntries(payload);
  const updates: EvolutionDeliveryUpdate[] = [];
  for (const value of entries) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const key =
      item["key"] && typeof item["key"] === "object"
        ? (item["key"] as Record<string, unknown>)
        : {};
    const inner =
      item["update"] && typeof item["update"] === "object"
        ? (item["update"] as Record<string, unknown>)
        : {};
    const rawId =
      item["keyId"] ??
      key["id"] ??
      item["id"] ??
      item["messageId"] ??
      (inner["keyId"] as unknown) ??
      (inner["id"] as unknown);
    if (typeof rawId !== "string") continue;
    const externalId = rawId.trim();
    if (!externalId || externalId.length > 255) continue;
    const status = parseEvolutionDeliveryStatus(item["status"] ?? inner["status"]);
    if (!status) continue;
    updates.push({ externalId, status, previousStatuses: previousDeliveryStatuses(status) });
  }
  return updates;
}
