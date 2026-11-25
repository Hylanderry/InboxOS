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
