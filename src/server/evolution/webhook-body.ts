/** Bounded Evolution webhook reader: hostile/oversized JSON must not exhaust
 * function memory before the event is validated and persisted. The limit is
 * below Vercel Functions' 4.5 MB request-payload ceiling.
 */
export const MAX_EVOLUTION_WEBHOOK_BYTES = 4 * 1024 * 1024;

export class EvolutionWebhookBodyTooLarge extends Error {
  constructor() {
    super("Evolution webhook payload exceeds the accepted size");
  }
}

export async function readEvolutionWebhookBody(
  request: Request,
  maxBytes = MAX_EVOLUTION_WEBHOOK_BYTES,
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError("Invalid size limit");
  const claimedSize = request.headers.get("content-length");
  if (claimedSize !== null) {
    const parsed = Number(claimedSize);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new TypeError("Invalid Content-Length");
    if (parsed > maxBytes) throw new EvolutionWebhookBodyTooLarge();
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  const chunks: string[] = [];
  let finished = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      size += value.byteLength;
      if (size > maxBytes) throw new EvolutionWebhookBodyTooLarge();
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
