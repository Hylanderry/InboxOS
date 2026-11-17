# InboxOS responsivo premium - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the authenticated InboxOS experience reliable and premium across phone, tablet, and desktop without changing its Trax identity or product contracts.

**Architecture:** Work in tested vertical slices: first establish viewport/state contracts and diagnose data-loading behaviour, then adapt the shared shell and each surface through local responsive composition. Keep product requests, workspace isolation, auth, and route contracts untouched; visual states consume existing hooks and APIs rather than duplicating them. Treat Vercel cron work as a separate operational concern: retain the two existing protected jobs unless a concrete, authenticated maintenance job is proven necessary.

**Tech Stack:** React 19, TanStack Start/Router, Tailwind CSS 4, TypeScript, Node test runner, Vite/Nitro Vercel output, Playwright CLI.

**Spec:** `docs/superpowers/specs/2026-10-29-product-responsive-premium-design.md`

## Global Constraints

- Preserve typography, Trax tokens, `#080809`, `#f6f6f4`, Phosphor icons, and existing functional colours.
- Do not rewrite the app wholesale, add a UI kit/dependency, introduce a global reset, use new `!important`, fix widths, or hide overflow to conceal breakage.
- Do not alter auth, OTP, routes, search parameters, RLS, APIs, request payloads, permissions, database, Evolution, newsletter, secrets, or real data for a UX change.
- Do not remove a loading state until its input -> state -> request -> response -> render path is characterised and a loading, empty, error, retry, and refresh outcome is represented.
- Use only subtle, neutral matte glass for chrome, drawers, modals, and hierarchical surfaces; no gradient, purple, navy/blue identity, neon, heavy blur, fake metrics, or generic dashboard cards.
- Keep controls reachable, semantic, keyboard-operable, and touch targets near 44px; maintain reduced-motion and safe-area behaviour.
- Capture Playwright evidence at 320, 360, 390, 768 portrait, 768 landscape/540px height, 1024, and 1440px. Mark Chromium-specific evidence BLOCKED until Chrome/Edge is installed.
- Preserve the existing Vercel cron routes `/api/cron/evolution-recover` and `/api/cron/privacy-retention`, their `CRON_SECRET` authentication, schedules, feature flags, and bounded work. Do not add a schedule without an explicit operational handler, test, auth boundary, and failure policy.

## Review Focus

- Fast route switching while `/api/workspaces/` is pending: no blank content or stale data from another view; covered by Task 1 characterisation and Task 5 route audit.
- First load, refresh, error, empty, and offline data states: the user can distinguish them and retry without losing useful content; covered by Tasks 1 and 4.
- Narrow/landscape safe-area and virtual-keyboard conditions: no dock, composer, dialog, or action becomes unreachable; covered by Tasks 2, 3, and 6.
- Long names, e-mails, UUIDs, labels, and translated strings: wrapping preserves both identity and actions without page-level horizontal overflow; covered by Tasks 3 and 6.
- Async chat updates after the selected chat changes: old chat results never alter the currently visible conversation; covered by Task 5 and existing F16 contracts.

---

## File Structure

- `src/hooks/use-responsive-viewport.ts`: pure breakpoint snapshot and subscription contract for shared composition.
- `src/routes/index.tsx`: authentication/bootstrap presentation; replaces the blocking full-screen fallback only after state paths are characterised.
- `src/features/inbox/components/InboxShell.tsx`: authenticated application frame, responsive navigation, view mount boundaries, and inbox composition.
- `src/features/inbox/components/MobileDock.tsx`, `AccountRail.tsx`, `AccountsSidebar.tsx`, `ChatHeader.tsx`, `MessageTimeline.tsx`, `MessageComposer.tsx`: responsive shell consumers, changed only where the shared contract requires it.
- `src/features/inbox/components/ProductViews.tsx`: dashboard, CRM, clients, follow-up, calendar, and agents data-state and responsive content composition.
- `src/features/inbox/components/SettingsView.tsx`, `SystemAdminView.tsx`, `src/routes/admin.tsx`: settings and admin-specific responsive composition, retaining their handlers and ARIA contracts.
- `src/styles.css`: semantic, scoped Trax token consumers and responsive rules only; no unscoped overrides.
- `tests/responsive-viewport.test.ts`, `tests/product-loading-states.test.ts`, `tests/responsive-shell.test.ts`, `tests/admin-presentation.test.ts`: static/pure contracts for each new behaviour.
- `vercel.json`, `src/routes/api/cron/*`, and cron tests: changed only if a separately approved, concrete operational job is necessary.

