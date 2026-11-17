import { shouldRetryResend } from "./resend-retry-policy.ts";
import { fetchCredentialed } from "../security/credentialed-fetch";
export interface TransactionalEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  senderName?: string | null | undefined;
}

export interface TransactionalEmailResult {
  id: string | null;
  attempts: number;
}

const MAX_ATTEMPTS = 3;

function emailAddress(from: string) {
  const angle = from.match(/<\s*([^>]+)\s*>/);
  return (angle?.[1] ?? from).trim();
}

function senderFor(from: string, senderName?: string | null) {
  const address = emailAddress(from);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return from;
  const fallback = process.env["PLATFORM_BRAND_NAME"]?.trim() || "InboxOS";
  const display =
    (senderName || fallback)
      .replace(/[\r\n]/g, " ")
      .trim()
      .slice(0, 80) || fallback;
  return `${display} <${address}>`;
}

function resolveSender(managedFrom: string, environmentFrom: string, senderName?: string | null) {
  // Resend's onboarding@resend.dev sender is sandbox-only. If an old managed
  // integration still points to it, use the verified server environment sender.
  const sandboxSender = /@resend\.dev\s*>?$/i.test(emailAddress(managedFrom));
  const selected = sandboxSender ? environmentFrom || managedFrom : managedFrom || environmentFrom;
  return senderFor(selected, senderName);
}

export class ResendDeliveryError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly attempts: number,
  ) {
    super(message);
    this.name = "ResendDeliveryError";
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalEmailResult> {
  const { resolveManagedIntegration } = await import("@/server/admin/integration-vault.server");
  const managed = await resolveManagedIntegration("resend");
  if (managed.disabled) throw new Error("Integração desativada no ADM");
  const apiKey = managed.secrets["api_key"] || process.env["RESEND_API_KEY"]?.trim();
  const from = resolveSender(
    String(managed.config["from_email"] || "").trim(),
    String(process.env["RESEND_FROM_EMAIL"] || "").trim(),
    input.senderName,
  );
  if (!apiKey || !from) throw new Error("Resend server configuration is incomplete");

  let lastStatus = 0;
  let attempts = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    attempts = attempt;
    let response: Response;
    try {
      response = await fetchCredentialed("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
      });
    } catch {
      // A network timeout can be ambiguous; reuse Idempotency-Key on retry.
      // Never log the request body, recipient or provider secret.
      lastStatus = 0;
      if (!shouldRetryResend(null, attempt, MAX_ATTEMPTS)) break;
      await delay(attempt === 1 ? 250 : 750);
      continue;
    }

    lastStatus = response.status;
    if (response.ok) {
      const data = (await response.json().catch(() => ({}))) as { id?: string };
      return { id: data.id ?? null, attempts: attempt };
    }

    if (!shouldRetryResend(response.status, attempt, MAX_ATTEMPTS)) break;
    await delay(attempt === 1 ? 250 : 750);
  }

  throw new ResendDeliveryError(
    `Resend delivery failed with status ${lastStatus || "unknown"}`,
    lastStatus || null,
    attempts,
  );
}
