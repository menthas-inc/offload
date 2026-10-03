# 033 First run, three screens, tasks

Every task starts with its failing test, run and seen red for the reason the task exists, then the code (QUAL-1). Where a task has no behaviour a test can see (a layout, an animation), it says so and is checked on a device or in the browser.

## 0. Setup

- [x] **T0.1** Worktree `033-first-run`, databases `offload_033` and `offload_033_test`, `env.sh` and `env-test.sh` in the scratchpad. *(process)*
- [x] **T0.2** The design sync as the branch's first commit: the decisions entry, the two explorations and their script, the handoff and the standalone page. The readme's **First run** section is written as built (owner, 2026-10-03). *(OFF-7)*
- [x] **T0.3** Spec, three reviews, gate, impl spec, tasks.

## 1. API

- [x] **T1.1** `first-run-bring` landing: sealed, accepted by start, both outcomes to `/welcome/bring`, older landings unchanged. *(AC-9, AC-10)*
- [x] **T1.2** Exhaustive `landingUrl`. *(AC-10; compile-time, no test)*
- [x] **T1.3** `requireActive` on connector start and push-token registration. Tests: 403 for `invited`, through for `active`. *(AC-20)*

## 2. Phones

- [x] **T2.1** `lib/firstRun.ts` and the copy in `lib/gate.ts`. Tests in `test/first-run.test.ts`. *(AC-1, AC-2, AC-3, AC-7, AC-15)*
- [x] **T2.2** Source checks in `test/first-run-screens.test.ts`: no permission request in first run outside the card, no corner Skip or Not now, `landing=first-run-bring` with `/welcome/bring` as the return, no `GateBackdrop` in first run, the removed pieces gone, Help's note. *(AC-6, AC-9, AC-13, AC-16, AC-18, AC-21)*
- [x] **T2.3** `RunFooter`, `StoryBars`, `IntroArt`, `Intro`. Device check. *(AC-2, AC-3, AC-4, AC-19)*
- [x] **T2.4** `ConsentTicks` and `NameField` at first-run size; `BeforeYouStart`. Device check. *(AC-5)*
- [x] **T2.5** `BringItIn` with its three cards. Device check. *(AC-7, AC-8, AC-9, AC-11, AC-12)*
- [x] **T2.6** `FirstRun` and the two `Welcome` files; the settled-reads rule; Android back; replay; name-only. *(AC-1, AC-14, AC-15)*
- [x] **T2.7** Delete `TutorialArt`, `ConnectStepBar`. *(AC-18)*

## 3. Web

- [x] **T3.1** `lib/first-run.ts`, the phones' cases. *(AC-1, AC-3, AC-7)*
- [x] **T3.2** Render tests, red: the intro (titles, Continue, timer, art button, reduced motion, hover and focus pause, live region); Before you start (disabled Continue, one write with name and zone, failure line, routing to `/welcome/bring` or `/today`); Bring it all in (cards per account, Copy, Connected from the calendars read, Skip and Done to Today); `/tutorial` (Done to Help, no write); name-only. *(AC-1 to AC-5, AC-7 to AC-9, AC-12, AC-14, AC-15, AC-19)*
- [x] **T3.3** The components, the bloom, `/welcome/bring`, `/tutorial`. *(as T3.2)*
- [x] **T3.4** Delete `RunArt`, `MailOffer*`, `mailOffered`, the first-run-only `run*` classes; Help's note. *(AC-18, AC-21)*
- [x] **T3.5** The privacy page's two sentences, with a render test. *(AC-17)*

## 4. Close

- [x] **T4.1** The gates in the worktree: `pnpm test` on the test database, `pnpm lint`, typecheck, the three `dead-*.mjs`, a production web build.
- [x] **T4.2** Browser (light, dark, phone width), iOS simulator and the Pixel, 2026-10-03: the whole flow on each, Android back, Copy, Done to Today, and the phone registering for pushes once first run is written. They found the dark hairline, the phone-width footer and the cross-fade gutter. The simulator and the Pixel end signed out: neither held a session production accepts.
- [x] **T4.3** Review passes (code, client, security), one commit per pass. Deferred as their own task: content writes from accounts not yet active.
- [x] **T4.4** The design log's code-wins entry, the amended specs' notes, and the merge by PR.
- [x] **T4.5** In the same branch, at the owner's ask: the connector state sealed with AES-256-GCM, mail-in matching only active accounts, and the push-token re-bind reviewed and kept (`docs/tech/decisions.md`).
