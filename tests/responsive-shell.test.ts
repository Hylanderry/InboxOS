import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("authenticated shell exposes scoped responsive frame hooks", () => {
  const shell = read("src/features/inbox/components/InboxShell.tsx");
  const dock = read("src/features/inbox/components/MobileDock.tsx");
  const styles = read("src/styles.css");

  assert.match(shell, /inboxos-app-shell/);
  assert.match(shell, /inboxos-workspace-frame/);
  assert.match(dock, /inboxos-mobile-dock/);
  assert.match(styles, /\.inboxos-app-shell\s*\{/);
  assert.match(styles, /\.inboxos-workspace-frame\s*\{/);
  assert.match(styles, /\.inboxos-mobile-dock\s*\{/);
});

test("mobile shell keeps navigation reachable without hiding page overflow", () => {
  const shell = read("src/features/inbox/components/InboxShell.tsx");
  const dock = read("src/features/inbox/components/MobileDock.tsx");
  const styles = read("src/styles.css");

  assert.match(shell, /showMobileDock/);
  assert.match(dock, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(dock, /aria-expanded=\{moreOpen\}/);
  assert.match(styles, /env\(safe-area-inset-bottom/);
  assert.doesNotMatch(
    styles,
    /\.inboxos-(?:app-shell|workspace-frame|mobile-dock)[^{]*\{[^}]*overflow-x:\s*hidden/i,
  );
});
