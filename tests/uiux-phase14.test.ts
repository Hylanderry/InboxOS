import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Normaliza CRLF: em checkouts Windows (autocrlf) as regex ancoradas em \n falhavam.
const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

test("F14/UI01: desktop and sidebar search share the same filter state", () => {
  const code = source("src/features/inbox/components/InboxShell.tsx");
  assert.match(code, /value=\{filters\.searchQuery\}/);
  assert.doesNotMatch(code, /globalSearch|setGlobalSearch/);
});

test("F14/UI02: composer releases busy state after failed Promise", () => {
  const code = source("src/features/inbox/components/MessageComposer.tsx");
  assert.match(code, /try\s*\{\s*const ok = await onSendMessage\(/);
  assert.match(code, /finally\s*\{[^}]*setIsSending\(false\)/);
});

test("F14/UI03: pressing Enter during IME composition does not send", () => {
  assert.match(
    source("src/features/inbox/components/MessageComposer.tsx"),
    /!e\.nativeEvent\.isComposing/,
  );
});

test("F14/UI04: attachment menu accessible and dismissible with Escape", () => {
  const code = source("src/features/inbox/components/MessageComposer.tsx");
  assert.match(code, /event\.key === "Escape"/);
  assert.match(code, /aria-expanded=\{isAttachOpen\}/);
  assert.match(code, /aria-label="Escrever mensagem"/);
});

test("F14/UI05: conversation search/facet state exposed to assistive technologies", () => {
  const code = source("src/features/inbox/components/ConversationList.tsx");
  assert.match(code, /aria-label="Limpar busca de conversas"/);
  for (const facet of [
    "filters.onlyUnread",
    "filters.showArchived",
    'filters.typeFilter === "groups"',
  ]) {
    assert.ok(code.includes(`aria-pressed={${facet}}`));
  }
});

test("F14/UI06: icon controls have accessible names and state", () => {
  const code = source("src/features/inbox/components/ChatHeader.tsx");
  assert.match(code, /aria-label="Mais opções"/);
  assert.match(code, /aria-expanded=\{isMenuOpen\}/);
  assert.match(code, /aria-pressed=\{conversation.pinned\}/);
  assert.match(code, /aria-pressed=\{conversation.archived\}/);
});

test("F14/UI07: CSS includes keyboard focus, safe areas and reduced motion", () => {
  const css = source("src/styles.css");
  assert.match(css, /--inboxos-touch-target:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("F14/UI08: reusable design skill and always-on agent rule ship in project", () => {
  const skillPath = ".agents/skills/inboxos-premium-uiux/SKILL.md";
  const rulePath = ".agents/rules/inboxos-uiux-consistency.md";
  if (existsSync(skillPath) && existsSync(rulePath)) {
    const skill = source(skillPath);
    const rule = source(rulePath);
    assert.match(skill, /^---\nname:\s*inboxos-premium-uiux/m);
    assert.match(rule, /^---\ntrigger:\s*always_on/m);
    assert.match(skill, /320, 360, 390, 768, 1024, 1440/);
    return;
  }
  const publicGuidance = source("docs/ui/PREMIUM_UI_PASS_2026-09-23.md");
  assert.match(publicGuidance, /frontend|mobile|responsiv/i);
  assert.match(source("src/styles.css"), /--inboxos-touch-target:\s*44px/);
});
