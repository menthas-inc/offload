# 031 Settings, tightened, tasks

Every task starts with its failing test, run and seen red for the reason the task exists, then the code (QUAL-1). Where a task has no behaviour a test can see (a layout), it says so and is checked on a device or in the browser.

## 0. Setup

- [x] **T0.1** Worktree `031-settings`, databases `offload_031` and `offload_031_test`, `env.sh` and `env-test.sh` in the scratchpad. *(process)*
- [x] **T0.2** The design sync as the branch's first commit, in the worktree rather than on `main` (owner, 2026-10-02): readme, decisions, github.md, the two explorations, the handoff, the eight glyphs without their C2PA manifests. *(OFF-7)*

## 1. Server

- [x] **T1.1** `signInProviders` on `/api/me`. Tests: Google only, Apple only, both, ordered. *(AC-4)*

## 2. Phones

- [x] **T2.1** The eight glyphs through `pnpm icons`. *(AC-2)*
- [x] **T2.2** `lib/sessions.ts`: `thisDevice`, `listSignedIn` (others only, throws), `endOthers`. Tests in `test/sessions.test.ts`. *(AC-5)*
- [x] **T2.3** `lib/settings.ts` (new): `emailNote(providers)`, `appsValue(calendar, mail)`. Tests. *(AC-4, AC-14)*
- [x] **T2.4** `Group` heading and `Row` pill and status. Layout; device check. *(AC-1)*
- [x] **T2.5** `ChoiceTiles` on Theme and Week starts on. Layout; device check. *(AC-3)*
- [x] **T2.6** My account. Device check of the three Signed in on states. *(AC-5)*
- [x] **T2.7** Picker `check`. *(AC-7)*
- [x] **T2.8** My people and `NewConnection`, *Ask to connect*, the `rate_limited` line. Test for the lookup state mapping (`lib/people.ts`'s `lookupState`). *(AC-8, AC-9, AC-10)*
- [x] **T2.9** Notifications. *(AC-11)*
- [x] **T2.10** Connected apps cards. *(AC-12, AC-14)*
- [x] **T2.11** Help and the tutorial replay. *(AC-15)*

## 3. Web

- [x] **T3.1** The eight glyphs in `public/icons/`; `dead-icons.mjs` passes. *(AC-2)*
- [x] **T3.2** `lib/sessions.ts` as T2.2. Tests in `test/sessions.test.ts`. *(AC-5)*
- [x] **T3.3** `lib/settings.ts`: `emailNote`, `appsValue`, pane summaries. Tests. *(AC-4, AC-14)*
- [x] **T3.4** `Group` heading, `Row` pill and status. *(AC-1)*
- [x] **T3.5** `Combobox` on Country and Time zone. Render test: filter, keyboard, Escape and focus, Not set. *(AC-6)*
- [x] **T3.6** `ChoiceTiles` on Theme, Week starts on, Text size. Render test: radio group, picking writes. *(AC-3)*
- [x] **T3.7** My account. Render test of Signed in on's three states. *(AC-5)*
- [x] **T3.8** My people and `NewConnectionBody`, *Ask to connect*, the `rate_limited` line. Render tests. *(AC-8, AC-9, AC-10)*
- [x] **T3.9** Notifications with On your phones. *(AC-11)*
- [x] **T3.10** Connected apps cards and `/settings/apps/calendar`. Render test of the card states. *(AC-12, AC-13, AC-14)*
- [x] **T3.11** Help and `/tutorial`. Render test: Done goes to Help, no write. *(AC-15)*

## 4. Close

- [x] **T4.1** The gates in the worktree: `pnpm test` on the test database, `pnpm lint`, typecheck, the three `dead-*.mjs`.
- [x] **T4.2** Simulator, emulator and browser passes over every page, light and dark.
- [x] **T4.3** Review passes (code, client, security) and one commit per pass.
- [ ] **T4.4** The design log's code-wins entry, the amended specs' notes, and the merge by PR.
