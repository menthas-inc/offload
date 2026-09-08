# 012 The calendar, tasks

Every task cites the AC it serves. Ordered so each step is shippable and the
feature is inert until credentials exist.

## A. Configuration and the vault

- [x] **A1** `env.ts`: `GOOGLE_CONNECTOR_CLIENT_ID`, `GOOGLE_CONNECTOR_CLIENT_SECRET`, `CONNECTOR_VAULT_KEY`, all optional, and a `connectorsAvailable()` the clients read. Refuse a missing vault key in production the way `DATA_ROOT_KEY` does. `AC-1`
- [x] **A2** `connectors/vault.ts`: seal and open a token under `CONNECTOR_VAULT_KEY`, reusing `crypto/keys.ts`'s primitive, never `DATA_ROOT_KEY`. `AC-2`
- [x] **A3** Migration: `connector_connections`, `connector_secrets`, `connector_calendars`, `connector_calendar_rules`, and the unique partial index on `content (account_id, source_ref)`. `AC-2`, `AC-6`, `AC-8`, `AC-16`
- [x] **A4** `schema.ts` gains all four, with the comment on `is_shared` explaining the default. `AC-5a`

## B. Connecting

- [x] **B1** `/api/connectors/google/start`: its own route, its own client id, its own scopes. Shares no table or hook with Better Auth. `AC-1`, `AC-2a`
- [x] **B1a** Signed single-use `state` carrying the session's account and a PKCE verifier, using `attempt.ts`'s seal. Callback compares the account byte for byte. Redirect destination is an enum, never a parameter. `AC-1`
- [x] **B2** `/api/connectors/google/callback`: exchange, seal, write the connection, list calendars, default every one to shared. `AC-2`, `AC-3`, `AC-5a`
- [x] **B3** Disconnect, and separately, remove what was filed. Two confirmations, never one. `AC-12`
- [x] **B3a** Disconnect revokes at Google before deleting the vault row. `AC-12`
- [x] **B3b** Single-flight token refresh, replacing the refresh token rather than assuming it stable. `invalid_grant` is `needs_reauth`, not a retry. `AC-2`
- [x] **B3c** Every calendar route resolves ownership through the connection, and every thread id from a client is membership-checked. SEC-2
- [x] **B4** `needs_reauth` on a revoked refresh token: stop, mark, offer Reconnect. Never retry into a wall.

## C. Reading

- [x] **C1** A Google Calendar client: list calendars, list events in a window with a `syncToken`, handle `410 Gone` as a full re-read.
- [x] **C2** The event mapping, including all-day as a date, IANA zone in `attrs`, organiser kept, attendees minimised, `description` dropped. `AC-6`, `AC-11`
- [x] **C3** Routing: rules in order, first match, else the calendar's thread. `AC-8`
- [x] **C4** `calendar.sync` job: incremental, self-rescheduling, window-bounded, reconciling deletions. `AC-10`
- [x] **C5** Never writes a `messages` row, and a test says so. `AC-15`
- [x] **C6** The next tick is enqueued before the work runs, with a per-tick idempotency key, and a daily supervisor re-enqueues any active connection with no sync pending. `AC-10`
- [x] **C7** A nightly full-window pass, because the delta is not trusted to carry every removal. `AC-10`
- [x] **C8** `is_shared` forced back to true whenever Google says the role is no longer owner. `AC-5a`
- [x] **C9** `jobs` gains a purge: `done` and `dead` older than thirty days, in the existing sweep.

## D. Writing

- [x] **D1** The outward test, server-side, reading the union of attendees across the edit. One function, both callers. `AC-5`, `AC-5b`
- [x] **D2** Create, edit, delete, with recurrence scope as an argument. `AC-7`
- [x] **D3** Refuse a write to a calendar you cannot write to, in one line. `AC-4`
- [x] **D4** Undo that calls Google first and only then touches the local row, and leaves both alone on failure. `AC-17`
- [x] **D5** A calendar Google says you do not own cannot be marked private. `AC-5a`
- [x] **D6** `undoTurn` excludes `source = 'calendar'` and routes those rows through the Google-first path. A test covers a turn that created an event. `AC-17`
- [x] **D7** A series split posts the new series before truncating the old, with a deterministic `iCalUID` so a retry recognises its own work. `AC-7`

## E. The model

- [ ] **E1** Five tools, structured per OFF-5, with `scope` and no confirmation field. `AC-9`
- [ ] **E1a** `connector_pending_writes` and `POST /api/calendar/pending/:id/confirm`, which re-runs the outward test against live state. An outward-facing tool write proposes and never calls Google. `AC-5`, `AC-9`
- [ ] **E2** The prompt splits memories into rules to follow and untrusted references to cite. `AC-11b`
- [ ] **E3** `memories.ts` sets `derived_from_untrusted` when a source is an untrusted event. `AC-11a`

## F. The clients

- [ ] **F1** Settings, Connected apps, on web. `AC-16a`
- [ ] **F2** Same on iOS and Android. `AC-16a`
- [ ] **F3** Per calendar: thread, shared, on or off. Disconnect. `AC-3`, `AC-8`, `AC-12`
- [ ] **F4** First run's last screen, skippable, after the account is active. `AC-16b`
- [ ] **F5** Everything reads `available` and says "not available yet" rather than offering a dead button. `AC-1`

## G. The claim surface

- [ ] **G1** Privacy policy: Google Calendar as its own sub-processor, that offload writes, and that other people's names arrive with a calendar. `AC-13`
- [ ] **G2** Both phone kits' "offload never moves events" line, and one `decisions.md` entry with a filled Design system impact. `AC-13a`, OFF-7
- [ ] **G3** `docs/tech/decisions.md`: the conditional entry on the reversible allowlist, which is a new shape for that list. OFF-6
- [ ] **G4** A JSON Schema per new event in `schemas/events/`, `additionalProperties: false`, which is what `events.test.ts` actually enforces. `AC-14`

## What is needed from the product owner

Not code, and it blocks nothing until F is done:

- A Google Cloud project, separate from sign-in's, with the Calendar API on.
- An OAuth client and consent screen carrying `calendar.calendarlist.readonly`
  and `calendar.events`, with the callback on the API host.
- Verification, once it is past a handful of test users. Sensitive scopes.
- The three environment variables, in Railway.
