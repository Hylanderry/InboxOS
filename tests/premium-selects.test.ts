import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const productViews = readFileSync(
  new URL("../src/features/inbox/components/ProductViews.tsx", import.meta.url),
  "utf8",
);
const select = readFileSync(new URL("../src/components/ui/select.tsx", import.meta.url), "utf8");
const systemAdmin = readFileSync(
  new URL("../src/features/inbox/components/SystemAdminView.tsx", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("../src/features/inbox/components/SettingsView.tsx", import.meta.url),
  "utf8",
);
const contextMenu = readFileSync(
  new URL("../src/components/ui/context-menu.tsx", import.meta.url),
  "utf8",
);
const menubar = readFileSync(new URL("../src/components/ui/menubar.tsx", import.meta.url), "utf8");

test("shared select uses the InboxOS icon set and exposes accessible trigger states", () => {
  assert.match(select, /from "@phosphor-icons\/react"/);
  assert.match(select, /CaretDown/);
  assert.match(select, /focus-visible:ring-2/);
  assert.match(select, /z-\[160\]/);
  assert.doesNotMatch(select, /from "lucide-react"/);
});

function walkUiSources(directory: URL): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = new URL(`./${entry.name}`, directory);
    if (entry.isDirectory()) return walkUiSources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [readFileSync(path, "utf8")] : [];
  });
}

test("shared UI primitives use Phosphor instead of a mixed icon set", () => {
  const uiSources = walkUiSources(new URL("../src/components/ui/", import.meta.url));
  const combined = uiSources.join("\n");

  assert.match(combined, /from "@phosphor-icons\/react"/);
  assert.doesNotMatch(combined, /from "lucide-react"/);
});

test("context menus and menubars share the elevated, touch-safe menu treatment", () => {
  for (const source of [contextMenu, menubar]) {
    assert.match(source, /z-\[160\]/);
    assert.match(source, /rounded-xl/);
    assert.match(source, /min-h-10/);
    assert.match(source, /shadow-xl/);
    assert.match(source, /data-\[state=open\]:animate-in/);
  }
  assert.match(menubar, /MenubarShortcut\.displayName/);
});

test("product forms use the themed select instead of native browser menus", () => {
  assert.match(productViews, /function SurfaceSelect\(/);
  assert.match(productViews, /ariaLabel="Prioridade do follow-up"/);
  assert.match(productViews, /ariaLabel="Provedor de IA"/);
  assert.match(productViews, /ariaLabel="Modelo de IA autorizado"/);
  assert.match(productViews, /ariaLabel="Tom de voz"/);
  assert.match(productViews, /ariaLabel="Modo de resposta"/);
  assert.match(productViews, /ariaLabel="Calendário do agente"/);
  assert.match(productViews, /ariaLabel="Calendário do agendamento"/);
  assert.match(productViews, /ariaLabel="Cliente do agendamento"/);
  assert.match(productViews, /ariaLabel="Agente do agendamento"/);
  assert.match(productViews, /ariaLabel=\{`Mover etapa do lead \$\{lead\.name\}`\}/);
  assert.doesNotMatch(productViews, /<select[\s\S]{0,900}aria-label="Provedor de IA"/);
});

test("agent permissions use the shared accessible checkbox instead of browser defaults", () => {
  const checkbox = readFileSync(
    new URL("../src/components/ui/checkbox.tsx", import.meta.url),
    "utf8",
  );
  assert.match(productViews, /import \{ Checkbox \} from "@\/components\/ui\/checkbox"/);
  assert.match(productViews, /id="agent-handoff-enabled"/);
  for (const id of [
    "agent-allow-groups",
    "agent-handoff-enabled",
    "agent-calendar-enabled",
    "agent-client-tags",
    "agent-follow-ups",
    "agent-knowledge-base",
  ]) {
    assert.match(productViews, new RegExp(`<Checkbox\\s+id="${id}"`));
  }
  assert.ok((productViews.match(/onCheckedChange/g) ?? []).length >= 6);
  assert.doesNotMatch(productViews, /type="checkbox"/);
  assert.match(checkbox, /h-5 w-5/);
  assert.match(checkbox, /focus-visible:ring-2/);
});

test("System Admin reuses the themed select for roles, status and newsletter controls", () => {
  assert.match(systemAdmin, /function AdminSelect\(/);
  assert.match(systemAdmin, /ariaLabel="Papel do convidado"/);
  assert.match(systemAdmin, /ariaLabel="Papel do System Admin"/);
  assert.match(systemAdmin, /ariaLabel="Status do System Admin"/);
  assert.match(systemAdmin, /ariaLabel="Segmento da newsletter"/);
  assert.doesNotMatch(systemAdmin, /<select/);
});

test("System Admin uses the shared checkbox for integration state", () => {
  assert.match(systemAdmin, /import \{ Checkbox \} from "@\/components\/ui\/checkbox"/);
  assert.match(systemAdmin, /id="integration-enabled"/);
  assert.match(systemAdmin, /id="newsletter-marketing-consent"/);
  assert.match(
    systemAdmin,
    /onCheckedChange=\{\(checked\) => setIntegrationEnabled\(checked === true\)\}/,
  );
  assert.match(
    systemAdmin,
    /onCheckedChange=\{\(checked\) => setConsentConfirmed\(checked === true\)\}/,
  );
  assert.doesNotMatch(systemAdmin, /type="checkbox"/);
});

test("settings keeps workspace and privacy choices inside the themed select", () => {
  assert.match(settings, /function ThemedSelect\(/);
  assert.match(settings, /ariaLabel="Workspace ativo"/);
  assert.match(settings, /ariaLabel="Papel do membro convidado"/);
  assert.match(settings, /ariaLabel="Importação de histórico"/);
  assert.match(settings, /ariaLabel="Ação ao desconectar o WhatsApp"/);
  assert.doesNotMatch(settings, /<select/);
});
