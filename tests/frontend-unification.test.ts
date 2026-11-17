import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared UI alignment layer provides responsive surfaces and reduced-motion fallbacks", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.inboxos-page\s*\{/);
  assert.match(css, /\.inboxos-surface\s*\{/);
  assert.match(css, /\.inboxos-action\s*\{/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
  assert.match(read("src/components/ui/button.tsx"), /inboxos-action/);
  assert.match(read("src/components/ui/input.tsx"), /inboxos-field/);
  assert.match(read("src/components/ui/card.tsx"), /inboxos-surface/);
});

test("newsletter editor includes a safe structural preview", () => {
  const admin = read("src/features/inbox/components/SystemAdminView.tsx");
  const preview = read("src/features/inbox/components/admin/NewsletterPreview.tsx");
  assert.match(admin, /NewsletterPreview/);
  assert.match(preview, /aria-label="Prévia aproximada do e-mail"/);
  assert.doesNotMatch(preview, /dangerouslySetInnerHTML/);
});

test("workspace views use validated URL search state", async () => {
  const navigation = await import("../src/features/inbox/navigation.ts");
  assert.equal(navigation.isWorkspaceView("clientes"), true);
  assert.equal(navigation.isWorkspaceView("admin"), false);
  assert.equal(navigation.isWorkspaceView("invalid"), false);
  assert.match(read("src/routes/index.tsx"), /validateSearch/);
  assert.match(
    read("src/features/inbox/components/InboxShell.tsx"),
    /useSearch\(\{ from: "\/" \}\)/,
  );
});
