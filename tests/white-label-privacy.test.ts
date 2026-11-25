import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { redactLogText, safeLogValue } from "../src/server/logging.ts";
import { safePublicError } from "../src/server/public-error.ts";

test("server logging redacts direct identifiers and credentials", () => {
  const value = redactLogText(
    "email ackley@example.com phone +55 11 99999-0000 Bearer abcdefghijklmnop token=super-secret-value",
  );
  assert.doesNotMatch(value, /ackley@example\.com/i);
  assert.doesNotMatch(value, /99999-0000/);
  assert.doesNotMatch(value, /super-secret-value/);
  assert.match(value, /\[email\]/);
  assert.match(value, /\[telefone\]/);
  assert.match(value, /\[redacted\]/);

  const structured = safeLogValue({ email: "person@example.com", token: "private-token" });
  assert.deepEqual(structured, { email: "[email]", token: "[redacted]" });
});

test("public API errors never echo database or provider details", () => {
  assert.equal(
    safePublicError({ message: "relation private.customers does not exist" }, "Falha genérica"),
    "Registro não encontrado",
  );
  assert.equal(
    safePublicError({ message: "calendar_appointment_overlap" }, "Falha genérica"),
    "Este horário já está ocupado",
  );
  assert.equal(
    safePublicError({ message: "unexpected customer phone +55 11 99999-0000" }, "Falha genérica"),
    "Falha genérica",
  );
});

test("provider and database failures stay generic at API boundaries", () => {
  const routes = [
    "../src/routes/api/messages/send.ts",
    "../src/routes/api/messages/reaction.ts",
    "../src/routes/api/sync/evolution.ts",
    "../src/routes/api/instances/index.ts",
    "../src/routes/api/chats/sync-pfp.ts",
    "../src/routes/api/chats/sync-media.ts",
    "../src/routes/api/chats/$id/read.ts",
  ];
  for (const route of routes) {
    const source = readFileSync(new URL(route, import.meta.url), "utf8");
    assert.match(source, /safePublicError|errorMessage/);
    assert.doesNotMatch(source, /error:\s*(?:\w+\.)?message\s*[,}]/);
    assert.doesNotMatch(source, /error:\s*(?:res|provider|evoResult|list)\.error\s*[,}]/);
  }
  const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.match(server, /logServerError/);
  assert.doesNotMatch(server, /console\.error\(/);
});

test("white-label migration is additive and tenant-scoped", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261018090000_white_label_privacy_controls.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /add column if not exists brand_name/i);
  assert.match(migration, /create table if not exists public\.workspace_company_profiles/i);
  assert.match(migration, /workspace_privacy_settings/i);
  assert.match(migration, /workspace_data_requests/i);
  assert.match(migration, /workspace_audit_log/i);
  assert.match(migration, /privacy-exports/i);
  assert.match(migration, /profile-media/i);
  assert.match(migration, /execute_after/i);
  assert.match(migration, /result_expires_at/i);
  assert.match(migration, /disconnect_cleanup_policy/i);
  assert.match(migration, /'purge'.*'retain'/s);
  assert.match(migration, /workspace_id uuid .*references public\.workspaces/i);
  assert.match(migration, /revoke all on table public\.%I from anon, authenticated/i);
  assert.match(migration, /revoke all on table public\.%I from anon/i);
  assert.match(migration, /whatsapp_instances.*whatsapp_presence/s);
  assert.doesNotMatch(migration, /delete from public\.legal_acceptances/i);
  assert.doesNotMatch(migration, /drop table/i);
});

