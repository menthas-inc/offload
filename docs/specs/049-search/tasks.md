# 049 Search, tasks

Ordered. Each cites the acceptance criteria and principles it serves. `[ ]` open, `[~]` in progress, `[x]` done. Every task with behaviour starts with its test seen red (QUAL-1). One pull request, three tracks: the API first, then the shared pieces, then the phones and the web, which do not depend on each other. Tests on the shared database run under the `suite` hold.

## Setup

- [ ] **S1** Apply the design bundle on this branch: the readme's **Search** section, its tab glyph line and vocabulary row only (the rest of the bundle's readme is older than `main`); its `decisions.md` entry; then one entry logging the five divergences in the feature spec's Amends, **Design system impact** filled in. No tokens, icons or components change. (OFF-7, DEV-2)
- [ ] **S2** Isolate the session's database (`offload_search`) and launch entries that run from this worktree. (DEV-3)

## API

- [ ] **A0** Before any arm: on a Railway branch database, `select version()` (expected 18) and `create extension unaccent`. Locally, seed one heavy account (20,000 rows, 300 threads) among 200 ordinary ones and record `EXPLAIN (ANALYZE, BUFFERS)` for the rows arm at `li:*`, `lis:*` and `lisb:*`, with and without a `thread_id in (account's memberships)` lead. The result sets the server's minimum (two or three letters) and the arm's shape, written into the impl-spec before A3. (Volume and access, DEV-1)
- [ ] **A1** Migration `0098_search_folds_accents.sql`: `unaccent`, the `offload_search` configuration, `SET EXPRESSION` on `content`, `notes` and `messages` `search_text` with today's expressions under the new configuration. Every tsquery on `search_text` moves from `'simple'` to `'offload_search'` in the same commit: `search/read.ts:193`, `:335`, `:336`, `:430`; `search-index.test.ts` and `voice.test.ts` with them. Tests in `test/search-fold.test.ts`, red first: *cafe* matches *Café Lisboa* in content, notes and messages; *sao paulo* matches *São Paulo*; every row a fixture set matched under `'simple'` before still matches (AC-5); the readable views still read `search_text`; `listContent({ matching: "café" })` finds a row titled *Cafe list*, red before the move. (AC-5, AC-30, DATA-1)
- [ ] **A2** Lift `contentArms()` out of `search()`, export `fuse()`, make `noteFilter(accountId)` module level and export `active()`, `search()` unchanged in behaviour. The existing `search` tests stay green with no edit beyond the configuration name; a new test that `search()` still uses `websearch_to_tsquery` semantics (*"lisbon flight"* as a phrase, `-` exclusion). (AC-30, DEV-1, OFF-8)
- [ ] **A3** `search/page.ts`: `terms(q)`, the prefix tsquery, `escapeLike`, and the four arms with words only. `test/search-page.test.ts` against the real database, red first:
  - *lisb* finds the thread *Lisbon trip* and its rows; *lisb fl* only the flight; *bon* the thread by name and no row (AC-4);
  - group limits 5, 6, 3, 3; archived rows after live; Not in a thread's rows carry `loose`; *not in* sets `loose: true` and never returns the default thread by its stored name (AC-7, AC-9, AC-10);
  - membership: a pending, removed and left member, another account, a deleted thread, a deleted row, a superseded and a muted note, a forgotten memory and another account's memory each return nothing; a shared thread's row added by another member is found (AC-20, AC-21, OFF-3, SEC-2);
  - every operator `& | ! : * ( ) ' % _ \` and quotes return a result or none, never an error; 400 characters are cut to 128 and searched (AC-22, SEC-1);
  - one letter returns names only. (AC-7)
- [ ] **A4** `VOYAGE_API_KEY` optional in `env.ts`. `search/embed.ts`: Voyage `fetch`, `voyage-4`, `query`, 1024, 1.5 s abort, no retry, the status-only log line; the per-minute counter of 30 per account with its `shortcut:` comment. Tests with `fetch` stubbed, red first: a 500, a timeout, a wrong width and a malformed body each give no vector; the body is never in a log line; the thirty-first call in a minute is not made. A test reads `apps/agent/src/offload_agent/embed.py` and asserts the same model, input type and width. (AC-6, AC-6b, OFF-1)
- [ ] **A5** The vector arms in `search/page.ts`, fused with `fuse()`: content chunks, note chunks, memory embeddings. Tests with a fixture vector, red first: *boiler* (vector near *Heater replaced*) finds it with `meaning: true` and four letters, and not under four or with `meaning: false`; with no vector the answer equals the words answer. (AC-6, AC-6b)
- [ ] **A6** `routes/search.ts`, `POST /v1/search`, registered in `app.ts`: zod body, session account, one transaction on one connection with the arms in sequence and `statement_timeout` 500 ms, the response shape, rows cut to 200 characters. Tests, red first: 401 signed out; a GET with `?q=` is 404; the request log line carries the route and no query, read from a captured log stream (AC-27); a forced timeout answers empty groups, not 500. (AC-17, AC-20, AC-27, OFF-1, SEC-2)
- [ ] **A7** `GET /v1/threads/:id/content?through=<id>`: the row checked to be in this thread, not deleted and in the pile asked for; then rows with `id >= through`, at most 90, `nextCursor` after, label filter and `ticksFor` not applied; otherwise the first page as today. Tests, red first: a row 60 back is in the read; a row 200 back, a row of another thread, a deleted row and a live row asked for with `archived=true` each give the first page; a label filter does not hide the target; a non-member is 404 as today. (AC-8, AC-9, AC-12)
- [ ] **A8** The rename on the server: `notifications/copy.ts` *Waiting in Threads.*; `prompts/plan_v2.md` *Threads*. Test that no notification copy says *My threads*, red first. (AC-2)
- [ ] **A9** Evals, written not run: a question about *cafe* finds *Café Lisboa*; asked to delete a thread, the reply names *Threads*. Running them is the owner's separate ask. (AC-5, AC-2)

## Shared, `packages/widgets`

- [ ] **P1** `search.ts`: `SEARCH_LIMITS`, `MEANING_FROM`, `SETTLE_MS`, `MEANING_IDLE_MS`, `ROW_PARAM`, `NOTE_PARAM`, `ARCHIVED_PARAM`, `matchSpans`, `nameMatches`, `recentAfter`, `rowLabel`. `search.test.ts`, red first: spans for prefixes and accents (*cafe* in *Café*), any run for names; local name matches; recent dedupes to the top and keeps five; a row label reads *Flight to Lisbon, TP1351, event, Fri 7 Nov, in Lisbon trip* and adds *archived*. (AC-7, AC-14, AC-15, AC-16, AC-29)

## Phones

- [ ] **M1** Tabs: `Shell.tsx` `TABS` and the tab list (Today, Threads, Search, Memories, labels *Threads*, *Search*), `(tabs)/_layout.tsx`, `MyThreads.tsx` title *Threads*, the comment in `app/_layout.tsx`. Re-tap on Search calls `focusSearch()`. Tests, red first: the order, labels and glyphs; re-tap focuses. (AC-1, AC-2, AC-3)
- [ ] **M2** `SearchField` lifted from `Memories.tsx`, drawn the same, its placeholder a prop (Memories passes `MEMORY_COPY.search`), `maxLength` 128. Memories' tests stay green. (DEV-1, AC-22)
- [ ] **M3** `lib/search.ts` and `components/screens/Search.tsx`: focused on open; local name matches at once; 120 ms settle; meaning after 350 ms idle from four letters; the newest answer wins; previous results stand while waiting; groups, headings, semibold spans, *Archived*, *Not in a thread*; nothing found; *Couldn't search.* with Retry and the local names kept. Tests with `request` stubbed, red first, for each. (AC-4, AC-6, AC-7, AC-14, AC-17, AC-18)
- [ ] **M4** Empty field: Recent from `offload_recent_searches` (in `ACCOUNT_KEYS`), removable, recorded on open, Ask or the search key only; the thread chips in the person's order. Tests, red first, including that `forgetAccountData` clears it. (AC-15, AC-16, AC-26)
- [ ] **M5** Ask: `fill(text)` on the conversation context, read by the Composer; the keyboard put away; the page stays with its results. Test, red first. (AC-13)
- [ ] **M6** Open at a row: `Thread.tsx` and `Loose.tsx` take `row`, `note`, `archived`; read with `through`; clear the label filter; open the fold, section or widget; once laid out, `measureLayout` against the `ScrollView` and scroll the row a third down; mark with `arrived`; fall back silently. Back returns to Search with its state. Tests, red first. (AC-8, AC-9, AC-10, AC-11, AC-12)
- [ ] **M7** The keyboard inset and the announcements: the results' bottom inset from `react-native-keyboard-controller`; the count announced after 700 ms; every row, chip and `x` 44 by 44. Device checks on the iPhone simulator and the Pixel: Ask reachable above the keyboard on both, four tabs at the largest text size, the mark on a row. Screenshots in the pull request. (AC-19, AC-29)

## Web

- [ ] **W1** The rename and the sidebar: *Threads* in `Sidebar.tsx`, the four crumbs and `MyThreads`' title; *Search* with `search` and the ⌘K or Ctrl K cap, opening the window. Tests, red first. (AC-1, AC-2)
- [ ] **W2** `SearchWindow.tsx` in `(shell)/layout.tsx`: `WPalette`'s tokens, the handoff's width, narrow rule; the same requests, settle, meaning and newest-wins as the phones through `lib/search.ts`; groups, Recent and chips. Tests, red first. (AC-4, AC-6, AC-7, AC-14, AC-15, AC-17, AC-18)
- [ ] **W3** Keys and ARIA: ⌘K and Ctrl K anywhere; `/` outside text fields only; arrows through results, Recent and chips; Return, ⌘Return, Escape with `stopPropagation`; focus returned; combobox, listbox, named groups, active descendant, the polite count. Tests with Testing Library, red first. (AC-23, AC-24, AC-25, AC-29)
- [ ] **W4** Recent in `localStorage` under the account's key; `sign-out.ts` removes it. `FILL_COMPOSER` moves from `panes/Today.tsx` to `lib/composer-fill.ts`; Ask dispatches it and closes. Tests, red first. (AC-13, AC-16, AC-26)
- [ ] **W5** Open at a row: the thread pane and `LoosePane` take `row`, `note`, `archived`, read with `through`, open folds, `scrollIntoView`, mark, fall back. Reduced motion: no rise, no fade. Tests, red first; a browser check of the window, the keys and a row opened deep in a thread, with a screenshot. (AC-8, AC-9, AC-10, AC-11, AC-12, AC-24)

## Documents

- [ ] **D1** Privacy policy section 18: the device keeps display preferences and recent searches; the policy's date and `CONSENT_VERSION` move together. `test/privacy-policy.test.tsx` stays green. The owner signs off the sentence before this lands. (AC-28)
- [ ] **D2** `docs/tech/decisions.md`: one entry (words and meaning, the configuration, the Core API's own Voyage call and its key, the budget shortcut, the unscoped-GIN shortcut and its trigger). `docs/specs/README.md`'s spec list if it carries one. (DATA-1, DEV-2)
- [ ] **D3** `/model-calls` and `/harness-map` if their hooks flag the prompt and search change. (DEV-2)

## Close

- [ ] **C1** `pnpm typecheck` from the root, lint, both suites, `dead-classes.mjs`, `dead-css.mjs`, `dead-icons.mjs`, as CI runs them. Every AC ticked against a test or a screenshot. `eas fingerprint:compare` against the live build: no native change is expected, so the phones ship over the air. (QUAL-1)
