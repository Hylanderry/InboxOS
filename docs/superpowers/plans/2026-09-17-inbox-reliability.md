# Inbox Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checklist syntax for tracking.

**Goal:** Implement every corrective action in the endpoint and schema audit and publish a durable Evolution API inbox without adding a React authentication page.

**Architecture:** The Cloudflare Worker remains the HTTP edge, stores webhook envelopes in Supabase, and dispatches event IDs through Cloudflare Queue. Postgres RPC functions make message/chat/unread operations atomic, while one Worker-mediated incremental event transport replaces broken anonymous Supabase subscriptions in the browser.

**Tech Stack:** TanStack Start, Nitro, React 19, TypeScript, Zod, Supabase Postgres/Storage, Evolution API 2.3.7, Cloudflare Workers and Queues.

**Spec:** `docs/superpowers/specs/2026-09-17-inbox-reliability-design.md`

## Global Constraints

- Keep the React application without an authentication page.
- Never apply the four unsafe local migrations dated 20260915 as written.
- Preserve project history; this checkout has no `.git`, so no commit steps are possible here.
- Never log secrets, message text, media contents, or full phone numbers.
- Every external mutation must be workspace scoped and idempotent.

---

### Task 1: Regression tests for immediate correctness

**Files:** `tests/recovery.test.ts`, `tests/integration.test.ts`

- [x] Add failing tests for historical `MESSAGES_SET`, retry idempotency, canonical LID targets, placeholder group patches, automatic read behavior helpers, and event cursors.
- [x] Run the focused tests and confirm the new assertions fail.
- [x] Introduce small pure helpers used by both production code and tests.
- [x] Run focused tests until green.

### Task 2: Reconciled production schema and atomic RPCs

**Files:** `supabase/migrations/20260917*_reconcile_inbox_architecture.sql`, `src/integrations/supabase/types.ts`

- [x] Add instance FKs, canonical identity columns, alias and participant tables, event inbox, outbox, and frontend event stream.
- [x] Add `persist_inbox_message`, `mark_chat_read`, event triggers, indexes, and grants.
- [x] Backfill canonical data without deleting chats or messages.
- [x] Make `chat-media` private and remove the redundant message index.
- [x] Apply the migration through the Supabase migration API and regenerate types.

### Task 3: Durable webhook inbox and Cloudflare Queue

**Files:** `src/server/evolution/event-inbox.ts`, `src/server/evolution/process-event.ts`, `src/routes/api/public/webhooks/evolution.ts`, `src/server.ts`, `wrangler.jsonc`

- [x] Extract webhook business processing into a shared service.
- [x] Make the public webhook validate, sanitize, deduplicate, persist, enqueue, and respond quickly.
- [x] Add queue consumer acknowledgement, retry, and durable error state.
- [x] Split historical `MESSAGES_SET` from live `MESSAGES_UPSERT` unread behavior.
- [x] Create Cloudflare primary and dead-letter queues.

### Task 4: Atomic inbound persistence and identity routing

**Files:** `src/lib/evolution.server.ts`, `src/server/evolution/sync-engine.ts`, `src/server/evolution/contact-identity.ts`

- [x] Replace multi-step persistence with the transactional RPC.
- [x] Use canonical remote JID and explicit identity kind throughout inbound and sync paths.
- [x] Preserve official names/photos and repair placeholders.
- [x] Persist group participants and calculate admin send permission.

### Task 5: Idempotent outbound application service

**Files:** `src/server/evolution/send-message.ts`, `src/routes/api/messages/send.ts`, `src/lib/mcp/tools/send-message.ts`, `src/features/inbox/hooks/useMessages.ts`

- [x] Validate requests with Zod and resolve owned instance/chat first.
- [x] Create or reuse outbox records before calling Evolution.
- [x] Build the destination from canonical identity data.
- [x] Reuse the client idempotency key for UI and MCP retries.
- [x] Reconcile success, timeout, failure, and webhook confirmation.

### Task 6: Worker-mediated frontend events

**Files:** `src/routes/api/events/index.ts`, `src/lib/realtimeSocket.ts`, `src/features/inbox/realtime/*`, inbox hooks and components

- [x] Implement a monotonic composite cursor over `inbox_events` with bounded pagination.
- [x] Create one shared client event store.
- [x] Remove all anonymous Supabase channels and per-row presence subscriptions.
- [x] Use conditional fallback polling with backoff and no concurrent calls.
- [x] Stop automatic initial chat selection from marking the chat read.

### Task 7: Endpoint ownership, contracts, media, and read receipts

**Files:** API routes under `src/routes/api`, shared API utilities under `src/server/http`

- [x] Add request ID, standard errors, Zod parsing, same-origin mutation checks, and rate limiting.
- [x] Make QR GET read-only and verify instance ownership before Evolution calls.
- [x] Verify ownership before delete, presence, sync, import, pause, and resume.
- [x] Separate local read state from external receipt status and retry failed receipts.
- [x] Replace arbitrary media token bypass with verified message access and signed private URLs.
- [x] Add direct signed media upload endpoint.

### Task 8: Import, pagination, and profile synchronization

**Files:** chat/message routes, sync routes, sync engine, profile photo route

- [x] Implement opaque composite cursors ending in ID.
- [x] Keep all groups visible while importing direct identities without creating invisible chats.
- [x] Add abortable, bounded profile-picture work with correct progress.
- [x] Remove optional-instance legacy mutations.

### Task 9: Health, security boundary, and observability

**Files:** `src/routes/api/health.ts`, `src/server/middleware/*`, `wrangler.jsonc`, `.env.example`

- [x] Fail webhook authentication closed.
- [x] Add Cloudflare Access assertion support and safe local-mode origin enforcement without a React login page.
- [x] Add sanitized health and protected detailed health.
- [x] Enable Cloudflare logs/traces and structured redacted logging.
- [x] Add Sentry hooks when a DSN is configured.

### Task 10: Build, live migration, deployment, and browser verification

- [x] Run unit, integration, type, targeted lint, and production build checks.
- [x] Run a Wrangler dry run and verify Queue bindings.
- [x] Deploy the Worker with existing secrets preserved.
- [x] Validate queue consumption, webhook contract, live Evolution endpoints, database state, and health.
- [x] Open the published panel in Chrome and verify no subscription storm, no automatic read mutation, incremental updates, names/photos, groups, console, and network.
- [x] Update the audit with final implemented state and remaining external configuration, if any.

