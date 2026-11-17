import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("admin tabs keep keyboard navigation and panel relationships", () => {
  const admin = source("src/features/inbox/components/SystemAdminView.tsx");
  assert.match(admin, /role="tablist"/);
  assert.match(admin, /role="tab"/);
  assert.match(admin, /aria-selected=\{tab === x\.id\}/);
  assert.match(admin, /event\.key === "ArrowRight"/);
  assert.match(admin, /event\.key === "Home"/);
  assert.match(admin, /data-admin-tab=\{x\.id\}/);
  assert.match(admin, /id="admin-panel-users"[\s\S]{0,160}aria-labelledby="admin-tab-users"/);
  assert.match(admin, /role="tabpanel" aria-labelledby="admin-tab-audit"/);
});

test("admin users and workspaces expose bounded pagination and local filters", () => {
  const admin = source("src/features/inbox/components/SystemAdminView.tsx");
  assert.match(admin, /usersPage/);
  assert.match(admin, /workspacesPage/);
  assert.match(admin, /userFilter/);
  assert.match(admin, /workspaceFilter/);
  assert.match(admin, /page=\$\{usersPage\}/);
  assert.match(admin, /page=\$\{workspacesPage\}/);
  assert.match(admin, /hasMore/);
  assert.match(admin, /Filtrar esta p/);
});
