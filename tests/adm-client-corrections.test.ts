import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adminSource = readFileSync(
  new URL("../src/features/inbox/components/SystemAdminView.tsx", import.meta.url),
  "utf8",
);
const shellSource = readFileSync(
  new URL("../src/features/inbox/components/InboxShell.tsx", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(new URL("../src/routes/admin.tsx", import.meta.url), "utf8");

test("newsletter audience selection and campaign selection use independent state", () => {
  assert.match(adminSource, /\[audienceSegmentId, setAudienceSegmentId\]/);
  assert.match(adminSource, /segmentId: audienceSegmentId/);
  assert.match(adminSource, /segmentId: campaignSegment/);
});

test("admin navigation uses router transitions instead of full document reloads", () => {
  assert.match(shellSource, /useNavigate\(\)/);
  assert.match(shellSource, /navigate\(\{ to: "\/admin" \}\)/);
  assert.match(routeSource, /useNavigate\(\)/);
  assert.match(routeSource, /navigate\(\{ to: "\/", search: \{ view: "dashboard" \} \}\)/);
  assert.doesNotMatch(routeSource, /window\.location\.assign\("\/"\)/);
});

test("admin users expose a read-only customer detail action", () => {
  assert.match(adminSource, /AdminCustomerDetails/);
  assert.match(adminSource, /selectedCustomerId/);
  assert.match(adminSource, /Detalhes/);
});