### Task 1: Characterise data-loading and viewport contracts before visual changes

**Files:**
- Create: `tests/responsive-viewport.test.ts`
- Create: `tests/product-loading-states.test.ts`
- Modify: `src/hooks/use-responsive-viewport.ts`
- Modify: `src/routes/index.tsx`
- Modify: `src/features/inbox/components/ProductViews.tsx`

**Interfaces:**
- Consumes: `useResponsiveViewport()`, existing `loadDashboard`, `loadCrm`, `loadClients`, workspace product APIs, route search state, and auth session state.
- Produces: a documented viewport classification contract and explicit presentation-state contract (`initial`, `refreshing`, `empty`, `error`, `ready`) without changing API requests.
- Preserves: `/auth/login` redirect, session revocation handling, `view` query validation, and all workspace API functions.

- [ ] **Step 1: Record the baseline source and browser evidence**

Map every initial `useEffect` fetch in `ProductViews.tsx`, the authenticated bootstrap in `src/routes/index.tsx`, and the `InboxShell` view transition. In Playwright, reproduce Dashboard -> CRM -> Clientes while recording request status and rendered state; identify whether `/api/workspaces/` causes the blank view.

- [ ] **Step 2: Write failing pure/static contracts**

Add tests that require named `compact`, `mobile`, `tablet`, and `desktop` thresholds, an update path for orientation/height, and an explicit structural pending state for Dashboard/CRM instead of the literal blocking `Carregando indicadores...` panel. Test that old ready data remains renderable while refresh is pending.

- [ ] **Step 3: Run focused tests to verify RED**

Run: `node --experimental-strip-types --test tests/responsive-viewport.test.ts tests/product-loading-states.test.ts`

Expected: FAIL because the new contracts and explicit states do not yet exist.

- [ ] **Step 4: Implement the minimum state and viewport boundary**

Extract only pure viewport classification if needed for testing. Replace literal loading output with stable, semantic skeleton/empty/error/retry presentation that is local to each data surface; keep prior data visible on refresh. Change the root full-screen fallback only if the session/bootstrap investigation proves it is the source, and retain `aria-busy` feedback.

- [ ] **Step 5: Verify the contract and data flow**

Run: `node --experimental-strip-types --test tests/responsive-viewport.test.ts tests/product-loading-states.test.ts tests/frontend-unification.test.ts`

Expected: PASS, with no changed API path, payload, or auth expectation.

### Task 2: Establish the responsive authenticated shell and navigation foundation

**Files:**
- Modify: `src/features/inbox/components/InboxShell.tsx`
- Modify: `src/features/inbox/components/MobileDock.tsx`
- Modify: `src/features/inbox/components/AccountRail.tsx`
- Modify: `src/features/inbox/components/AccountsSidebar.tsx`
- Modify: `src/styles.css`
- Create: `tests/responsive-shell.test.ts`

**Interfaces:**
- Consumes: viewport contract from Task 1, `getAppViewMeta`, current search navigation, and existing account/conversation handlers.
- Produces: `inboxos-app-shell`, `inboxos-mobile-dock`, and `inboxos-workspace-frame` scoped styling hooks.
- Preserves: `AppView` IDs, query navigation, active workspace/account switching, and all conversation state ownership.

- [ ] **Step 1: Write the failing shell contracts**

