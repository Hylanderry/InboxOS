export interface CompositeCursor {
  timestamp: string;
  id: string;
  pinned?: boolean;
}

export function encodeCompositeCursor(prefix: "chat" | "message", value: CompositeCursor): string {
  return [
    `${prefix}-v1`,
    value.pinned === undefined ? "" : value.pinned ? "1" : "0",
    value.timestamp,
    value.id,
  ].join("|");
}

export function decodeCompositeCursor(
  prefix: "chat" | "message",
  cursor: string | null | undefined,
): CompositeCursor | null {
  if (!cursor) return null;
  const [version, pinned, timestamp, id, extra] = cursor.split("|");
  if (version !== `${prefix}-v1` || !timestamp || !id || extra !== undefined) return null;
  if (Number.isNaN(Date.parse(timestamp)) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { timestamp, id, ...(pinned === "" ? {} : { pinned: pinned === "1" }) };
}
