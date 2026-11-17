# Calendário, Clientes e Contexto de Agentes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or implement task-by-task with the same checks.

**Goal:** entregar calendário e clientes persistentes, contexto de agente autorizado,
presença/chunking seguros e limites de Groq sem quebrar Inbox, CRM ou handoff.

**Architecture:** manter `crm_leads` como cliente canônico; adicionar tabelas
relacionais isoladas por workspace para tags e agenda; expor APIs server-side
com as mesmas permissões existentes; renderizar páginas como views do InboxShell.

**Tech Stack:** TanStack Start, React/TypeScript, Supabase/Postgres, Evolution API,
Groq, Phosphor Icons, testes Node existentes.

**Spec:** `docs/superpowers/specs/2026-10-13-calendar-clients-agent-context-design.md`

## Global Constraints

- Nenhum grupo ou mensagem real será usado no QA.
- Toda consulta/mutação filtra `workspace_id` e respeita `requirePermission`.
- UI preserva tokens InboxOS, light/dark, Phosphor e responsividade 320–1440px.
- TDD: teste de contrato/regra falha antes do código de produção.

## Review Focus

- conflito e limite diário de agenda → testes de regra e API;
- importação duplicada e tags em massa → testes de idempotência;
- agente sem permissão de agenda → contexto não deve conter ferramenta;
- resposta longa/emoji/código → chunks naturais sem cortes;
- concorrência/cache Groq e presença → no máximo uma execução ativa por chat.

### Task 1: Data model and contracts

**Files:** create migration/types/tests; add diagram/spec.

- [ ] Write failing tests for capacity, chunking, and runtime config permissions.
- [ ] Create idempotent migration with RLS, grants, indexes and constraints.
- [ ] Update generated database types and runtime config normalization.
- [ ] Run focused tests and full typecheck.

### Task 2: Calendar and client APIs

**Files:** `workspace-product.server.ts`, new route files, API client helpers.

- [ ] Add list/create/update/delete calendar and appointment handlers.
- [ ] Add client search/import/tag CRUD and bulk assignment handlers.
- [ ] Validate ownership, availability, overlap and capacity server-side.
- [ ] Add focused route contract tests.

### Task 3: UI surfaces

**Files:** navigation, InboxShell, ProductViews, workspace API types, styles only if needed.

- [ ] Add Calendário and Clientes navigation/views.
- [ ] Add calendar month/day/list, capacity and appointment modal.
- [ ] Add client search/import preview, selection and bulk tags.
- [ ] Add agent context/calendar controls and accessible states.

### Task 4: Agent runtime and messaging safety

**Files:** agent personalization/product server, Evolution helper, tests.

- [ ] Add bounded client/tag/appointment context and calendar permission checks.
- [ ] Send composing/paused presence around automatic generation.
- [ ] Split outbound text at natural boundaries and persist/send chunks idempotently.
- [ ] Add bounded Groq cache/concurrency/timeout and tests.

### Task 5: Verification and handoff

- [ ] Run `npm test`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run audit:release`, `npm run build`.
- [ ] Run browser QA locally at 320/360/390/768/1024/1440 when available.
- [ ] Report PASS/BLOCKED evidence and provide Antigravity migration/deploy steps.

