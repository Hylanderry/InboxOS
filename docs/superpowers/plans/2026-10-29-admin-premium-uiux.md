# Administração global premium UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a administração global mais clara, premium, responsiva e suave sem alterar identidade visual, autenticação, rotas, dados ou permissões.

**Architecture:** A rota `/admin` continua montando `SystemAdminView`; a apresentação ganha um módulo puro para nomes de métricas/estados e classes CSS com escopo exclusivo `admin-control-plane`. A lógica de busca, handlers, chamadas `/api/admin/*`, estado React e papéis permanecem intocados.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, CSS custom properties Trax, TanStack Router, Node test runner e Playwright CLI.

**Spec:** `docs/superpowers/specs/2026-10-29-admin-premium-uiux-design.md`

## Global Constraints

- Manter tipografia, paleta Trax, ícones Phosphor, off-white `#f6f6f4` e black-hole `#080809`.
- Reutilizar tokens e vidro existentes; sem roxo, azul/navy, gradientes decorativos, neon ou segunda identidade visual.
- Nenhuma alteração em API, autenticação/OTP, rotas, dados, permissões, newsletter, segredos, banco ou lógica de negócios.
- Todo CSS novo deve começar em `.admin-control-plane` ou `.admin-control-plane-shell`; não usar `!important` nem reset global.
- Cada mudança segue RED → GREEN → revisão → browser antes/depois. Uma falha bloqueia a próxima fatia.
- Nenhum comando mutante é executado em dados reais; ações administrativas no browser permanecem somente leitura nesta tarefa.

## Review Focus

- Abas a 320px devem continuar alcançáveis por rolagem horizontal interna e teclado, sem overflow da página.
- Valores longos (UUID, e-mail, slug e segredo mascarado) não podem romper card, esconder ação ou reduzir o alvo de toque.
- Formulários devem conservar payload, `disabled`, loading, erro e sucesso ao receber estilos novos.
- Tema escuro deve manter o mesmo preto neutro e contraste legível, sem criar azul ou transparência que prejudique leitura.
- Login → OTP → dashboard → `/admin` precisa manter navegação e dados funcionando após qualquer CSS compartilhado.

---

### Task 1: Criar contratos de apresentação administrativa

**Files:**
- Create: `src/features/inbox/components/admin/admin-presentation.ts`
- Create: `tests/admin-presentation.test.ts`
- Modify: `src/features/inbox/components/SystemAdminView.tsx:22-108, 470-490, 590-630`

**Interfaces:**
- Produces: `formatAdminMetricLabel(metric: string): string` e `formatAdminStatusLabel(status: string): string`.
- Consumes: chaves e status retornados sem transformação por `AdminData`.

- [ ] **Step 1: Write failing tests**

```ts
assert.equal(formatAdminMetricLabel("crmLeads"), "Leads no CRM");
assert.equal(formatAdminMetricLabel("failedEvents"), "Eventos com falha");
assert.equal(formatAdminStatusLabel("active"), "Ativo");
assert.equal(formatAdminStatusLabel("unknown_state"), "unknown_state");
```

- [ ] **Step 2: Run the new test to verify RED**

Run: `node --experimental-strip-types --test tests/admin-presentation.test.ts`

Expected: FAIL because the presentation module does not exist.

- [ ] **Step 3: Implement the two pure formatters and consume them only at render boundaries**

Map the five observed overview keys and known active/suspended/disabled status values; leave unknown values unchanged. Do not reshape `AdminData`, request bodies, filters or `call()`.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `node --experimental-strip-types --test tests/admin-presentation.test.ts tests/admin-tabs.test.ts`

Expected: PASS.

- [ ] **Step 5: Browser evidence**

Open `/admin` overview, Users and Workspaces with Playwright. Capture desktop evidence that labels are human-readable while numeric values and buttons are unchanged.

### Task 2: Scope the control-plane shell and tab navigation

**Files:**
- Modify: `src/routes/admin.tsx:91-160`
- Modify: `src/features/inbox/components/SystemAdminView.tsx:386-460`
- Modify: `src/styles.css:528-568`
- Modify: `tests/admin-tabs.test.ts`

**Interfaces:**
- Produces: `admin-control-plane-shell`, `admin-control-plane`, `admin-control-plane__tabs`, `admin-control-plane__action` CSS hooks.
- Preserves: current seven `Tab` ids, `aria-controls`, roving `tabIndex` and ArrowLeft/ArrowRight/Home/End behavior.

- [ ] **Step 1: Write failing static contracts**

Add assertions for the two scoped roots, `aria-current`/selected visual hook, internal tab overflow hook and reduced-motion fallback scoped to the admin surface.

- [ ] **Step 2: Run the targeted test to verify RED**

Run: `node --experimental-strip-types --test tests/admin-tabs.test.ts`

Expected: FAIL on missing scoped hooks.

- [ ] **Step 3: Implement the shell and tab classes**

Use existing Trax token variables and backdrop blur only on header/tab surface. At widths below 640px, retain one-line internal tab scrolling with visible continuation affordance; never hide page overflow or wrap tabs into an inaccessible second row.

- [ ] **Step 4: Verify GREEN and keyboard contract**

Run: `node --experimental-strip-types --test tests/admin-tabs.test.ts tests/frontend-unification.test.ts`

Expected: PASS.

- [ ] **Step 5: Browser audit**

At 320, 390, 768 and 1440px, use Playwright to select all tabs through Arrow keys, Home and End. Capture before/after screenshots, inspect focus and confirm no horizontal page clipping.

### Task 3: Recompose overview, users and workspaces without changing data flow

**Files:**
- Modify: `src/features/inbox/components/SystemAdminView.tsx:185-220, 470-670`
- Modify: `src/styles.css` (new rules only under `.admin-control-plane`)
- Modify: `tests/admin-presentation.test.ts`

