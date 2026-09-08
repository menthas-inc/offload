# 012 The calendar, tasks

Every task cites the AC it serves. Ordered so each step is shippable and the
feature is inert until credentials exist.

## A. Configuration and the vault

- [ ] **A1** `env.ts`: `GOOGLE_CONNECTOR_CLIENT_ID`, `GOOGLE_CONNECTOR_CLIENT_SECRET`, `CONNECTOR_VAULT_KEY`, all optional, and a `connectorsAvailable()` the clients read. Refuse a missing vault key in production the way `DATA_ROOT_KEY` does. `AC-1`
- [ ] **A2** `connectors/vault.ts`: seal and open a token under `CONNECTOR_VAULT_KEY`, reusing `crypto/keys.ts`'s primitive, never `DATA_ROOT_KEY`. `AC-2`
- [ ] **A3** Migration: `connector_connections`, `connector_secrets`, `connector_calendars`, `connector_calendar_rules`, and the unique partial index on `content (account_id, source_ref)`. `AC-2`, `AC-6`, `AC-8`, `AC-16`
- [ ] **A4** `schema.ts` gains all four, with the comment on `is_shared` explaining the default. `AC-5a`

## B. Connecting

- [ ] **B1** `/api/connectors/google/start`: its own route, its own client id, its own scopes. Shares no table or hook with Better Auth. `AC-1`, `AC-2a`
- [ ] **B2** `/api/connectors/google/callback`: exchange, seal, write the connection, list calendars, default every one to shared. `AC-2`, `AC-3`, `AC-5a`
- [ ] **B3** Disconnect, and separately, remove what was filed. Two confirmations, never one. `AC-12`
- [ ] **B4** `needs_reauth` on a revoked refresh token: stop, mark, offer Reconnect. Never retry into a wall.

## C. Reading

- [ ] **C1** A Google Calendar client: list calendars, list events in a window with a `syncToken`, handle `410 Gone` as a full re-read.
- [ ] **C2** The event mapping, including all-day as a date, IANA zone in `attrs`, organiser kept, attendees minimised, `description` dropped. `AC-6`, `AC-11`
- [ ] **C3** Routing: rules in order, first match, else the calendar's thread. `AC-8`
- [ ] **C4** `calendar.sync` job: incremental, self-rescheduling, window-bounded, reconciling deletions. `AC-10`
- [ ] **C5** Never writes a `messages` row, and a test says so. `AC-15`

## D. Writing

- [ ] **D1** The outward test, server-side, reading the union of attendees across the edit. One function, both callers. `AC-5`, `AC-5b`
- [ ] **D2** Create, edit, delete, with recurrence scope as an argument. `AC-7`
- [ ] **D3** Refuse a write to a calendar you cannot write to, in one line. `AC-4`
- [ ] **D4** Undo that calls Google first and only then touches the local row, and leaves both alone on failure. `AC-17`
- [ ] **D5** A calendar Google says you do not own cannot be marked private. `AC-5a`

## E. The model

- [ ] **E1** Five tools, structured per OFF-5, with `scope` and no confirmation field. `AC-9`
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
- [ ] **G4** Analytics events typed to ids and enums so a title cannot compile. `AC-14`

## What is needed from the product owner

Not code, and it blocks nothing until F is done:

- A Google Cloud project, separate from sign-in's, with the Calendar API on.
- An OAuth client and consent screen carrying `calendar.calendarlist.readonly`
  and `calendar.events`, with the callback on the API host.
- Verification, once it is past a handful of test users. Sensitive scopes.
- The three environment variables, in Railway.