Assert the shell exposes scoped hooks, the dock carries an accessible active route indicator, the main content reserves mobile safe-area/dock space, and no CSS rule uses page-level `overflow-x: hidden` to mask breakage.

- [ ] **Step 2: Run focused RED test**

Run: `node --experimental-strip-types --test tests/responsive-shell.test.ts tests/adm-client-corrections.test.ts`

Expected: FAIL only for missing responsive shell hooks/contracts.

- [ ] **Step 3: Implement one responsive frame**

Use the existing Trax variables to make the compact/mobile frame a one-column application with a persistent, reachable dock; make tablet reveal only useful context and desktop retain its rail. Apply subtle glass only to chrome. Use `dvh`, safe-area insets, and scroll ownership so one surface scrolls at a time.

- [ ] **Step 4: Verify shell contracts**

Run: `node --experimental-strip-types --test tests/responsive-shell.test.ts tests/adm-client-corrections.test.ts tests/uiux-phase16.test.ts`

Expected: PASS.

- [ ] **Step 5: Browser checks**

At 320, 390, 768 portrait, 768 landscape/540px, 1024, and 1440px, navigate between all non-mutating shell routes. Confirm dock focus/touch reachability, no double/page horizontal scroll, and intact current view query state.

### Task 3: Recompose dashboard, CRM, clients, follow-up, calendar, and agents as responsive work surfaces

**Files:**
- Modify: `src/features/inbox/components/ProductViews.tsx`
- Modify: `src/styles.css` (scoped product-surface rules only)
- Modify: `tests/product-loading-states.test.ts`
- Modify: `tests/adm-client-corrections.test.ts`

**Interfaces:**
- Consumes: Task 1 presentation states and existing product API/hooks.
- Produces: `inboxos-product-surface`, `inboxos-data-state`, `inboxos-responsive-actions`, and per-surface scoped hooks.
- Preserves: every existing create/update/delete/refresh callback, request payload, permission predicate, realtime refresh subscription, and confirm dialog.

- [ ] **Step 1: Add failing surface contracts**

For Dashboard, CRM, Clientes, Follow-up, Calendário, and Agentes, assert a stable first-load state, retryable error state, long-content-safe row/action wrapper, and CSS hook namespace. Add characterisation checks for currently critical handlers before moving their markup.

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test tests/product-loading-states.test.ts tests/adm-client-corrections.test.ts`

Expected: FAIL on the new local composition/state hooks, not an API contract.

- [ ] **Step 3: Implement surface slices in dependency order**

Implement Dashboard/CRM/Clientes first, then Follow-up/Calendário/Agentes. On compact/mobile use a single content column, stacked actions, content-driven cards, and overflow-safe list rows; on tablet/desktop progressively reveal density. Keep real values and no-data states visible; never replace operational data with decorative cards.

- [ ] **Step 4: Verify each slice**

Run: `node --experimental-strip-types --test tests/product-loading-states.test.ts tests/adm-client-corrections.test.ts tests/calendar-network-contract.test.ts tests/agent-personalization.test.ts`

Expected: PASS after each implemented subset.

- [ ] **Step 5: Browser/data audit**

With the authenticated Playwright session, visit each surface, refresh non-mutating data, inspect successful/pending/failed network requests, and capture long-content screenshots at all required viewports. Do not invoke create, update, delete, sync, or send actions.

### Task 4: Refine inbox, connections, and settings without changing asynchronous ownership

**Files:**
- Modify: `src/features/inbox/components/InboxShell.tsx`
- Modify: `src/features/inbox/components/ChatHeader.tsx`
- Modify: `src/features/inbox/components/MessageTimeline.tsx`
- Modify: `src/features/inbox/components/MessageComposer.tsx`
- Modify: `src/features/inbox/components/SettingsView.tsx`
- Modify: `src/features/instances/components/ConnectionManager.tsx`
- Modify: `src/styles.css` (scoped rules only)
- Modify: `tests/uiux-phase16.test.ts`

**Interfaces:**
- Consumes: existing chat-scoped update, message, composer, instance, and settings state.
- Preserves: chat ID/workspace scoping, send/read/retry semantics, draft ownership, QR modal accessibility, and connection mutation controls.

- [ ] **Step 1: Add focused failing regression tests**

Extend existing contracts only for the new scoped responsive hooks and any proven presentation-state boundary. Include chat A -> chat B completion, message error/retry visibility, dock/composer safe area, and settings/connection action reachability.

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test tests/uiux-phase16.test.ts tests/evolution-instance-mutation-scope.test.ts`

