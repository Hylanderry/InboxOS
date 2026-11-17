import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve, join } from "node:path";
import { sealSecret, openSecret } from "../src/server/admin/vault-crypto.ts";
import { renderNewsletter } from "../src/server/admin/newsletter-render.ts";

const root = resolve(import.meta.dirname, "../src");
function source(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}
function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory()
      ? routes(p)
      : /\.(ts|tsx)$/.test(p) && n !== "__root.tsx"
        ? [p]
        : [];
  });
}

test("vault AES-256-GCM roundtrip, wrong key, IV rotation and tamper resistance", () => {
  const before = process.env.INTEGRATION_VAULT_KEY;
  try {
    process.env.INTEGRATION_VAULT_KEY = randomBytes(32).toString("base64");
    const a = sealSecret("super-secret-example-123456");
    const b = sealSecret("super-secret-example-123456");
    assert.equal(openSecret(a), "super-secret-example-123456");
    assert.notEqual(a.ciphertext, b.ciphertext);
    assert.notEqual(a.iv, b.iv);
    assert.throws(() => openSecret({ ...a, auth_tag: randomBytes(16).toString("base64") }));
    process.env.INTEGRATION_VAULT_KEY = randomBytes(32).toString("base64");
    assert.throws(() => openSecret(a));
  } finally {
    if (before === undefined) delete process.env.INTEGRATION_VAULT_KEY;
    else process.env.INTEGRATION_VAULT_KEY = before;
  }
});

test("newsletter renderer escapes untrusted text and links a video thumbnail", () => {
  const html = renderNewsletter([
    { type: "heading", text: "<script>alert(1)</script>" },
    { type: "paragraph", text: "Oferta & segurança" },
    {
      type: "video",
      href: "https://example.com/watch",
      thumbnail: "https://example.com/cover.jpg",
      title: "Ver vídeo",
    },
  ]);
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<video"));
  assert.ok(html.includes("https://example.com/cover.jpg"));
  assert.ok(html.includes("{{{RESEND_UNSUBSCRIBE_URL}}}"));
});