**Interfaces:**
- Consumes: `data.metrics`, `filteredUsers`, `filteredWorkspaces`, pagination state and existing callbacks.
- Preserves: `members`, `saveUserStatus`, `saveWorkspaceStatus`, filters and pagination request parameters.

- [ ] **Step 1: Write failing contracts for semantic overview and responsive rows**

Assert that overview consumes `formatAdminMetricLabel`, status uses `formatAdminStatusLabel`, rows carry a scoped class and no backend request string changes.

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test tests/admin-presentation.test.ts tests/admin-tabs.test.ts`

Expected: FAIL only for the new presentation/layout contracts.

- [ ] **Step 3: Implement hierarchy and responsive rows**

Use information-weighted metric cards, localized state badges with text, and rows that stack identity plus actions on narrow widths. Keep existing buttons, callback references and confirmation dialog triggers exactly intact.

- [ ] **Step 4: Verify GREEN**

Run: `node --experimental-strip-types --test tests/admin-presentation.test.ts tests/admin-tabs.test.ts tests/admin-hardening.test.ts`

Expected: PASS.

- [ ] **Step 5: Browser audit**

Inspect long e-mail/UUID/slug at 320 and 390px, then keyboard-focus Details, Members and Suspend without invoking them. Confirm no truncation loses the control or creates page overflow.

### Task 4: Group services, newsletter and system-admin forms progressively

**Files:**
- Modify: `src/features/inbox/components/SystemAdminView.tsx:800-1360`
- Modify: `src/styles.css` (new scoped group, notice and critical-action rules)
- Modify: `tests/system-admin.test.ts`
- Modify: `tests/newsletter-upload-policy.test.ts`

**Interfaces:**
- Consumes: existing integration, newsletter, upload and system-admin state variables.
- Preserves: request payloads, secret masking, consent checkbox, upload limit, `run()`, disabled predicates and confirmation flow.

- [ ] **Step 1: Add failing characterization assertions**

Assert the pre-existing payload paths, consent protection, secret non-display and disabled conditions alongside new scoped form-group/critical-action hooks.

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test tests/system-admin.test.ts tests/newsletter-upload-policy.test.ts`

Expected: FAIL only for missing scoped hooks.

- [ ] **Step 3: Implement visual grouping only**

Separate selection, connection details, JSON configuration, secret rotation, audience consent, campaign content, preview and send actions into labelled sections. Critical send/suspend/rotation actions receive warning context but retain their existing disabled and handler logic.

- [ ] **Step 4: Verify GREEN**

Run: `node --experimental-strip-types --test tests/system-admin.test.ts tests/newsletter-upload-policy.test.ts tests/admin-hardening.test.ts`

Expected: PASS.

- [ ] **Step 5: Browser audit without mutations**

Use Playwright to open Services, Newsletter and Administração at desktop/mobile; tab through inputs and verify label, state, no secret value and no send/suspend action triggered.

### Task 5: Diagnose motion stability and apply only measured corrections

**Files:**
- Modify: `src/styles.css` only if the diagnosis identifies an admin-scoped cause
- Modify: `tests/frontend-unification.test.ts` only if new reduced-motion hooks are introduced

**Interfaces:**
- Preserves: global motion tokens, route transition behavior and all non-admin components.

- [ ] **Step 1: Reproduce the click-stability symptom**

Use a fresh Playwright session on Dashboard and `/admin`, record the control, computed movement/transition evidence and console. Distinguish a Playwright/browser limitation from a CSS layout loop before proposing a fix.

- [ ] **Step 2: Write a failing contract only if an admin-owned CSS rule is the cause**

The test must name the exact class/property responsible; do not add a speculative test for global animation.

- [ ] **Step 3: Apply the smallest scoped correction**

Use 140–280ms opacity/transform or color transitions; respect reduced motion. Do not suppress all app animation or add arbitrary timeouts.

- [ ] **Step 4: Verify interaction and performance**

Run: focused test if added, then Playwright click/keyboard checks, console/network inspection and screenshots. Mark BLOCKED if the browser driver remains the cause.

### Task 6: Whole-flow regression and release-quality evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-10-29-admin-premium-uiux-design.md` only if evidence reveals an accepted design correction
- Create: `output/playwright/admin-premium-uiux/` screenshots and trace artifacts (untracked test evidence)

**Interfaces:**
- Produces: repeatable evidence; no product behavior or deployment change.

- [ ] **Step 1: Run full static and build gates**

Run: `npm test`, `npm run audit:release`, `npm run lint`, `npx --no-install tsc --noEmit`, `$env:VERCEL='1'; $env:NITRO_PRESET='vercel'; npm run build`.

Expected: each exits 0; report existing lint warnings separately if unchanged.

- [ ] **Step 2: Run browser regression matrix**

With Playwright, verify login → OTP → dashboard → `/admin`; then capture 320, 360, 390, 768, 1024 and 1440px in both themes, keyboard tabs, reduced motion, no console errors and no unintended mutating request.

- [ ] **Step 3: Inspect full diff and evidence**

Run: `git diff --check` and review changed selectors for scope. Confirm every spec guard and negative constraint maps to a task/evidence item before reporting.

## Self-review

- Spec coverage: Tasks 1–4 cover language, composition, forms and responsive surfaces; Task 5 covers the observed interaction anomaly; Task 6 covers all required gates.
- No task changes API/DB/auth/roles; every CSS change is scoped.
- Review Focus has a named owning task: tabs (2), long data (3), forms (4), dark theme (2/6), login path (6).
- The plan intentionally does not add dependencies, redesign unrelated routes or prescribe visual changes outside the accepted spec.