test("knowledge base is tenant-scoped and service-role only", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20261019140000_workspace_knowledge_base.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /create table if not exists public\.workspace_knowledge_documents/i);
  assert.match(migration, /workspace_id uuid .*references public\.workspaces/i);
  assert.match(migration, /enable row level security/i);
  assert.match(
    migration,
    /revoke all on table public\.workspace_knowledge_documents from anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant all on table public\.workspace_knowledge_documents to service_role/i,
  );
  const route = readFileSync(
    new URL("../src/routes/api/knowledge/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /GET/);
  assert.match(route, /POST/);
  assert.match(route, /PATCH/);
  assert.match(route, /DELETE/);
  const server = readFileSync(
    new URL("../src/server/product/knowledge-base.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(server, /requirePermission\(request, "agents\.manage"\)/g);
  assert.match(server, /\.eq\("workspace_id", auth\.workspace\.id\)/g);
});

test("public platform branding is configurable without exposing a secret", () => {
  const source = readFileSync(new URL("../src/lib/platform-brand.ts", import.meta.url), "utf8");
  assert.match(source, /VITE_PLATFORM_BRAND_NAME/);
  assert.match(source, /Inbox OS/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|EVOLUTION_API_KEY|RESEND_API_KEY/);
  const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8").replace(
    /\r\n/g,
    "\n",
  );
  assert.match(env, /^VITE_PLATFORM_BRAND_NAME=Inbox OS$/m);
  const errorPage = readFileSync(new URL("../src/lib/error-page.ts", import.meta.url), "utf8");
  assert.match(errorPage, /PLATFORM_BRAND_NAME/);
  assert.match(errorPage, /replace\(\/\[&<>/);
});

test("legal consent history is tenant-scoped and service-role only", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20261018091000_legal_consent_history.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /workspace_id uuid references public\.workspaces/i);
  assert.match(migration, /legal_acceptances/i);
  assert.match(
    migration,
    /revoke all on table public\.legal_documents, public\.legal_acceptances/i,
  );
  assert.match(migration, /workspace-specific documents/i);
});

test("white-label runtime defaults seed privacy and require global Evolution identity", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261018092000_white_label_runtime_defaults.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /insert into public\.workspace_privacy_settings/i);
  assert.match(migration, /on conflict \(workspace_id\) do nothing/i);
  assert.match(migration, /ensure_workspace_privacy_defaults/i);
  assert.match(migration, /after insert on public\.workspaces/i);
  assert.match(migration, /manual_review/i);
  assert.match(migration, /group by instance_name/i);
  assert.match(migration, /whatsapp_instances_evolution_name_unique/i);
});

test("white-label integrity migration prevents duplicate active requests and domains", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261018100000_white_label_integrity_guards.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /workspace_data_requests_active_type_uidx/);
  assert.match(migration, /status in \('pending', 'processing', 'manual_review'\)/);
  assert.match(migration, /workspace_company_profiles_custom_domain_uidx/);
  assert.match(migration, /lower\(custom_domain\)/);
  assert.match(migration, /raise exception/);
});

