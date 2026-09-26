# 024 Notifications, tasks

Ordered. Each cites the acceptance criteria and principles it serves. `[ ]` open, `[~]` in progress, `[x]` done. Every task with behaviour starts with its test seen red (QUAL-1). 023 first, whole. Then the API in the order the sends need it, the writers, Today, the two clients, and the owner's steps batched at the end.

## A. The documents

- [x] **A1** The six privacy page edits in `feature-spec.md`, "The privacy page", into `apps/web/src/app/(marketing)/privacy/page.tsx` in the worktree, with `UPDATED` and `CONSENT_VERSION` moved; the product owner reads them before the send code is written. (AC-9, OFF-1, the `CLAUDE.md` policy rule)
- [x] **A2** `docs/specs/022-sharing/feature-spec.md`, "The dot": the gear owns a request, the bell owns the record, and the page sentence is amended. (AC-19, DEV-2)
- [x] **A3** Landed on main with the merge, 2026-09-26. At merge, on `main`: the three `docs/tech/decisions.md` entries and the design log entry with every line under "Design system impact". (OFF-7, DATA-1)

## B. API: schema and tokens

- [x] **B1** `0058_notifications.sql` as the impl-spec writes it; `schema.ts`; the drift test; no agent grant. Red first. (DATA-1)
- [x] **B2** `POST` and `DELETE /v1/push-tokens`: the pattern, the upsert binding to the session, the re-bind on conflict, delete only the session's. Test `tokens.test.ts`, red first. (AC-11, SEC-2)
- [x] **B3** `/api/me`: the six `notify*` fields and `activityNew`; the patch with `HH:MM` hours; a changed hour, switch or zone deletes the account's queued digest jobs. Test. (AC-14, AC-1)

## C. API: the sends

- [x] **C1** `notifications/copy.ts`: the three arms, the overdue sentence, the event hour, the possessive and the two-per-member cap, the repeating clause, the clamp. Test `copy.test.ts` pinning every line, red first. (AC-5, SEC-1)
- [x] **C2** `notifications/push.ts` over `expo-server-sdk` with `EXPO_ACCESS_TOKEN`: chunking, tickets, `PushFailed(status, code)`, receipts, `DeviceNotRegistered` dropping the token; the memory transport outside production. Test `push.test.ts`. (AC-10, OFF-1)
- [x] **C3** `activity.ts`: `record`, the reasons, `GET /v1/activity`, `POST /v1/activity/seen`, the seen aggregate that ignores requests, readable by the account only. Test `activity.test.ts`. (AC-17 to AC-21, OFF-3)
- [x] **C4** `digest.schedule` hourly and `account.digest`: the keys, the hour in the zone across DST, the two-hour drop, the window and the predicate, overdue one to seven days, repeating never overdue, the evening's rules, the identical-set skip, the switch skip recorded only with content, no token recorded as permission, the one-task category and payload. Test `digest.test.ts`, red first. (AC-1 to AC-4, AC-6, AC-8, OFF-3, OFF-4)
- [x] **C5** `POST /v1/notifications/act`: Done and Tomorrow through the existing writes, the calendar refusal, the Activity row. Test. (AC-6)
- [x] **C6** The four analytics events with their properties. Test that no property is a token, a name or a title. (AC-10, OFF-1)

## D. API: people and the silences

- [x] **D1** `people.notify` from `request()` and `shareThread()`, checking the row is still live at send time, the two bodies, the switches. Test in `people.test.ts`. (AC-7)
- [x] **D2** `shared.activity` enqueued from `add_content`, `add_note`, the typed row and quick add; the coalescing key; composed at send time from rows the recipient may still read; the clamp; "several". Test. (AC-7, OFF-3)
- [x] **D3** The silent writers: `sweepPeople` for expired requests and shares in the sender's record; `edit_content` for a moved date in the turn's account's record. Test each, red first. (AC-17)
- [x] **D4** The purges: thirty days in `jobs.purge`; on take-out, leave, the hard purge of a row and account deletion. Test each. (AC-20)

