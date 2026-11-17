import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  formatAdminMetricLabel,
  formatAdminStatusLabel,
} from "../src/features/inbox/components/admin/admin-presentation.ts";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("admin metric and status labels are readable while unknown values remain intact", () => {
  assert.equal(formatAdminMetricLabel("crmLeads"), "Leads no CRM");
  assert.equal(formatAdminMetricLabel("failedEvents"), "Eventos com falha");
  assert.equal(formatAdminMetricLabel("unknownMetric"), "unknownMetric");
  assert.equal(formatAdminStatusLabel("active"), "Ativo");
  assert.equal(formatAdminStatusLabel("unknown_state"), "unknown_state");
});

test("admin presentation is scoped and keeps existing data boundaries", () => {
  const admin = source("src/features/inbox/components/SystemAdminView.tsx");
  const route = source("src/routes/admin.tsx");
  const css = source("src/styles.css");
  assert.match(admin, /admin-control-plane/);
  assert.match(admin, /admin-control-plane__tabs/);
  assert.match(admin, /admin-control-plane__row/g);
  assert.match(admin, /formatAdminMetricLabel\(key\)/);
  assert.match(admin, /formatAdminStatusLabel\(w\.status\)/);
  assert.match(admin, /formatAdminStatusLabel\(/);
  assert.match(route, /admin-control-plane-shell/);
  assert.match(css, /\.admin-control-plane/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.admin-control-plane \.admin-control-plane__row > :last-child/);
  assert.match(admin, /\/api\/admin\//);
});
