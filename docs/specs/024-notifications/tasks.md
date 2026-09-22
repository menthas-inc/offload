# 024 Notifications, tasks

Ordered. Each cites the acceptance criteria and principles it serves. `[ ]` open, `[~]` in progress, `[x]` done. Every task with behaviour starts with its test seen red (QUAL-1). 023 first, whole. Then the API in the order the sends need it, the writers, Today, the two clients, and the owner's steps batched at the end.

## A. The documents

- [ ] **A1** The six privacy page edits in `feature-spec.md`, "The privacy page", into `apps/web/src/app/(marketing)/privacy/page.tsx` in the worktree, with `UPDATED` and `CONSENT_VERSION` moved; the product owner reads them before the send code is written. (AC-9, OFF-1, the `CLAUDE.md` policy rule)
- [ ] **A2** `docs/specs/022-sharing/feature-spec.md`, "The dot": the gear owns a request, the bell owns the record, and the page sentence is amended. (AC-19, DEV-2)
- [ ] **A3** At merge, on `main`: the three `docs/tech/decisions.md` entries and the design log entry with every line under "Design system impact". (OFF-7, DATA-1)

## B. API: schema and tokens

- [ ] **B1** `0058_notifications.sql` as the impl-spec writes it; `schema.ts`; the drift test; no agent grant. Red first. (DATA-1)
- [ ] **B2** `POST` and `DELETE /v1/push-tokens`: the pattern, the upsert binding to the session, the re-bind on conflict, delete only the session's. Test `tokens.test.ts`, red first. (AC-11, SEC-2)
- [ ] **B3** `/api/me`: the six `notify*` fields and `activityUnread`; the patch with `HH:MM` hours; a changed hour, switch or zone deletes the account's queued digest jobs. Test. (AC-14, AC-1)

## C. API: the sends

- [ ] **C1** `notifications/copy.ts`: the three arms, the overdue sentence, the event hour, the possessive and the two-per-member cap, the repeating clause, the clamp. Test `copy.test.ts` pinning every line, red first. (AC-5, SEC-1)
- [ ] **C2** `notifications/push.ts` over `expo-server-sdk` with `EXPO_ACCESS_TOKEN`: chunking, tickets, `PushFailed(status, code)`, receipts, `DeviceNotRegistered` dropping the token; the memory transport outside production. Test `push.test.ts`. (AC-10, OFF-1)
- [ ] **C3** `activity.ts`: `record`, the reasons, `GET /v1/activity`, `POST /v1/activity/seen`, the seen aggregate that ignores requests, readable by the account only. Test `activity.test.ts`. (AC-17 to AC-21, OFF-3)
- [ ] **C4** `digest.schedule` hourly and `account.digest`: the keys, the hour in the zone across DST, the two-hour drop, the window and the predicate, overdue one to seven days, repeating never overdue, the evening's rules, the identical-set skip, the switch skip recorded only with content, no token recorded as permission, the one-task category and payload. Test `digest.test.ts`, red first. (AC-1 to AC-4, AC-6, AC-8, OFF-3, OFF-4)
- [ ] **C5** `POST /v1/notifications/act`: Done and Tomorrow through the existing writes, the calendar refusal, the Activity row. Test. (AC-6)
- [ ] **C6** The four analytics events with their properties. Test that no property is a token, a name or a title. (AC-10, OFF-1)

## D. API: people and the silences

- [ ] **D1** `people.notify` from `request()` and `shareThread()`, checking the row is still live at send time, the two bodies, the switches. Test in `people.test.ts`. (AC-7)
- [ ] **D2** `shared.activity` enqueued from `add_content`, `add_note`, the typed row and quick add; the coalescing key; composed at send time from rows the recipient may still read; the clamp; "several". Test. (AC-7, OFF-3)
- [ ] **D3** The silent writers: `sweepPeople` for expired requests and shares in the sender's record; `edit_content` for a moved date in the turn's account's record. Test each, red first. (AC-17)
- [ ] **D4** The purges: thirty days in `jobs.purge`; on take-out, leave, the hard purge of a row and account deletion. Test each. (AC-20)

## E. API: Today

- [ ] **E1** `GET /v1/today`: the three groups over the window, notes excluded, rules placed once and never in Overdue, the cap. Test `today.test.ts`, red first. (AC-22)

## F. Mobile

- [ ] **F1** `lib/notifications.ts`: permission, the token with the project id, the four channels with private visibility, the two categories with unlocking required, the payload table, the response listener, the verbs' call; `_layout.tsx` registers on launch; `signOut` deletes first. `app.json` gains the plugin. Test the table and the sign-out order. (AC-11 to AC-13, AC-16)
- [ ] **F2** Today as a screen: the agenda groups from `/v1/today` with the thread page's row, the strip, the spinner, the two empty states, the bell as a control with the dot. (AC-19, AC-22)
- [ ] **F3** `app/activity.tsx`: the list, the lead on `--border-lift`, the tag, the doors, seen on open, the empty state. (AC-18, AC-19)
- [ ] **F4** The Notifications page in Reaching you: the switches, the hours, System settings, the denied line, Android's channel mirror. (AC-14 to AC-16)

## G. Web

- [ ] **G1** The Notifications page with the web's line; `use-me.ts` fields. (AC-14)
- [ ] **G2** The Activity pane from the sidebar's item, alive, with the dot. (AC-18, AC-19)
- [ ] **G3** The Today pane's three groups. (AC-22)

## H. Owner steps, batched

- [ ] **H1** In EAS: an APNs key and FCM credentials for the project; enhanced push security on; the access token into the API's environment as `EXPO_ACCESS_TOKEN` on Railway and in `.env`.
- [ ] **H2** New EAS development builds for both phones after F1, and the production build when the feature merges.
- [ ] **H3** The ship-time account count; the email if it is not one.

## I. Verification

- [ ] **I1** The gates on the isolated database with no server running.
- [ ] **I2** On the simulator: `xcrun simctl push` with each payload the server builds, the verbs, the doors, Today, Activity and the page in both themes. On the web: the page, the pane, the groups. Screenshots kept. (Done means)
- [ ] **I3** The eval principle file added; running it is a separate ask. (AC-23)
- [ ] **I4** The three review agents on the diff; one commit per pass.