test("branding input is validated server-side and does not accept arbitrary CSS", () => {
  const source = readFileSync(
    new URL("../src/server/auth/profile.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /accentToken/);
  assert.match(source, /neutral.*teal.*indigo.*amber/);
  assert.match(source, /customDomain/);
  assert.match(source, /Configura.*marca/);
  assert.doesNotMatch(source, /style\s*:/i);
  assert.match(source, /error\.code === "23505"/);
  assert.match(source, /getWorkspaceBranding/);
  assert.match(source, /getWorkspaceDomain/);
  assert.match(
    source,
    /getWorkspaceBranding[\s\S]{0,300}requirePermission\(request, "workspace\.read"\)/,
  );
  assert.match(
    source,
    /getWorkspaceDomain[\s\S]{0,300}requirePermission\(request, "workspace\.read"\)/,
  );
  assert.match(source, /custom_domain,custom_domain_status/);
  assert.match(source, /export async function getCompanyProfile[\s\S]{0,400}requirePermission/);
  assert.doesNotMatch(source, /getWorkspaceBranding[\s\S]{0,1200}tax_id/);
});

test("privacy endpoints require workspace permission and audit mutations", () => {
  const source = readFileSync(
    new URL("../src/server/privacy/privacy.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /requirePermission/);
  assert.match(source, /workspace\.manage/);
  assert.match(source, /workspace_audit_log/);
  assert.match(source, /privacy\.request\./);
  assert.match(source, /error\.code === "23505"/);
});

test("privacy center surfaces workspace audit activity returned by the summary", () => {
  const settings = readFileSync(
    new URL("../src/features/inbox/components/SettingsView.tsx", import.meta.url),
    "utf8",
  );
  assert.match(settings, /title="Central de privacidade"/);
  assert.match(settings, /privacyPayload\?\.settings/);
  assert.match(settings, /Array\.isArray\(consentPayload\?\.consents\)/);
  assert.match(settings, /setPrivacyAudit\(Array\.isArray\(privacyPayload\.audit\)/);
  assert.match(settings, /Atividade de privacidade/);
});

test("white-label and privacy contracts expose the planned routes", () => {
  const routes = [
    "../src/routes/api/workspaces/branding.ts",
    "../src/routes/api/workspaces/domain.ts",
    "../src/routes/api/workspaces/audit.ts",
    "../src/routes/api/company/favicon.ts",
    "../src/routes/api/company/assets.ts",
    "../src/routes/api/privacy/export.ts",
    "../src/routes/api/privacy/delete.ts",
    "../src/routes/api/privacy/export/$id.ts",
    "../src/routes/api/privacy/consents.ts",
    "../src/routes/api/legal/documents.ts",
    "../src/routes/api/cron/privacy-retention.ts",
  ];
  for (const route of routes) {
    const source = readFileSync(new URL(route, import.meta.url), "utf8");
    assert.match(source, /createFileRoute/);
  }
  const profile = readFileSync(
    new URL("../src/server/auth/profile.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(profile, /uploadCompanyFavicon/);
  assert.match(profile, /logo_light_path/);
  assert.match(profile, /logo_dark_path/);
  const shell = readFileSync(
    new URL("../src/features/inbox/components/InboxShell.tsx", import.meta.url),
    "utf8",
  );
  assert.match(shell, /api\/company\/assets/);
  assert.match(shell, /apiFetch\([\s\S]{0,180}api\/company\/assets/);
  assert.match(shell, /URL\.createObjectURL/);
  assert.match(shell, /URL\.revokeObjectURL/);
});

test("privacy worker is bounded, tenant-scoped and never exports secrets", () => {
  const worker = readFileSync(
    new URL("../src/server/privacy/worker.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(worker, /workspace_id/);
  assert.match(worker, /privacy-exports/);
  assert.match(worker, /processPrivacyQueue/);
  assert.match(worker, /password\|secret\|token/);
  assert.match(worker, /MAX_REQUESTS_PER_RUN/);
  assert.match(worker, /execute_after/);
  assert.match(worker, /execute_privacy_workspace_delete/);
  assert.match(worker, /workspace_knowledge_documents/);
  assert.doesNotMatch(worker, /from\("profiles"\)/);
  assert.match(worker, /const completionPatch/);
  assert.match(worker, /status: "manual_review"/);
  assert.doesNotMatch(worker, /update\(\{[\s\S]{0,120}\.\.\.result,[\s\S]{0,120}completed_at/);
});

test("privacy runtime repair permits manual review and keeps destructive RPC service-only", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20261019120000_privacy_runtime_repair.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /manual_review/);
  assert.match(migration, /drop constraint if exists workspace_data_requests_status_check/i);
  assert.match(migration, /create or replace function public\.execute_privacy_workspace_delete/i);
  assert.match(migration, /private\.execute_privacy_workspace_delete/);
  assert.match(migration, /current_user <> 'service_role'/);
  assert.match(migration, /revoke all on function public\.execute_privacy_workspace_delete/i);
  assert.match(
    migration,
    /grant execute on function public\.execute_privacy_workspace_delete\(uuid\) to service_role/i,
  );
  const knowledgeCleanup = readFileSync(
    new URL("../supabase/migrations/20261019150000_privacy_knowledge_cleanup.sql", import.meta.url),
    "utf8",
  );
  assert.match(knowledgeCleanup, /cleanup_deleted_workspace_knowledge/i);
  assert.match(knowledgeCleanup, /delete from public\.workspace_knowledge_documents/i);
  assert.match(knowledgeCleanup, /before update of status on public\.workspaces/i);
});

test("workspace branding is resolved in the shell and AI honors the workspace policy", () => {
  const shell = readFileSync(
    new URL("../src/features/inbox/components/InboxShell.tsx", import.meta.url),
    "utf8",
  );
  const product = readFileSync(
    new URL("../src/server/product/workspace-product.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(shell, /loadWorkspaceBranding/);
  assert.match(shell, /workspaceBrandName/);
  assert.match(product, /workspace_privacy_settings/);
  assert.match(product, /ai-disabled/);
  assert.doesNotMatch(product, /InboxOS/);
  const personalization = readFileSync(
    new URL("../src/server/product/agent-personalization.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(personalization, /aguarde o InboxOS/i);
});

test("public legal surfaces do not render the previous operator identity", () => {
  const legal = readFileSync(
    new URL("../src/features/legal/legal-documents.ts", import.meta.url),
    "utf8",
  );
  const consent = readFileSync(
    new URL("../src/features/legal/components/LegalConsentDialog.tsx", import.meta.url),
    "utf8",
  );
  assert.match(legal, /PLATFORM_LEGAL_NAME/);
  assert.match(legal, /\{\{legalName\}\}/);
  assert.match(legal, /getLegalDocument\(slug/);
  assert.doesNotMatch(consent, />Black Bird \.inc</);
});

test("workspace legal endpoints resolve tenant documents and scope consent status", () => {
  const server = readFileSync(
    new URL("../src/server/auth/legal-status.server.ts", import.meta.url),
    "utf8",
  );
  const settings = readFileSync(
    new URL("../src/features/inbox/settings-api.ts", import.meta.url),
    "utf8",
  );
  assert.match(server, /requirePermission/);
  assert.match(server, /workspace\.read/);
  assert.match(server, /workspace_id\.is\.null,workspace_id\.eq/);
  assert.match(server, /renderLegalMarkdown/);
  assert.match(settings, /apiFetch\("\/api\/legal\/status"\)/);
});

test("registration selects invited workspace legal documents before provisioning", () => {
  const registration = readFileSync(
    new URL("../src/server/auth/registration.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(registration, /workspaceId\?: string \| null/);
  assert.match(registration, /select\("id,workspace_id,email,token_hash/);
  assert.match(registration, /validatedWorkspaceId = invite\.workspace_id/);
  assert.match(registration, /const l = await legal\(db, validatedWorkspaceId\)/);
  assert.match(registration, /invitedWorkspaceId = invitation\?\.workspace_id/);
  assert.match(registration, /const l = await legal\(db, invitedWorkspaceId\)/);
  assert.match(registration, /workspace_id === workspaceId/);
});

test("Evolution client and identity mapping never use an operator-specific default", () => {
  const client = readFileSync(new URL("../src/lib/evolutionClient.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/lib/evolution.server.ts", import.meta.url), "utf8");
  const sync = readFileSync(
    new URL("../src/server/evolution/sync-engine.ts", import.meta.url),
    "utf8",
  );
  assert.match(client, /instanceName:\s*string/);
  assert.doesNotMatch(client, /Ackley|Whatsapp - Ackley/);
  assert.doesNotMatch(server, /Whatsapp - Ackley/);
  assert.doesNotMatch(sync, /pushName\s*===\s*["']Ackley["']/);
});

test("workspace permission overrides are additive, normalized and non-escalating", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261019110000_workspace_permission_overrides.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const workspace = readFileSync(
    new URL("../src/server/workspace/workspaces.server.ts", import.meta.url),
    "utf8",
  );
  const admin = readFileSync(
    new URL("../src/server/admin/admin-invitations.server.ts", import.meta.url),
    "utf8",
  );
  const settings = readFileSync(
    new URL("../src/features/inbox/settings-api.ts", import.meta.url),
    "utf8",
  );
  assert.match(migration, /add column if not exists permissions jsonb/i);
  assert.match(migration, /workspace_members_permissions_gin_idx/i);
  assert.match(migration, /jsonb_typeof\(permissions\) = 'object'/i);
  assert.match(workspace, /normalizePermissionOverrides/);
  assert.match(workspace, /action === "set_permissions"/);
  assert.match(workspace, /permissionsForRole\(role, target\.permissions\)/);
  assert.match(workspace, /roleHasPermission\(role, permission\)/);
  assert.match(admin, /permissions: z\.record/);
  assert.match(admin, /workspace\.invitation\.create/);
  assert.match(settings, /WorkspacePermissionOverrides/);
  assert.match(settings, /permissions/);
});

test("workspace permission overrides guard every protected messaging operation", () => {
  const auth = readFileSync(new URL("../src/server/middleware/auth.ts", import.meta.url), "utf8");
  assert.match(auth, /export async function requireApiPermission/);
  assert.match(
    auth,
    /roleHasPermission\(c\.workspace\.role, permission, c\.workspace\.permissions\)/,
  );

  const expected = new Map([
    ["../src/routes/api/chats/index.ts", "messages.read"],
    ["../src/routes/api/chats/$id/messages.ts", "messages.read"],
    ["../src/routes/api/chats/$id/read.ts", "messages.read"],
    ["../src/routes/api/messages/send.ts", "messages.send"],
    ["../src/routes/api/media/upload.ts", "messages.send"],
    ["../src/routes/api/company/assets.ts", "workspace.read"],
    ["../src/routes/api/instances/index.ts", "instances.read"],
    ["../src/routes/api/sync/evolution.ts", "instances.manage"],
    ["../src/routes/api/chats/$id/ai-state.ts", "agents.manage"],
  ]);
  for (const [route, permission] of expected) {
    const source = readFileSync(new URL(route, import.meta.url), "utf8");
    assert.match(
      source,
      new RegExp(`requireApiPermission\\(request,\\s*["']${permission.replace(".", "\\.")}["']`),
      route,
    );
  }
});
