import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getEvolutionDeliveryDiagnostics } from "../src/server/health-diagnostics.ts";

const request = () => new Request("https://inboxos.example/api/health?detailed=true");

test("local health does not falsely claim queue or recovery is configured", () => {
  assert.deepEqual(getEvolutionDeliveryDiagnostics(request(), {}), {
    queueConfigured: false,
    deliveryMode: "inline",
    recoveryEnabled: false,
  });
});

test("Vercel delivery ignores an unexpected runtime queue object", () => {
  const req = request() as Request & { runtime?: unknown };
  req.runtime = { queue: { send() {} } };
  assert.deepEqual(getEvolutionDeliveryDiagnostics(req, { VERCEL: "1" }), {
    queueConfigured: false,
    deliveryMode: "vercel-background",
    recoveryEnabled: false,
  });
});

test("Vercel reports its authenticated background worker instead of inline processing", () => {
  assert.deepEqual(
    getEvolutionDeliveryDiagnostics(request(), {
      VERCEL: "1",
      ENABLE_EVOLUTION_RECOVERY: "true",
    }),
    { queueConfigured: false, deliveryMode: "vercel-background", recoveryEnabled: true },
  );
  const route = readFileSync(
    new URL("../src/routes/api/internal/evolution-events.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /waitUntil/);
  assert.match(route, /verifyEvolutionBackgroundSignature/);
  assert.match(route, /consumeEvolutionQueueMessage/);
  assert.equal(
    getEvolutionDeliveryDiagnostics(request(), {
      VERCEL: "1",
      CONTEXT: "production",
      ENABLE_EVOLUTION_RECOVERY: "true",
    }).deliveryMode,
    "vercel-background",
  );
});

test("authenticated health uses the diagnostic function, not a hardcoded queue result", () => {
  const source = readFileSync(new URL("../src/routes/api/health.ts", import.meta.url), "utf8");
  assert.match(source, /\.\.\.getEvolutionDeliveryDiagnostics\(request, process\.env\)/);
  assert.doesNotMatch(source, /queueConfigured:\s*true/);
});

test("health route checks the Evolution runtime schema columns", () => {
  const source = readFileSync(new URL("../src/routes/api/health.ts", import.meta.url), "utf8");
  assert.match(source, /select\("id,status,connected_at"/);
  assert.match(source, /select\("id,instance_id,identity_kind"/);
  assert.match(source, /select\("id,runtime_config"/);
  assert.match(source, /schemaDrift/);
  assert.match(source, /schema: "outdated"/);
});

test("health route checks the auth control-plane schema before claiming healthy", () => {
  const source = readFileSync(new URL("../src/routes/api/health.ts", import.meta.url), "utf8");
  assert.match(source, /from\("user_devices"\)/);
  assert.match(source, /from\("system_user_controls"\)/);
  assert.match(source, /from\("user_sessions"\)/);
  assert.match(source, /from\("email_challenges"\)/);
  assert.match(source, /from\("security_events"\)/);
  assert.match(source, /from\("system_events"\)/);
  assert.match(source, /from\("notification_deliveries"\)/);
  assert.match(source, /from\("pending_registrations"\)/);
  assert.match(source, /from\("legal_documents"\)/);
  assert.match(source, /authControlSchema\.error/);
  assert.match(source, /authSessionSchema\.error/);
  assert.match(source, /authChallengeSchema\.error/);
});

test("health route checks the workspace knowledge schema before claiming healthy", () => {
  const source = readFileSync(new URL("../src/routes/api/health.ts", import.meta.url), "utf8");
  assert.match(source, /workspace_knowledge_documents/);
  assert.match(source, /knowledgeBaseSchema\.error/);
});

test("health route is not publicly enumerable", () => {
  const source = readFileSync(new URL("../src/routes/api/health.ts", import.meta.url), "utf8");
  assert.match(source, /HEALTHCHECK_SECRET/);
  assert.match(source, /x-healthcheck-secret/);
  assert.match(source, /Not found/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /!detailed && !healthSecret/);
  assert.match(source, /if \(!healthSecret\)/);
  assert.match(
    source,
    /requireApiPermission\(request,\s*["']workspace\.read["']\s*,\s*["']admin["']\)/,
  );
  assert.match(source, /status: "ok"/);
});

test("instance listing removes disconnected accounts from the product", () => {
  const source = readFileSync(
    new URL("../src/routes/api/instances/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /storedState[\s\S]{0,180}connecting/);
  assert.match(source, /isProviderDisconnectedState\(state\)/);
  assert.match(source, /purgeInstanceData\(supabaseAdmin/);
  const ui = readFileSync(
    new URL("../src/features/instances/components/ConnectionManager.tsx", import.meta.url),
    "utf8",
  );
  assert.match(ui, /instances\.filter\(\(instance\) => instance\.state !== "disconnected"\)/);
});