test("Billing is OFF by default at server and UI, protected against accidental enable", () => {
  assert.match(source("server/product/billing-flag.ts"), /===\s*["']true["']/);
  assert.match(source("features/inbox/billing-flag.ts"), /===\s*["']true["']/);
  assert.match(source("routes/api/billing/index.ts"), /billingServerEnabled\(\).*404/s);
  assert.match(source("features/inbox/components/SettingsView.tsx"), /billingUiEnabled &&/);
});

test("every createFileRoute source exists in generated tree; admin HTTP routes use server handlers", () => {
  const tree = source("routeTree.gen.ts");
  const paths = routes(join(root, "routes"));
  assert.equal((tree.match(/RouteImport\.update\(/g) || []).length, paths.length);
  for (const path of paths) {
    const code = readFileSync(path, "utf8"),
      route = code.match(/createFileRoute\(\s*["'`]([^"'`]+)["'`]\s*\)/)?.[1];
    assert.ok(route, `missing createFileRoute: ${path}`);
    assert.ok(tree.includes(`'${route}'`), `not in route tree: ${route}`);
  }
  const adminPaths = routes(join(root, "routes/api/admin"));
  assert.ok(adminPaths.length >= 12);
  for (const path of adminPaths) {
    const code = readFileSync(path, "utf8");
    assert.match(code, /server:\s*\{\s*handlers:/);
    assert.match(code, /@\/server\/admin\//);
  }
});

test("global roles, suspension and audit boundaries are enforced on server", () => {
  const auth = source("server/admin/admin-auth.server.ts");
  assert.match(auth, /requireAuth\(request\)/);
  assert.match(auth, /system_admins/);
  assert.match(auth, /claim_system_admin_bootstrap/);
  assert.match(auth, /eligibleBootstrapIdentity/);
  assert.match(auth, /system_admin_audit_log/);
  const middleware = source("server/middleware/auth.ts");
  assert.match(middleware, /system_user_controls/);
  assert.match(middleware, /workspace inativo/);
  assert.match(source("server/auth/login.server.ts"), /isGloballySuspended/);
  assert.match(source("server/admin/admin-operations.server.ts"), /último owner ativo/);
});

test("integration secrets never appear in GET projection, and newsletter only sends on explicit confirmation", () => {
  const vault = source("server/admin/integration-vault.server.ts");
  assert.match(vault, /masked_hint,version,rotated_at/);
  assert.match(vault, /ciphertext,iv,auth_tag/); // decrypted only on trusted server
  assert.match(vault, /INTEGRATION_VAULT_KEY/);
  assert.match(vault, /safeExternalHttps/);
  const newsletter = source("server/admin/newsletter.server.ts");
  assert.match(newsletter, /ENVIAR NEWSLETTER/);
  assert.match(newsletter, /\.eq\(\s*"status"\s*,\s*"draft"\s*\)/);
  assert.match(newsletter, /resend_broadcast_id/);
  assert.match(source("server/admin/admin-newsletter-audience.server.ts"), /consentConfirmed/);
});

test("OpenRouter remains administrator-controlled and never exposes its key to a workspace", () => {
  const vault = source("server/admin/integration-vault.server.ts");
  const agents = source("server/product/workspace-product.server.ts");
  const view = source("features/inbox/components/SystemAdminView.tsx");
  assert.match(
    vault,
    /provider: z\.enum\(\["evolution", "groq", "openrouter", "resend", "custom"\]\)/,
  );
  assert.match(vault, /OPENROUTER_API_KEY/);
  assert.match(agents, /allowed_models/);
  assert.match(agents, /validateAiSelection/);
  assert.match(view, /catálogo fica sob controle do administrador/i);
});

test("global invitations and System Admin management remain wired end-to-end", () => {
  const view = source("features/inbox/components/SystemAdminView.tsx");
  assert.match(view, /call\(\s*["']invitations\/["']\s*,\s*["']POST["']/);
  assert.match(view, /call\(\s*["']invitations\/["']\s*,\s*["']PATCH["']/);
  assert.match(view, /call\(\s*["']system-admins\/["']\s*,\s*["']POST["']/);
  assert.match(view, /role\s*===\s*["']superadmin["']/);
  assert.match(
    source("server/admin/admin-invitations.server.ts"),
    /PUBLIC_APP_URL HTTPS não configurada/,
  );
  assert.match(source("server/admin/admin-operations.server.ts"), /último superadmin ativo/);
  assert.match(source("server/admin/admin-auth.server.ts"), /if \(!row && process.env/);
});

test("System Admin UI is isolated behind a dedicated route", () => {
  const adminRoute = source("routes/admin.tsx");
  const inboxShell = source("features/inbox/components/InboxShell.tsx");
  assert.match(adminRoute, /createFileRoute\(["']\/admin["']\)/);
  assert.match(adminRoute, /api\/admin\/me/);
  assert.match(adminRoute, /status\s*===\s*["']denied["']/);
  assert.match(inboxShell, /useNavigate\(\)/);
  assert.match(inboxShell, /navigate\(\{ to: ["']\/admin["'] \}\)/);
  assert.doesNotMatch(inboxShell, /import\s+\{\s*SystemAdminView/);
});

test("Evolution webhook validates only managed rotating token, not legacy ENV-only validator", () => {
  const lib = source("lib/evolution.server.ts");
  const route = source("routes/api/public/webhooks/evolution.ts");
  assert.match(lib, /isValidManagedWebhookRequest/);
  assert.match(lib, /managed\.secrets\[["']webhook_token["']\]/);
  assert.doesNotMatch(lib, /export function isValidWebhookRequest\(/);
  assert.match(route, /await isValidManagedWebhookRequest\(request\)/);
});
