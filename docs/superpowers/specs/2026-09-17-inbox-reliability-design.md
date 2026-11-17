# Inbox Reliability and Evolution Integration Design

## Status

Approved by the user's instruction to implement every item in `PENDENCIAS_ENDPOINTS_E_ESQUEMA_2026-09-17.md`. This document converts that audit into one coherent target architecture. The React application remains without an authentication page.

## Goals

- Make inbound and outbound WhatsApp processing durable, idempotent, observable, and workspace scoped.
- Stop historical imports from becoming unread messages.
- Stop page loads from marking chats as read.
- Replace broken browser-side Supabase Realtime subscriptions with one Worker-mediated event transport.
- Preserve every imported group, including groups without messages, and enrich official names, photos, permissions, and participants.
- Model WhatsApp identities explicitly as canonical remote JIDs with optional E.164 aliases.
- Keep the TanStack Start/Nitro application as the HTTP edge and use Cloudflare Queue for background event processing.

## Architecture

Evolution sends a small authenticated webhook to the Cloudflare Worker. The Worker validates the request, stores a sanitized event in `evolution_events`, and sends only the event UUID to `EVOLUTION_EVENTS_QUEUE`. The queue consumer claims the row, processes the event through a shared application service, and records completion or failure. Queue retries are safe because `event_key` is unique and processing is idempotent.

Outbound messages are first recorded in `outbound_messages` under a unique client idempotency key. The application service sends once, records the uncertain state on timeout, and reconciles the result with Evolution webhooks. A retry reuses the same key.

Postgres owns atomic state transitions. `persist_inbox_message` creates or updates the chat, inserts the message, updates the preview, and increments unread only when the message is newly inserted and explicitly classified as a live inbound message. `mark_chat_read` separates local viewing from the external WhatsApp receipt.

The browser uses one incremental `/api/events` transport owned by the Worker. It no longer opens Supabase channels as an anonymous user. A single client store distributes chat, message, instance, and presence changes to hooks. Fallback reconciliation is slower and conditional.

## Data model

- `whatsapp_instances`: canonical UUID referenced by dependent tables.
- `chats`: `instance_id`, `remote_jid`, `phone_e164`, `kind`, and optional contact identity.
- `whatsapp_contacts`: `instance_id` and identity kind; existing rows remain compatible during rollout.
- `contact_identity_aliases`: maps LID, PN JID, and E.164 aliases to a contact identity.
- `group_participants`: membership, role, join/leave timestamps, name, phone, avatar, and canonical remote JID.
- `messages`: `instance_id`, `remote_jid`, `updated_at`, and instance-scoped external id uniqueness.
- `evolution_events`: durable webhook inbox with attempts and errors.
- `outbound_messages`: durable sending outbox and reconciliation state.
- `inbox_events`: monotonic event stream for the Worker-mediated frontend transport.

## HTTP contracts

All internal routes use shared Zod input parsing and a standard error envelope containing `code`, `message`, `retryable`, and `requestId`. Instance routes resolve ownership before any Evolution call. QR GET is read-only; creation remains on the authenticated admin POST route. Legacy phone pause/resume routes require an instance or return 400.

Media is private. URLs are issued only after the server verifies that the storage path belongs to a message in the current workspace. Large outbound media uses a direct signed upload flow rather than JSON base64 on the Worker request path.

The application remains without a React auth page. The Worker supports Cloudflare Access identity when configured and retains the explicitly requested local single-workspace mode. Mutating routes enforce same-origin/CSRF checks in local mode, role checks, rate limits, and workspace ownership.

## Frontend behavior

- Initial automatic selection does not mark a chat read.
- Explicit user selection plus visible timeline triggers local read state.
- One event stream updates chats, messages, instances, contacts, and presence.
- Realtime transport errors are visible as degraded connection state and automatically fall back to conditional polling.
- Retry preserves the original `clientMessageId`.
- Group titles and direct-contact labels never overwrite official or saved names with placeholders.
- Empty groups remain in the group view.

## Operations

- `/api/health` exposes a sanitized status and a protected detailed mode.
- Logs use request IDs and redact tokens, message contents, phone numbers, and media.
- Cloudflare observability is enabled.
- Queue messages use delayed retries and a dead-letter queue.
- Database migrations are additive and supersede the four unsafe local migrations; those files are not applied.

## Verification

Unit tests cover event classification, identity routing, idempotency, cursor behavior, request validation, and unread rules. Integration tests cover the browser-facing API without an auth page. Browser validation checks zero failed Realtime subscriptions, no automatic read mutation, incremental updates, stable names/photos, and production route behavior.