## E. API: Today

- [x] **E1** `GET /v1/today`: the three groups over the window, notes excluded, rules placed once and never in Overdue, the cap. Test `today.test.ts`, red first. (AC-22)

## F. Mobile

- [x] **F1** `lib/notifications.ts`: permission, the token with the project id, the four channels with private visibility, the two categories with unlocking required, the payload table, the response listener, the verbs' call; `_layout.tsx` registers on launch; `signOut` deletes first. `app.json` gains the plugin. Test the table and the sign-out order. (AC-11 to AC-13, AC-16)
- [x] **F2** Today as a screen: the agenda groups from `/v1/today` with the thread page's row, the strip, the spinner, the two empty states, the bell as a control with the dot. (AC-19, AC-22)
- [x] **F3** `app/activity.tsx`: the list, the lead on `--border-lift`, the tag, the doors, seen on open, the empty state. (AC-18, AC-19)
- [x] **F4** The Notifications page in Reaching you: the switches, the hours, System settings, the denied line, Android's channel mirror. (AC-14 to AC-16)

## G. Web

- [x] **G1** The Notifications page with the web's line; `use-me.ts` fields. (AC-14)
- [x] **G2** The Activity pane from the sidebar's item, alive, with the dot. (AC-18, AC-19)
- [x] **G3** The Today pane's three groups. (AC-22)

## H. Owner steps, batched

- [x] **H1** In EAS: the APNs key was already on the project from an earlier iOS build; the FCM V1 service account key uploaded on 2026-09-24 after the Google Cloud organisation policy on key creation was overridden for project `offload-42787`; `apps/mobile/google-services.json` committed and named in `app.json`; a robot user with the Developer role holds the access token, enhanced push security is on, and `EXPO_ACCESS_TOKEN` is on Railway's `core-api` and in `.env`. A real digest reached the Pixel's shade through Expo and FCM the same day.
- [x] **H2** Android development build: the free plan's cloud builds for the month were used up, so `eas build --local` with the project's EAS keystore, installed over the Pixel's app with the sign-in kept. iOS: the development-simulator build of 2026-09-22 already carries the native module and was used for I2; a device build is not needed before TestFlight. Still to do at merge: the production builds from `main`, iOS in the cloud and Android locally until 1 October, then the submits.
- [x] **H3** Run on 2026-09-24 inside the API's container: one active account, the owner's, and five waitlist rows with no name and nothing dumped. No email.

## I. Verification

- [x] **I1** The gates on the isolated database with no server running. Core API 875, web 244, mobile 57, agent 268 with 52 skipped, ruff, lint, typecheck, and the three dead-name checks, on 2026-09-22.
- [x] **I2** On the simulator: `xcrun simctl push` with each payload the server builds, the verbs, the doors, Today, Activity and the page in both themes. On the web: the page, the pane, the groups. Screenshots kept. (Done means) On the Pixel, 2026-09-24: the new build installed, native Google sign-in, Today with its row and controls, Activity, the Notifications page and the hour picker, the four channels created, the FCM token registered, one real digest through Expo and FCM into the shade, and its tap opening Today with the bell's dot. One bug found and fixed: Android refuses a category without an action.
- [x] **I3** The eval principle file added; running it is a separate ask. (AC-23)
- [x] **I4** The three review agents on the diff; one commit per pass. The security pass and the server side of the code review went in one commit, the client review in the next; both reviews' findings are listed in `at-merge.md`.


## J. Raised by the device pass, for later

- [ ] **J1** The hour rows' label follows the locale while the Android picker follows the device's 24-hour setting, so a phone set to 24 hours reads "8:00 AM" and opens a 24-hour dial. Matching them needs `expo-localization`, a native module, so it waits for a build that carries it.
- [ ] **J2** A send that arrives while the app is in front is delivered and recorded but not shown, the platform default on both phones since the app sets no notification handler. Decide whether a digest should show a banner over an open app.