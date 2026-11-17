import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(
  new URL("../src/server/product/calendar-clients.server.ts", import.meta.url),
  "utf8",
);
const routes = [
  readFileSync(new URL("../src/routes/api/calendar/index.ts", import.meta.url), "utf8"),
  readFileSync(new URL("../src/routes/api/calendar/appointments.ts", import.meta.url), "utf8"),
  readFileSync(new URL("../src/routes/api/clients/index.ts", import.meta.url), "utf8"),
].join("\n");
const sync = readFileSync(
  new URL("../src/server/product/crm-contact-sync.server.ts", import.meta.url),
  "utf8",
);
const presence = readFileSync(new URL("../src/lib/evolution.server.ts", import.meta.url), "utf8");
const runtime = readFileSync(
  new URL("../src/server/product/workspace-product.server.ts", import.meta.url),
  "utf8",
);

test("calendar and client APIs expose explicit network handlers", () => {
  assert.match(routes, /GET:/);
  assert.match(routes, /POST:/);
  assert.match(routes, /PATCH:/);
  assert.match(routes, /DELETE:/);
  assert.match(server, /requirePermission\(request, "crm\.read"\)/);
  assert.match(server, /requirePermission\(request, "crm\.manage"\)/);
  assert.match(server, /\[calendar\] list failed/);
  assert.match(server, /\[calendar\] appointment mutation failed/);
  assert.match(server, /\[clients\] list failed/);
  assert.match(server, /\[clients\] bulk tag assignment failed/);
});

test("new writes always carry workspace scope and fail closed", () => {
  assert.ok((server.match(/\.eq\("workspace_id", auth\.workspace\.id\)/g) ?? []).length >= 10);
  assert.match(server, /if \(!calendar\) throw new Error/);
  assert.match(
    server,
    /Cliente ou tag nÃ£o pertence ao workspace|Cliente ou tag não pertence ao workspace/,
  );
  assert.match(sync, /\.eq\("workspace_id", workspaceId\)/g);
  assert.match(
    sync,
    /\.eq\("workspace_id", workspaceId\)[\s\S]*?\.eq\("instance_name", options\.instanceName\)/,
  );
  assert.match(server, /Calendário não pertence ao workspace/);
});

test("presence lookup can be scoped to the authenticated workspace", () => {
  assert.match(presence, /workspaceId\?: string/);
  assert.match(
    presence,
    /if \(workspaceId\) contactQuery = contactQuery\.eq\("workspace_id", workspaceId\)/,
  );
});

test("contact sync repairs fallback phone names without overwriting operator names", () => {
  assert.match(sync, /Atualiza somente nomes que eram fallback numérico/);
  assert.match(sync, /existingLead\.name\.trim\(\) === phoneE164\(phone\)/);
  assert.match(sync, /\.update\(\{ name: displayName \}\)/);
});

test("migration includes RLS, idempotent realtime registration and overlap guard", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261013143000_calendar_clients_agent_context.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /prevent_calendar_appointment_overlap/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /pg_publication_tables/);
});

test("calendar and CRM mutations emit scoped panel events", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261013160000_calendar_clients_realtime_events.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const trigger of [
    "emit_calendar_calendars_event",
    "emit_calendar_appointments_event",
    "emit_crm_leads_event",
    "emit_crm_lead_tags_event",
    "emit_crm_tags_event",
  ]) {
    assert.match(migration, new RegExp(trigger));
  }
  assert.match(migration, /emit_inbox_event/);
});

test("client search can skip an expensive Evolution sync", () => {
  assert.match(server, /searchParams\.get\("sync"\).*!==\s*"0"/);
  const api = readFileSync(
    new URL("../src/features/inbox/workspace-product-api.ts", import.meta.url),
    "utf8",
  );
  assert.match(api, /loadClients = \(query = "", options/);
  assert.match(api, /options\.sync\s*\?\s*"1"\s*:\s*"0"/);
});

test("client sync recognizes an older schema without is_saved and can use the compatibility path", () => {
  assert.match(sync, /export function isMissingSavedContactColumnError/);
  assert.match(sync, /code.*42703/);
  assert.match(sync, /is_saved/);
  assert.match(sync, /saved_name/);
});

test("automatic calendar directives are permissioned, sanitized and logged on failure", () => {
  assert.match(runtime, /extractCalendarDirective\(result\.text\)/);
  assert.match(runtime, /applyAgentCalendarDirective\(/);
  assert.match(runtime, /\[agent-calendar\] directive failed/);
  assert.match(
    runtime,
    /NÃ£o consegui concluir essa alteraÃ§Ã£o de agenda agora|Não consegui concluir essa alteração de agenda agora/,
  );
});

test("automatic agent fallback messages preserve UTF-8 Portuguese text", () => {
  assert.doesNotMatch(runtime, /NÃ£o consegui|alteraÃ§Ã£o|automÃ¡tica/);
  assert.match(runtime, /Não consegui concluir essa alteração de agenda agora/);
  assert.match(runtime, /Resposta automática vazia após normalização/);
});
