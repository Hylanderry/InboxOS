import { cleanPhone, isValidPhone } from "../../lib/conversationKey.ts";
import { extractText } from "./normalize-message.ts";

/** Evolution v2 uses arrays for *_SET but can send an object for *_UPSERT/UPDATE. */
export function evolutionEventRecords(payload: unknown, arrayField?: string): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const value = payload as Record<string, unknown>;
  if (arrayField && Array.isArray(value[arrayField])) return value[arrayField];
  return [value];
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nestedValue(value: unknown, ...path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    const record = recordValue(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

const HISTORICAL_EVOLUTION_EVENTS = new Set(["MESSAGES_SET", "CHATS_SET", "MESSAGING_HISTORY_SET"]);

/** Snapshot/history events can contain conversations from before InboxOS was connected. */
export function isHistoricalEvolutionEvent(event: unknown): boolean {
  return HISTORICAL_EVOLUTION_EVENTS.has(
    String(event ?? "")
      .trim()
      .replace(/[.-]/g, "_")
      .toUpperCase(),
  );
}

function evolutionTimestampMs(rawTimestamp: unknown): number | null {
  if (rawTimestamp == null || rawTimestamp === "") return null;
  const numeric = Number(rawTimestamp);
  const value =
    Number.isFinite(numeric) && numeric > 0
      ? numeric < 1e11
        ? numeric * 1000
        : numeric
      : Date.parse(String(rawTimestamp));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Fail closed when no connection epoch exists: historical data must not leak in. */
export function isEvolutionMessageAfterConnection(
  rawTimestamp: unknown,
  connectedAt: unknown,
): boolean {
  const messageAt = evolutionTimestampMs(rawTimestamp);
  const connectionAt = connectedAt == null ? Number.NaN : Date.parse(String(connectedAt));
  return messageAt !== null && Number.isFinite(connectionAt) && messageAt >= connectionAt;
}

/** Move the message cutoff only when a disconnected instance becomes open again. */
export function nextEvolutionConnectionAt(
  previousStatus: unknown,
  nextState: unknown,
  previousConnectedAt: unknown,
  now: string,
): string | null {
  const open =
    String(nextState ?? "")
      .trim()
      .toLowerCase() === "open";
  if (!open) return null;
  const previous = String(previousConnectedAt ?? "").trim();
  if (
    String(previousStatus ?? "")
      .trim()
      .toLowerCase() === "open" &&
    previous
  )
    return previous;
  return now;
}

/** Merge only fields actually supplied by Evolution. Missing pushName, savedName,
 * phone or photo must not erase a value imported in an earlier sync. */
export function buildEvolutionContactRow(
  raw: unknown,
  workspaceId: string,
  instanceId: string,
  instanceName: string,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const remoteJid = String(c["remoteJid"] || c["id"] || "").trim();
  if (!remoteJid || remoteJid.length > 255) return null;
  const alt = String(c["remoteJidAlt"] || c["phoneNumber"] || "").trim();
  const remotePhone = cleanPhone(remoteJid);
  const altPhone = cleanPhone(alt);
  const validPhone =
    isValidPhone(altPhone) && !alt.endsWith("@lid")
      ? altPhone
      : isValidPhone(remotePhone) && !remoteJid.endsWith("@lid")
        ? remotePhone
        : "";
  const savedName = String(c["name"] || c["savedName"] || c["verifiedName"] || "").trim();
  const pushName = String(c["pushName"] || "").trim();
  const photo = String(c["profilePictureUrl"] || c["profilePicUrl"] || "").trim();
  const savedFlag =
    typeof c["isSaved"] === "boolean"
      ? c["isSaved"]
      : typeof c["isMyContact"] === "boolean"
        ? c["isMyContact"]
        : undefined;
  return {
    workspace_id: workspaceId,
    instance_id: instanceId,
    instance_name: instanceName,
    remote_jid: remoteJid,
    identity_kind: remoteJid.endsWith("@lid")
      ? "lid"
      : remoteJid.endsWith("@g.us")
        ? "group"
        : "phone",
    ...(alt ? { alternate_jid: alt } : {}),
    ...(validPhone ? { phone: validPhone } : {}),
    ...(savedName ? { saved_name: savedName } : {}),
    ...(pushName ? { push_name: pushName } : {}),
    ...(photo ? { profile_pic_url: photo } : {}),
    ...(savedFlag === undefined ? {} : { is_saved: savedFlag }),
    updated_at: new Date().toISOString(),
  };
}

export interface EvolutionEditedMessage {
  externalId: string;
  text: string;
}
export function collectEvolutionEdits(
  data: unknown,
  acceptDirectMessage = false,
): EvolutionEditedMessage[] {
  return evolutionEventRecords(data, "messages").flatMap((item) => {
    const id =
      nestedValue(item, "key", "id") ||
      nestedValue(item, "keyId") ||
      nestedValue(item, "id") ||
      nestedValue(item, "messageId");
    if (typeof id !== "string" || !id || id.length > 255) return [];
    // Baileys protocolMessage and messages.update both nest edits differently.
    // Do NOT invent the edited content if the provider sent only encryption info.
    const variants = [
      nestedValue(item, "update", "message", "editedMessage", "message"),
      nestedValue(item, "update", "message", "editedMessage"),
      nestedValue(item, "message", "editedMessage", "message"),
      nestedValue(item, "message", "editedMessage"),
      nestedValue(item, "editedMessage", "message"),
      nestedValue(item, "editedMessage"),
      nestedValue(item, "message", "protocolMessage", "editedMessage"),
      // A normal MESSAGES_UPDATE may contain message text without being an edit.
      // Only the dedicated MESSAGES_EDITED event may use a plain message as an edit.
      ...(acceptDirectMessage ? [nestedValue(item, "message")] : []),
    ];
    for (const value of variants) {
      const text = value ? extractText(value) : "";
      if (text) return [{ externalId: id, text }];
    }
    return [];
  });
}

export function collectEvolutionDeletes(data: unknown): string[] {
  return evolutionEventRecords(data, "messages").flatMap((item) => {
    const status = String(
      nestedValue(item, "status") || nestedValue(item, "update", "status") || "",
    ).toUpperCase();
    const id =
      nestedValue(item, "keyId") ||
      nestedValue(item, "key", "id") ||
      nestedValue(item, "id") ||
      nestedValue(item, "messageId");
    if (
      (status === "DELETED" || nestedValue(item, "deleted") === true) &&
      typeof id === "string" &&
      id.length > 0 &&
      id.length <= 255
    ) {
      return [id];
    }
    return [];
  });
}

/** Replay of days-old WhatsApp messages must NEVER trigger an automated answer. */
export function isFreshEvolutionInboundMessage(
  event: string,
  fromMe: boolean,
  rawTimestamp: unknown,
  now = Date.now(),
): boolean {
  if (event !== "MESSAGES_UPSERT" || fromMe) return false;
  if (rawTimestamp == null) return false;
  const time = evolutionTimestampMs(rawTimestamp);
  return time !== null && time <= now + 60_000 && time >= now - 5 * 60_000;
}
