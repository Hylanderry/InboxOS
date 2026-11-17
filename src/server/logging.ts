/**
 * Server-side logging helpers.
 *
 * Logs are an operational aid, not a second data store.  Keep provider
 * errors useful for diagnostics while removing direct identifiers, tokens and
 * message-sized payloads before they reach a platform log collector.
 */

const MAX_TEXT_LENGTH = 320;
const MAX_DEPTH = 4;

export function redactLogText(value: string): string {
  return value
    .replace(/data:[^\s,;]+(?:;base64)?,[^\s]+/gi, "[media]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "Bearer [token]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g, "[jwt]")
    .replace(
      /\b(?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|password|senha|authorization)\s*[:=]\s*[^\s,;]+/gi,
      (match) => `${match.slice(0, match.search(/[:=]/))}: [redacted]`,
    )
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[cpf]")
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, "[cnpj]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(
      /(?:\+\d[\d\s().-]{7,}\d|\(\d{2}\)\s?9?\s?\d{4,5}[-\s]?\d{4}|\b\d{10,14}\b)/g,
      "[telefone]",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return redactLogText(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;
  if (typeof value !== "object") return "[unknown]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (value instanceof Error) {
    const result: Record<string, unknown> = {
      name: value.name,
      message: redactLogText(value.message),
    };
    const errorWithCode = value as Error & { code?: unknown; status?: unknown };
    if (typeof errorWithCode["code"] === "string" || typeof errorWithCode["code"] === "number") {
      result["code"] = errorWithCode["code"];
    }
    if (typeof errorWithCode["status"] === "number") result["status"] = errorWithCode["status"];
    return result;
  }

  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => redactValue(item, depth + 1, seen));

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
    if (
      /authorization|cookie|token|secret|password|senha|api[_-]?key|service[_-]?role|access[_-]?key/i.test(
        key,
      )
    ) {
      result[key] = "[redacted]";
      continue;
    }
    result[key] = redactValue(entry, depth + 1, seen);
  }
  return result;
}

export function safeLogValue(value: unknown): unknown {
  return redactValue(value, 0, new WeakSet<object>());
}

export function safeError(error: unknown): Record<string, unknown> {
  const result = safeLogValue(error);
  return result && typeof result === "object" && !Array.isArray(result)
    ? (result as Record<string, unknown>)
    : { message: redactLogText(String(error)) };
}

export function logServerError(scope: string, error: unknown, metadata?: unknown): void {
  const entry: Record<string, unknown> = { error: safeError(error) };
  if (metadata !== undefined) entry["meta"] = safeLogValue(metadata);
  console.error(scope, entry);
}

export function logServerWarning(scope: string, metadata?: unknown): void {
  console.warn(scope, metadata === undefined ? undefined : safeLogValue(metadata));
}