Expected: FAIL only for missing responsive presentation contracts.

- [ ] **Step 3: Implement the smallest responsive composition changes**

Make the inbox use one primary pane on compact/mobile with explicit secondary navigation access, preserve message scroll and composer reachability above safe areas, and use drawers/sheets for secondary context. Reflow settings and connection controls without changing their request path or disabling logic.

- [ ] **Step 4: Verify interaction contracts**

Run: `node --experimental-strip-types --test tests/uiux-phase16.test.ts tests/evolution-instance-mutation-scope.test.ts tests/evolution-receipts.test.ts`

Expected: PASS.

- [ ] **Step 5: Browser audit without external mutations**

Inspect the Inbox, Conexões, and Configurações views at required viewports. Exercise keyboard-only navigation, dialogs with Escape, visual focus, scroll, light/dark, and reduced motion. Do not connect WhatsApp, submit credentials, or perform instance changes.

### Task 5: Apply the approved admin control-plane plan as one responsive surface

**Files:**
- Modify: `src/features/inbox/components/SystemAdminView.tsx`
- Modify: `src/routes/admin.tsx`
- Modify: `src/styles.css` (under `.admin-control-plane` only)
- Create/Modify: `src/features/inbox/components/admin/admin-presentation.ts`
- Create/Modify: `tests/admin-presentation.test.ts`
- Modify: `tests/admin-tabs.test.ts`, `tests/system-admin.test.ts`, `tests/newsletter-upload-policy.test.ts`

**Interfaces:**
- Consumes: `SystemAdminView` data/callbacks and the details in `docs/superpowers/plans/2026-10-29-admin-premium-uiux.md`.
- Produces: a scoped admin control-plane shell and pure display formatters.
- Preserves: seven tab IDs, ARIA/tab keyboard behaviour, request methods, filters, pagination, consent, secret masking, disabled predicates, and all mutating confirmation flows.

- [ ] **Step 1: Reconcile the existing admin plan with this shared plan**

Read `2026-10-29-admin-premium-uiux.md`; execute its Tasks 1-5 unchanged where compatible, recording any conflict as a ruling. Keep all CSS under the admin scope and retain all observed API/data contracts.

- [ ] **Step 2: Run the admin RED/GREEN cycles**

Run the focused commands specified by the admin plan after each failing test and after each minimal implementation. Do not start the next admin slice before the named focused tests pass.

- [ ] **Step 3: Run non-mutating admin browser checks**

At 320, 390, 768, 1024, and 1440px, navigate all tabs with click/touch and keyboard. Check labels, long user/workspace identifiers, focus, tab continuation, light/dark, reduced motion, and that no service/newsletter/admin mutation request fires.

### Task 6: Decide Vercel operational scheduling from evidence, not as autonomous coding

**Files:**
- Modify only if required: `vercel.json`, `src/routes/api/cron/<concrete-job>.ts`, targeted server module, and targeted Node tests
- Verify unchanged if no concrete need: `vercel.json`, `src/routes/api/cron/evolution-recover.ts`, `src/routes/api/cron/privacy-retention.ts`, `tests/evolution-recovery.test.ts`, `tests/white-label-privacy.test.ts`

**Interfaces:**
- Consumes: Vercel Cron `Authorization: Bearer ${CRON_SECRET}`, existing recovery/privacy feature flags, and bounded workers.
- Produces: either an evidence-backed no-change decision or one authenticated, idempotent, bounded operational job with a failure response and test.
- Preserves: all existing schedules and protected handlers.

