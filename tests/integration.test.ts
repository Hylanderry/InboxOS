import test from "node:test";
import assert from "node:assert/strict";
import { validateSmokeTarget } from "./staging-target-policy.ts";
const BASE_URL = validateSmokeTarget(
  process.env["TEST_BASE_URL"] || "http://127.0.0.1:3000",
  process.env["PRODUCTION_APP_URL"],
  { vercelPreviewConfirmed: process.env["STAGING_VERCEL_PREVIEW_CONFIRMED"] },
);

test("APIs privadas exigem autenticação", async () => {
  for (const path of ["/api/chats/", "/api/instances/", "/api/events/"]) {
    const res = await fetch(`${BASE_URL}${path}`);
    assert.equal(res.status, 401, `${path} deve negar acesso anônimo`);
  }
});
test("mutação privada não valida payload antes da autenticação", async () => {
  const res = await fetch(`${BASE_URL}/api/messages/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 401);
});
test("workspace explícito é obrigatório após autenticação", async () => {
  const fake = "not-a-valid-supabase-token";
  const res = await fetch(`${BASE_URL}/api/chats/`, {
    headers: { Authorization: `Bearer ${fake}` },
  });
  assert.equal(res.status, 401);
});
test("webhook público Evolution continua protegido por credencial machine-to-machine", async () => {
  const res = await fetch(`${BASE_URL}/api/public/webhooks/evolution`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 401);
});

test("ADM global blocks all anonymous read access", async () => {
  const adminPaths = [
    "/api/admin/me/",
    "/api/admin/overview/",
    "/api/admin/users/",
    "/api/admin/workspaces/",
    "/api/admin/audit/",
    "/api/admin/members/",
    "/api/admin/system-admins/",
    "/api/admin/integrations/",
    "/api/admin/newsletter/",
    "/api/admin/newsletter/audience/",
  ];
  for (const path of adminPaths) {
    const response = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
    assert.equal(response.status, 401, `${path} must require a valid session`);
  }
});

test("cross-site unauthenticated mutation is denied before reaching providers", async () => {
  const response = await fetch(`${BASE_URL}/api/auth/login/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://cross-site.invalid",
      "Sec-Fetch-Site": "cross-site",
    },
    body: "{}",
    redirect: "manual",
  });
  assert.equal(response.status, 403);
});
