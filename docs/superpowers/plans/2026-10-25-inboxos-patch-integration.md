# InboxOS Patch Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate the patch's functional corrections into the main InboxOS project while preserving the main project's visual identity, environment files, and existing local work.

**Architecture:** Use the main repository as the source of truth. Reconcile only behaviorally relevant changes: admin authorization scopes, read-only customer details, CSV import validation, functional routes/navigation, and regression tests. Keep visual-only patch changes out of the implementation unless they are behavior-neutral and already match the main project.

**Tech Stack:** React 19, TypeScript, TanStack Router/Start, Vite, Node test runner, Supabase client, Playwright, ESLint.

**Spec:** `docs/superpowers/specs/2026-10-25-inboxos-patch-integration-design.md`

## Global Constraints

- The main project remains the source of truth.
- Do not overwrite `.env`, `.env.local`, `.env.example`, or `.env.netlify.example`.
- Do not change palette, typography, visual tokens, layout language, or front-end identity.
- Do not apply Supabase migrations, change RLS, execute production SQL, or publish externally.
- Do not connect GitHub because the available account is not the user's account.
- Preserve unrelated pre-existing working-tree changes.
- Every production behavior change must have a regression test written and observed failing first.

## Review Focus

- Existing local changes in the same files must not be overwritten; baseline and diff scope are recorded before edits.
- Admin detail routes must remain read-only and must not expose secrets or unrelated metadata; test the returned contract.
- CSV imports above the supported limit must fail explicitly rather than truncate silently; test the boundary and over-limit cases.
- Auth scopes must remain least-privilege for each admin operation; test the scope names in the server contract.
- Patch UI classes and CSS must not enter the main project when they alter visual identity; test only functional behavior in the retained components.

### Task 1: Baseline, dependency reconciliation, and plan ledger

**Files:**
- Create: `.superpowers/sdd/2026-10-25-inboxos-patch-integration/progress.md`
- Modify: `package-lock.json` only if dependency reconciliation proves it necessary

- [ ] Record current branch, HEAD, working-tree state, package manifests, and environment key sets without printing secret values.
- [ ] Compare patch and main dependency manifests and lockfiles; keep the main versions when no dependency delta exists.
- [ ] Run `npm ci` only if the installed tree is inconsistent with the main lockfile.
- [ ] Record the ruling that the patch adds no required dependency and that env files remain untouched.
- [ ] Verify with `npm run audit:release` and the dependency-lock check.

### Task 2: Backend contract and authorization regression coverage

**Files:**
- Modify: `src/server/admin/admin-newsletter-audience.server.ts`
- Modify: `src/server/admin/admin-operations.server.ts`
- Modify: `src/server/admin/integration-vault.server.ts`
- Modify: `src/server/admin/newsletter.server.ts`
- Modify: `src/routes/api/admin/users/index.ts`
- Create or retain: `src/server/admin/admin-customer-detail.server.ts`
- Test: `tests/system-admin.test.ts`, `tests/admin-tabs.test.ts`, and focused contract tests as needed

- [ ] Add or extend failing tests for least-privilege admin scopes and the read-only customer detail contract.
- [ ] Run the focused tests and observe the expected failures before implementation.
- [ ] Apply the smallest server changes: domain-specific scopes, customer-detail routing, and no secret/metadata exposure.
- [ ] Run focused tests, then the full `npm test` suite.

### Task 3: Import validation and functional frontend wiring

**Files:**
- Modify: `src/lib/csv.ts`
- Modify: `src/features/inbox/components/ProductViews.tsx`
- Modify: `src/features/inbox/navigation.ts` only for behaviorally required routes
- Modify: `src/features/inbox/components/InboxShell.tsx` only for behaviorally required state/navigation fixes
- Test: `tests/uiux-phase16.test.ts` and focused import/navigation tests

- [ ] Add failing boundary tests for the client import limit and explicit rejection of oversized imports.
- [ ] Run the focused tests and observe failure before implementation.
- [ ] Implement `validateClientImportCount` and wire it to the existing import flow without silent truncation.
- [ ] Integrate only non-visual navigation/deep-link/state behavior from the patch.
- [ ] Run focused tests and the full suite.

### Task 4: Patch-specific regression tests and documentation reconciliation

**Files:**
- Create or modify: `tests/adm-client-corrections.test.ts` if its assertions represent retained behavior
- Create or modify: `tests/frontend-unification.test.ts` only for behavior-neutral functional contracts
- Modify: relevant documentation under `docs/`

- [ ] Review each patch test and retain only assertions compatible with the main visual and architectural constraints.
- [ ] Add failing tests for any retained behavior not covered by existing tests, then implement the minimum supporting code.
- [ ] Explicitly document rejected visual-only patch changes and the reason for rejection.
- [ ] Run the focused tests and the full suite.

### Task 5: Full verification and independent review pass

**Files:**
- Modify: `.superpowers/sdd/2026-10-25-inboxos-patch-integration/progress.md`

- [ ] Run `npm test`.
- [ ] Run `npm run lint` and record existing warnings separately from errors.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run audit:release`.
- [ ] Run `npm run build`.
- [ ] Review the final diff for environment changes, visual identity changes, secrets, migrations, and unrelated file modifications.
- [ ] Record deferred minors and rulings before reporting the implementation status.

