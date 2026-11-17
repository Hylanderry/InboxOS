---
name: inboxos-legal-consent-flow
description: Use when changing InboxOS registration consent, terms/privacy dialogs, the legal checkbox, registration cookies, route exit behavior, or the acceptedTerms/acceptedPrivacy payload.
---

# InboxOS legal consent flow

Use this skill for any change that can affect how a visitor reads, accepts,
unchecks, persists, expires, or submits the Terms of Use and Privacy Policy on
`/auth/register`.

## Core contract

Treat legal consent as a short-lived UX convenience, never as backend proof.
The server remains the authority: registration must send both
`acceptedTerms: true` and `acceptedPrivacy: true`, and the server must reject
missing or false values before creating a pending registration.

The registration page must satisfy all of these invariants:

1. An unchecked control opens the legal dialog; it never submits the form.
2. After dialog acceptance, the native checkbox is genuinely toggleable.
3. Unchecking immediately disables submission, clears the local acceptance and
   removes the registration consent cookie; it must not reopen the dialog.
4. A valid acceptance suppresses repeated dialog openings while the visitor
   remains on the registration page.
5. The browser cookie has a maximum lifetime of 30 minutes and is scoped to
   `/auth/register`. If it expires while the page is open, clear the checkbox
   and require acceptance again.
6. Leaving `/auth/register` clears the page-scoped acceptance. A later visit
   must ask again, even when less than 30 minutes have elapsed.
7. Malformed, expired, blocked, or unavailable cookies degrade to unchecked
   in-memory state; they never bypass the dialog or backend validation.
8. Explicit Terms/Privacy links may reopen the dialog for review without
   changing an existing acceptance until the visitor confirms a new one.
9. The form payload remains observable and testable at the boundary: the UI
   sends both legal booleans, and the API validates them independently of the
   cookie.

## State model

Keep one acceptance state for the registration surface. Do not maintain a
second boolean that can drift from the checkbox or submit payload.

| Event | Checkbox | Dialog | Cookie | Submit |
| --- | --- | --- | --- | --- |
| First visit | unchecked | closed | absent | disabled |
| Click unchecked control | unchecked | open | absent | disabled |
| Close/cancel dialog | unchecked | closed | absent | disabled |
| Confirm acceptance | checked | closed | expires in 30 min | eligible if fields valid |
| Click checked control | unchecked | closed | removed | disabled |
| Cookie expiry | unchecked | closed | removed | disabled |
| Leave registration route | reset on next visit | closed | removed | disabled on next visit |
| Backend receives false/missing legal flag | n/a | n/a | irrelevant | `400`, no registration |

## Implementation procedure

Before editing, map the complete path and record file/symbol evidence:

- `src/routes/auth/register.tsx`: form state, checkbox events, dialog props,
  cookie lifecycle, route-exit cleanup, and JSON payload.
- `src/features/legal/components/LegalConsentDialog.tsx`: document reading,
  focus trap, keyboard handling, cancel and confirm behavior.
- `src/features/legal/legal-consent.ts`: pure cookie/expiry helpers and
  testable consent predicates.
- `src/server/auth/registration-policy.ts` and
  `src/server/auth/registration.server.ts`: payload validation and persistence
  of legal document versions. Do not weaken these checks to accommodate UI.
- Tests covering the checkbox, dialog, payload, expiry, malformed cookies,
  manual uncheck, route exit, and backend rejection.

Then follow this order:

1. Reproduce the current interaction and inspect the browser event path. Check
   whether the native control is `readOnly`, disabled, intercepted by a parent,
   or toggled twice by bubbling.
2. Write a failing test for one behavior at a time. Prefer pure functions for
   cookie parsing/building and a focused source/runtime contract for the form.
3. Implement the smallest vertical slice. Keep cookie writes in the browser,
   avoid secrets or PII in the value, use `Max-Age=1800`, `Path=/auth/register`,
   and an appropriate `SameSite` attribute.
4. Schedule expiry with a cancellable timer and remove all listeners/timers on
   unmount. Clear the cookie on route/page exit without treating the cookie as
   authorization.
5. Verify the payload at the client boundary and the server rejection path.
   The frontend may hard-code `true` only after the user has explicitly
   confirmed the dialog; it must never submit while unchecked.
6. Review keyboard, screen-reader, mobile touch, light/dark theme, and focus
   return behavior. A native checkbox must have a visible checked/unchecked
   state and an accessible name.

## Required scenario matrix

Run or add tests for these variations:

- first visit, unchecked click, dialog cancel, Escape, backdrop close;
- scroll gate for Terms and Privacy, confirm only after required reading;
- acceptance followed by repeated clicks on the checked box;
- acceptance followed by manual uncheck and re-check;
- valid cookie on initial mount and cookie with exactly/just beyond 30 minutes;
- malformed cookie, missing expiry, expired timestamp, duplicate cookie names;
- expiry while the page remains open;
- internal route navigation, browser back/forward, refresh, tab close, and
  pagehide; the next registration visit must require consent;
- browser cookie failure or disabled storage, with safe in-memory fallback;
- two tabs with independent UI state and no backend trust in cookie state;
- valid/invalid form fields combined with both legal booleans;
- API payload with `acceptedTerms` false, `acceptedPrivacy` false, or either
  property missing;
- keyboard activation, focus return, touch target, reduced motion, and 320px
  viewport without horizontal overflow.

## Common mistakes to reject

- Leaving `readOnly` on a controlled checkbox and calling it a toggle.
- Opening the dialog from every row click, including clicks on a checked box.
- Persisting acceptance forever in `localStorage` or a session without TTL.
- Keeping the checked state after cookie expiry because no timer exists.
- Clearing only React state while leaving a valid cookie that silently restores it.
- Clearing the cookie on every render or effect re-run, including a development
  remount, instead of only on actual route/page exit.
- Sending a cookie or client-only flag as legal proof to the server.
- Changing the backend legal validation or document-version persistence to hide a
  frontend state bug.
- Testing only source strings while skipping the browser interaction and
  network payload when a runtime/browser harness is available.

## Acceptance evidence

Report changed files by layer (frontend, shared pure logic, backend, tests),
the root cause, exact commands run, and any unverified browser/runtime paths.
Do not claim the cookie or route-exit behavior is verified from a unit test
alone; use a browser check or mark it unverified.
