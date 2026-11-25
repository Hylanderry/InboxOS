import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const adminDir = "src/server/admin";
const files = readdirSync(adminDir).filter(
  (name) => name.endsWith(".server.ts") && name !== "admin-auth.server.ts",
);

test("ADM: todo handler exportado exige requireSystemAdmin", () => {
  assert.ok(files.length > 0);
  for (const name of files) {
    const source = readFileSync(`${adminDir}/${name}`, "utf8");
    const handlers = source.match(/^export async function [A-Za-z0-9_]+\(\s*request/gm) ?? [];
    const guards = source.match(/requireSystemAdmin\(|requireAdmin[A-Za-z]*\(/g) ?? [];
    assert.ok(
      guards.length >= handlers.length,
      `${name}: ${handlers.length} handlers para ${guards.length} guards`,
    );
  }
});

test("ADM: Field e Box ficam no módulo (inputs não perdem foco a cada tecla)", () => {
  const view = readFileSync("src/features/inbox/components/SystemAdminView.tsx", "utf8");
  const componentStart = view.indexOf("export function SystemAdminView(");
  assert.ok(componentStart > 0);
  const insideComponent = view.slice(componentStart);
  assert.doesNotMatch(insideComponent, /^\s+function (Field|Box)\(/m);
  assert.match(view, /^function Field\(/m);
  assert.match(view, /^function Box\(/m);
});

test("ADM: System Admin é gerenciado por e-mail, sem expor UUID na interface", () => {
  const view = readFileSync("src/features/inbox/components/SystemAdminView.tsx", "utf8");
  assert.match(view, /E-mail do usuário cadastrado/);
  assert.doesNotMatch(view, /UUID do usuário/);
  assert.doesNotMatch(view, /\{a\.user_id\} ·/);
  const server = readFileSync("src/server/admin/admin-operations.server.ts", "utf8");
  assert.match(server, /lookup_auth_user_by_email/);
  // regras de proteção continuam valendo depois de resolver o usuário
  assert.match(server, /Não é permitido remover o último superadmin ativo/);
  assert.match(server, /Não é permitido rebaixar\/suspender o próprio superadmin/);
});

test("ADM: integrações usam campos (sem JSON cru) e o catálogo de modelos pode ser salvo", () => {
  const view = readFileSync("src/features/inbox/components/SystemAdminView.tsx", "utf8");
  assert.doesNotMatch(view, /Configuração JSON/);
  assert.doesNotMatch(view, /JSON\.parse\(configJson\)/);
  assert.match(view, /Modelos liberados \(um por linha\)/);
  assert.match(view, /Segredo a rotacionar/);
  const vault = readFileSync("src/server/admin/integration-vault.server.ts", "utf8");
  // allowed_models é lista: o schema precisa aceitar arrays de strings, nos dois caminhos (POST e PATCH)
  assert.match(vault, /z\.array\(z\.string\(\)\.trim\(\)\.min\(1\)\.max\(200\)\)\.max\(100\)/);
  assert.equal((vault.match(/z\.record\(z\.string\(\), configValueSchema\)/g) ?? []).length, 2);
});
