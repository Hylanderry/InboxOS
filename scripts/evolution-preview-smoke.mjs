#!/usr/bin/env node
/** Explicit, permissioned synthetic Evolution webhook smoke test.
 * Default mode is dry-run; --execute only permits an isolated Vercel preview with
 * separately confirmed non-production Supabase AND disabled auto-replies.
 * Does not directly send WhatsApp messages, but inbound events can trigger agents.
 * Exit 0 confirms HTTP receipt, NOT durable processing or a live WhatsApp send.
 */
import { randomUUID } from "node:crypto";
import { validateEvolutionSmokeEnvironment } from "./lib/evolution-smoke-policy.mjs";

const execute = process.argv.includes("--execute");
const validation = execute ? validateEvolutionSmokeEnvironment(process.env) : null;
const url = validation?.url;
const instance = process.env.EVOLUTION_STAGING_INSTANCE;
const secret = process.env.EVOLUTION_STAGING_WEBHOOK_TOKEN;
const id = randomUUID();
// These IDs are synthetic. The timestamp is old, but it does NOT prevent all
// automations from reacting; execute requires auto-replies disabled in staging.
const testJid = "15550001111@s.whatsapp.net";
const messages = [
  {
    event: "CONTACTS_UPDATE",
    data: { remoteJid: testJid, pushName: "InboxOS Smoke", profilePictureUrl: "" },
  },
  { event: "CHATS_UPSERT", data: { id: testJid, name: "InboxOS Smoke" } },
  { event: "PRESENCE_UPDATE", data: { id: testJid, presence: "composing" } },
  { event: "MESSAGES_UPDATE", data: { key: { id: `smoke-nonexistent-${id}` }, status: "READ" } },
  {
    event: "MESSAGES_UPSERT",
    data: {
      key: { id: `smoke-message-${id}`, remoteJid: testJid, fromMe: false },
      messageTimestamp: Math.floor(Date.now() / 1000) - 86_400,
      message: { conversation: `Mensagem sintética de homologação ${id}` },
    },
  },
];
console.log(
  `Mode: ${execute ? "EXECUTE" : "DRY RUN"}. Synthetic events: ${messages.map((m) => m.event).join(", ")}`,
);
if (!execute) {
  console.log(
    "Dry run: zero network requests. To execute: confirm preview, isolated Supabase staging, production ref, test instance, disabled auto-replies and --execute.",
  );
  process.exit(0);
}
if (!validation?.valid || !url) {
  // Only names and generic error descriptions; no tokens, numbers or payloads.
  for (const error of validation?.errors ?? []) console.error(`BLOCKED: ${error}`);
  process.exit(2);
}
let failed = 0;
for (const message of messages) {
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(7_000),
      headers: { "content-type": "application/json", "x-webhook-token": secret },
      body: JSON.stringify({ event: message.event, instance, data: message.data }),
    });
    const ok = response.status >= 200 && response.status < 300;
    console.log(`${ok ? "PASS" : "FAIL"} ${message.event}: HTTP ${response.status}`);
    if (!ok) failed++;
  } catch (err) {
    failed++;
    console.log(`FAIL ${message.event}: ${err instanceof Error ? err.name : "request failed"}`);
  }
}
console.log(
  "NOTICE: HTTP 2xx means accepted/queued only. Verify evolution_events statuses, messages and chats in isolated staging after worker processing.",
);
process.exitCode = failed ? 1 : 0;
