import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WORKSPACE_ROLE_LABELS,
  canManageWorkspaceRole,
  isWorkspaceRole,
} from "../src/lib/workspace-roles.ts";
import { roleHasPermission } from "../src/server/middleware/auth-policy.ts";

test("workspace staff roles have explicit non-escalating capabilities", () => {
  assert.equal(isWorkspaceRole("manager"), true);
  assert.equal(isWorkspaceRole("support"), true);
  assert.equal(isWorkspaceRole("analyst"), true);
  assert.equal(isWorkspaceRole("superadmin"), false);
  assert.equal(WORKSPACE_ROLE_LABELS.manager, "Gerente");

  assert.equal(roleHasPermission("manager", "members.manage"), true);
  assert.equal(roleHasPermission("manager", "billing.manage"), false);
  assert.equal(roleHasPermission("support", "messages.send"), true);
  assert.equal(roleHasPermission("support", "agents.manage"), false);
  assert.equal(roleHasPermission("analyst", "messages.send"), false);
  assert.equal(roleHasPermission("analyst", "crm.read"), true);
  assert.equal(roleHasPermission("manager", "crm.manage", { "crm.manage": false }), false);
  assert.equal(roleHasPermission("analyst", "crm.manage", { "crm.manage": true }), false);
});

test("workspace staff management is strictly down the role hierarchy", () => {
  assert.equal(canManageWorkspaceRole("owner", "admin"), true);
  assert.equal(canManageWorkspaceRole("owner", "owner"), false);
  assert.equal(canManageWorkspaceRole("admin", "manager"), true);
  assert.equal(canManageWorkspaceRole("admin", "admin"), false);
  assert.equal(canManageWorkspaceRole("manager", "support"), true);
  assert.equal(canManageWorkspaceRole("manager", "manager"), false);
  assert.equal(canManageWorkspaceRole("support", "agent"), false);
});

test("role migration keeps invitation permissions and extends both role constraints", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20261021164403_workspace_staff_roles.sql", import.meta.url),
    "utf8",
  );
  const workspace = readFileSync(
    new URL("../src/server/workspace/workspaces.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(migration, /workspace_members_role_check/);
  assert.match(migration, /workspace_invitations_role_check/);
  assert.match(migration, /'manager', 'support', 'analyst'/);
  assert.match(migration, /v_permissions jsonb := '\{\}'::jsonb/);
  assert.match(migration, /permissions = excluded\.permissions/);
  assert.match(workspace, /canManageWorkspaceRole\(ctx\.workspace\.role, target\.role\)/);
  assert.match(workspace, /canManageWorkspaceRole\(ctx\.workspace\.role, role\)/);
  assert.match(workspace, /WORKSPACE_ROLE_LABELS\[role\]/);
});