- [ ] **Step 1: Inventory current jobs and operational need**

Read current cron route/tests and verify that the existing schedules implement Evolution recovery and privacy retention. Classify the user's request to continue work after this session as not a valid cron workload: scheduled handlers run deployed server code, not an autonomous development agent.

- [ ] **Step 2: Add a failing test only for a concrete new job**

If a real operational requirement is discovered (for example, authenticated health aggregation with retention), write a test for auth rejection, feature opt-in, bounded execution, idempotency, and failure response before adding any handler or Vercel schedule. Otherwise record a no-change evidence result.

- [ ] **Step 3: Implement only an approved, bounded job**

Use the existing cron-auth pattern and exact schedule documented in the test. Do not schedule direct external mutations, messages, migrations, or deploys.

- [ ] **Step 4: Verify cron contracts**

Run: `node --experimental-strip-types --test tests/evolution-recovery.test.ts tests/white-label-privacy.test.ts tests/health-diagnostics.test.ts`

Expected: PASS, with any new test included only if a concrete job exists.

### Task 7: Full regression, performance, and deployment-readiness audit

**Files:**
- Create: `output/playwright/product-responsive-premium/` evidence (untracked)
- Modify only if audit exposes a documented and tested defect: files owned by Tasks 1-6

**Interfaces:**
- Produces: reproducible visual/network/console evidence; no production data mutation.

- [ ] **Step 1: Run static and build gates**

Run: `npm test`, `npm run audit:release`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run audit:prod`, and `$env:VERCEL='1'; $env:NITRO_PRESET='vercel'; npm run build`.

Expected: commands exit 0; record any pre-existing warnings or moderate dependency advisory separately.

- [ ] **Step 2: Run the full browser matrix**

Use Playwright for login -> OTP -> dashboard -> every authenticated view -> admin. For each viewport/theme/reduced-motion state, inspect console, network, route response, focus, long data, scroll ownership, and pending/error/empty/ready rendering. Mark missing Chromium DevTools evidence BLOCKED until a supported browser is installed.

- [ ] **Step 3: Review performance and changed scope**

Compare request counts on initial load and a route switch, inspect the console for repeat errors, and review `git diff --check` plus every changed selector/handler. Correct only proven regressions through a new RED -> GREEN test cycle.

### Task 8: Preview deployment and post-deploy non-mutating smoke

**Files:**
- No product file changes required

**Interfaces:**
- Consumes: passing Task 7 gates, the existing Vercel linkage/environment, and a verified preview deployment URL.
- Produces: a Vercel preview URL and a report of deployment/build status. Production promotion is excluded unless separately stated.

- [ ] **Step 1: Confirm the release boundary**

Verify the working tree diff, active Vercel linkage, and that no unreviewed secrets or unrelated dirty-worktree changes would be deployed. Preserve unrelated existing modifications; do not reset, clean, or stage them.

- [ ] **Step 2: Deploy preview through the Vercel workflow**

Run the configured preview deployment command with a ten-minute timeout. If credentials or linkage are unavailable, classify deployment as BLOCKED and return the exact blocker without changing project configuration.

- [ ] **Step 3: Report the preview result**

Return the deployment URL, build status, and the scope of verified non-mutating smoke evidence. Do not deploy production, change DNS, or operate external integrations without a separate instruction.

## Self-review

- Spec coverage: Task 1 maps loading/data causes before UI edits; Task 2 sets the frame; Tasks 3-5 implement surfaces with existing contracts; Task 6 handles the requested cloud scheduling truthfully; Tasks 7-8 provide measured release evidence and a preview deployment.
- Negative invariants are global constraints and every task preserves API/auth/data boundaries.
- Every Review Focus item has an owning task and a concrete test or browser verification step.
- The plan deliberately keeps Vercel operational scheduling separate from autonomous software development, avoids production deployment, and does not replace actual data with decorative UI.
