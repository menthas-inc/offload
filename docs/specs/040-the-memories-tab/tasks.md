# 040 The Memories tab, tasks

Every task opens with its failing test, seen red, and closes green with nothing else red (QUAL-1). One PR per part. Tracks: API, Agent, Web, Mobile.

*As built: all four parts went in as one PR, 88, merged 2026-10-07 (`f89eb78`). Each box below was checked against the code on 2026-10-07.*

## Part A: five kinds, the routes, the caps (one PR)

- [x] **A0** Design: take `ui_kits/memories_tab/`, `explorations/memories-*`, `handoff/APPLY-2026-10-06-memories.md`, `handoff/memories-standalone.html`, the readme section and the decision entry. Append the entry; do not replace the file. Do **not** take the rest of the bundle (thirteen decision entries, map and wash tokens, a brand mark and three handoff files would go, and 74 icons would gain C2PA blobs). Regenerate `_ds_bundle.js` and `_ds_manifest.json` locally. (OFF-7) *(Done: the kit is HTML, CSS and JS with no JSX component, so only `_adherence.oxlintrc.json` changed.)*
- [x] **A1** Privacy page:
  - the memory bullet gains typing in the tab;
  - section 16 names the Memories tab;
  - the date moves.

  Test first in `privacy-policy.test.tsx`. (AC-31)
- [x] **A2** `packages/widgets/src/memories.ts`, the shared constants, with a test. (AC-28) *(The test is `apps/web/test/memory-kinds.test.ts`.)*
- [x] **A3** Migration 0086, the five kinds and the columns, the check and the agent's update grant. Tests:
  - no *words* after the migration;
  - the check refuses an embedding on a thread note;
  - `agent-role.test.ts` checks the three columns. (AC-1)
- [x] **A4** `store.ts`: `listMemories`, `addMemory`, `changeMemory`, the nullable `forget`, `restoreMemory`, the rules cap, the 300 cap with learned retirement, the duplicate pre-check. A test per rule. (AC-2 to AC-6)
- [x] **A5** `routes/memories.ts`. Tests:
  - every route 404s a thread note's id and another account's memory;
  - no text in any log line;
  - JSON only. (AC-7, AC-8)
- [x] **A6** Agent:
  - the tool's `kind`, the pass's `Kind` and `memory.md` lose *words*;
  - `rules_full` and `memories_full` are placed as declines with prompt lines;
  - the known block says first person is the person.

  Update 029, the cast and the eval stub, and add a case for a first-person memory. (AC-1, AC-6, AC-9)
- [x] **A7** Docs:
  - 038's spec;
  - `context-and-memory.md`;
  - `docs/tech/decisions.md`, its entry and the allowlist;
  - `CLAUDE.md`'s note on the phones' route.

## Part B: the tab (one PR, three surfaces)

- [x] **B1** Web: the sidebar row, `/memories`, the pane, the list (By kind, Newest), search, empty, loading and failure, the editor pane, forget with Undo, the cap line. Tests for each state; `dead-classes` and `dead-icons`. (AC-10 to AC-15)
- [x] **B2** Mobile:
  - the tab key and route, with the `/notes` redirect;
  - the screen, the list and swipe;
  - the `DragSheet` editor, the search field and every state.

  Tests for each state. (AC-10 to AC-15)
- [ ] **B3** **Open:** checked on an iOS simulator only (design log, 2026-10-06); Android on a device and the bar at 200% text are still to do. Device checks:
  - the sheet with the keyboard up on iOS and Android;
  - the bar at 200% text;
  - screenshots for the owner. (AC-16)
- [x] **B4** `principles.md` ends OFF-1's exception. Design log entries for each divergence. (AC-17)
- [x] **B5** Browser check on the web against an isolated database with the cast loaded, signed in as Ana. *(Recorded in the design log's "The Memories tab as built", 2026-10-06.)*

## Part C: embeddings and reach (one PR)

- [x] **C1** The companies page's Voyage row, *does* and *receives*, and its date, test first, **before** C2. (AC-31)
- [x] **C2** The sweep's memories corpus and `embed.memory` in the worker, with the `updated_at` guard. (AC-18)
- [x] **C3** `embed()` timeout, `query_words`, `memories_for` with the fallback, the two blocks with the rules block cached. Tests: under 50 no call; over 50 own before learned; mail body never in the query; timeout falls back. (AC-19 to AC-22)
- [x] **C4** The passes use `memories_for` with their own words. (AC-21)
- [x] **C5** The cast: Behrooz gains 250 recent unrelated memories and one old relevant one, plus a case. Run with permission, narrow. (AC-23) *(As built: an eighth person, Noor, carries the 250 rather than Behrooz; `noor-the-usual-past-250` passed on its second narrow run, 2026-10-06.)*

## Part D: the layout and the map (one PR)

- [x] **D1** `memories/layout.ts` and the daily run call. Tests: determinism, row pitch, a fixture order; placement beside the nearest on read. (AC-24, AC-25) *(As built in `8c9cd983`: t-SNE within each kind and across kinds, `memory_kind_places` in 0087, in place of the grid; the tests hold determinism, no overlap and the nearest neighbour.)*
- [x] **D2** Web map: the DOM world, clouds in both themes, dots and sentences, labels, the dock, controls, Everything, search fade, accessibility, reduced motion. (AC-26 to AC-30)
- [ ] **D3** **Open:** the Skia map is built and tested (`apps/mobile/test/memories-map.test.ts`); the on-device checks are not done past the iOS simulator, and frame rate at 300 and Android on a device are still to do. Mobile map: the Skia ground and clouds, Reanimated pills, gestures, the same states. On-device checks: back gesture, the tab bar, frame rate at 300. (AC-26 to AC-30)
- [ ] **D4** **Open:** the design log entry for the dark drawing is written (2026-10-06); the owner's call on the phones' fainter dark clouds, and Android, are still to come. Screenshots of the map in light and dark on all three for the owner; a design log entry for the dark drawing. (AC-29)

## Close

- [x] Each PR: the full gates in the worktree, then the code, security and client reviews, then the PR. *(One PR, 88; the reviews' changes are in the feature spec's Review and in `memories-tab.test.ts`'s security block.)*
