const REQUIRED_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "MESSAGES_EDITED",
  "CONTACTS_SET",
  "CONTACTS_UPSERT",
  "CONTACTS_UPDATE",
  "CHATS_UPSERT",
  "CHATS_UPDATE",
  "CHATS_DELETE",
  "GROUPS_UPSERT",
  "GROUPS_UPDATE",
  "GROUP_PARTICIPANTS_UPDATE",
  "CONNECTION_UPDATE",
  "PRESENCE_UPDATE",
] as const;

export const evolutionWebhookEvents: string[] = [
  "QRCODE_UPDATED",
  ...REQUIRED_EVENTS,
  "SEND_MESSAGE",
  "SEND_MESSAGE_UPDATE",
  "CALL",
];

export function normalizeEvolutionEvent(value?: string | null): string {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[.-]/g, "_")
    .toUpperCase();
  if (normalized === "GROUP_UPDATE") return "GROUPS_UPDATE";
  return normalized;
}

export function missingWebhookEvents(events?: unknown): string[] {
  const actual = new Set(
    (Array.isArray(events) ? events : []).map((event) => normalizeEvolutionEvent(String(event))),
  );
  return REQUIRED_EVENTS.filter((event) => !actual.has(event));
}

export function secureTokenMatches(
  provided: string | null | undefined,
  expectedTokens: Array<string | null | undefined>,
): boolean {
  const candidate = String(provided ?? "");
  if (!candidate) return false;
  let matched = false;
  for (const expectedValue of expectedTokens) {
    const expected = String(expectedValue ?? "");
    if (!expected || candidate.length !== expected.length) continue;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) {
      difference |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
    }
    matched ||= difference === 0;
  }
  return matched;
}

type StoredWebhookConfig = {
  webhook?: StoredWebhookConfig;
  headers?: Record<string, unknown>;
  events?: unknown;
  enabled?: boolean;
  url?: string;
};

export function inspectStoredWebhook(stored: unknown, expectedUrl: string, expectedSecret: string) {
  const candidate = stored && typeof stored === "object" ? (stored as StoredWebhookConfig) : {};
  const config = candidate.webhook ?? candidate;
  const headers = config?.headers && typeof config.headers === "object" ? config.headers : {};
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value ?? "")]),
  );
  const missingEvents = missingWebhookEvents(config?.events);
  const issues: string[] = [];
  if (config?.enabled !== true) issues.push("disabled");
  if (String(config?.url ?? "").replace(/\/$/, "") !== expectedUrl.replace(/\/$/, "")) {
    issues.push("url");
  }
  if (missingEvents.length > 0) issues.push("events");
  if (
    !secureTokenMatches(normalizedHeaders["apikey"] || normalizedHeaders["x-webhook-token"], [
      expectedSecret,
    ])
  ) {
    issues.push("auth");
  }
  return { valid: issues.length === 0, issues, missingEvents };
}

export function evolutionWebhookBody(url: string, secret: string, legacyGroupEvent = false) {
  const events = evolutionWebhookEvents.map((event) =>
    legacyGroupEvent && event === "GROUPS_UPDATE" ? "GROUP_UPDATE" : event,
  );
  return {
    webhook: {
      enabled: true,
      url,
      webhookByEvents: false,
      webhookBase64: true,
      byEvents: false,
      base64: true,
      // Evolution forwards `apikey` reliably. The receiver also accepts the
      // legacy x-webhook-token name for compatibility with older instances.
      headers: secret ? { apikey: secret } : {},
      events,
    },
  };
}
