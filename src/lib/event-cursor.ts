const CURSOR_PREFIX = "inbox-v1";

export function encodeEventCursor(sequence: number): string {
  const safeSequence = Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 0;
  return `${CURSOR_PREFIX}.${safeSequence.toString(36)}`;
}

export function decodeEventCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const [prefix, encoded, extra] = cursor.split(".");
  if (prefix !== CURSOR_PREFIX || !encoded || extra !== undefined || !/^[0-9a-z]+$/.test(encoded)) {
    return 0;
  }
  const sequence = Number.parseInt(encoded, 36);
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 0;
}
