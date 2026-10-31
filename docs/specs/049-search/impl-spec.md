# 049 Search: implementation

**Feature spec:** `feature-spec.md` in this folder.
**Migration:** `0098_search_folds_accents.sql` (on the board 2026-10-30; 0097 is threads-grid's).
**New dependencies:** none. `unaccent` is a Postgres contrib extension, trusted since 13, so the database owner creates it.
**New environment:** `VOYAGE_API_KEY` on the Core API service, by reference to the worker's, optional in `env.ts` as it is there: without it the page finds by words only and says nothing.
**Reviewed:** project lead as tech lead, 2026-10-30; what changed is under Review.

## The shape in one paragraph

One route, `POST /v1/search`, takes `{ q, meaning }` in a JSON body and answers four short lists in one response. Every arm reads through the views and functions that already carry membership: `readable_content`, `readable_notes`, `active()` for memories, `thread_members` for names. Words match with a prefix `tsquery` built from letters and digits only, under a new text search configuration that folds accents, which the model's search moves to in the same deploy. With `meaning: true` and four letters or more, the Core API embeds the query once with Voyage and fuses a vector arm into rows, notes and memories with the reciprocal rank fusion `search/read.ts` already uses. The phones and the web send a words request on each settled keystroke and a meaning request when typing pauses, keep only the newest answer, and draw thread names from what they already hold before either lands. A thread page opened with `?row=` or `?note=` reads back to the target, opens what folds it, and marks it with the arrival mark.

## Data flow

```
field ── keystroke ── 120 ms settle ──► POST /v1/search { q, meaning: false }   (seq n)
      └─ ≥ 4 letters, 350 ms idle ───► POST /v1/search { q, meaning: true }    (seq n+1)
client: draw local thread-name matches at once; replace with the answer whose seq is newest

core-api routes/search.ts
  └─ terms(q) → ["lisb", "fl"]            letters and digits, folded, ≤ 8 terms, q ≤ 128
  └─ meaning && letters ≥ 4 && budget ok → search/embed.ts → Voyage (query, 1.5 s, no retry)
  └─ one transaction on one connection, statement_timeout 500 ms, the arms in sequence:
       threads   names, unaccent ILIKE, accepted member, not deleted, not the default thread
       rows      readable_content: words arm (+ vector arm), live then archived, fused, 6
       notes     readable_notes:   words arm (+ vector arm), active only, fused, 3
       memories  active(account):  words arm (+ vector arm), fused, 3
  └─ { threads, rows, notes, memories, loose }
```

## The migration, `0098_search_folds_accents.sql`

```sql
create extension if not exists unaccent;
create text search configuration offload_search (copy = simple);
alter text search configuration offload_search
  alter mapping for hword, hword_part, word with unaccent, simple;

alter table content  alter column search_text set expression as (
  setweight(to_tsvector('offload_search', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('offload_search', coalesce(body, '')), 'B'));
alter table notes    alter column search_text set expression as (
  to_tsvector('offload_search', coalesce(text, '')));
alter table messages alter column search_text set expression as (
  to_tsvector('offload_search', coalesce(said(text, transcript), '')));
```

- **`SET EXPRESSION`, not drop and add.** Postgres 17 and 18 (local and Railway) rewrite the column in place and keep the views that select `*` and the GIN indexes, so none of 0028's or 0052's view dance is needed. Tried on a scratch database on 2026-10-30: the view kept reading, `cafe:*` found *Café Lisboa*, `sao:* & pau:*` found *São Paulo trip*.
- **Each expression is exactly the current one with the configuration renamed**, read from 0027 and 0052, so nothing that matched stops matching (AC-5): `unaccent` maps only letters with marks, and `simple` sees the same words.
- **Every query on `search_text` moves in the same commit**, or an accented query stops matching the folded column: `read.ts:193` (`listContent`'s `matching`, the existence check), `:335` and `:336` (the content text arm), `:430` (notes and messages). The tests that name `'simple'` (`search-index.test.ts:256`, `voice.test.ts:416` and `:423`) move with them. Nothing in `apps/agent` queries `search_text`.
- **Production is Postgres 18.6** (the backup restored on 2026-10-21, `going-public.md`), local and CI 17: both have `SET EXPRESSION`. Creating `unaccent` on Railway is checked first, on a branch database.
- **`to_tsvector(regconfig, text)` is immutable whatever the configuration**, which is why a generated column accepts it, and the dictionary is named, so `search_path` cannot change it.
- **The rewrite takes an exclusive lock on each table for its length.** At alpha volume that is seconds at boot; the deploy is the migration.
- **`messages` too**, although this page does not search conversations: the model's asides read `messages.search_text`, and one configuration everywhere is the point.

## The read: `search/page.ts`, behind `POST /v1/search`

### The request

```ts
z.object({ q: z.string(), meaning: z.boolean().default(false) })
```

- **`q` is cut, not refused** (boundary checks drop, not refuse): normalised NFKC, its first 128 code points kept.
- **`terms(q)`**: lower case, `unaccent`-equivalent folding done by Postgres, so the client and server do not disagree; matches of `/[\p{L}\p{N}]+/gu`, the first 8 kept. Nothing else survives, so `& | ! : * ( ) ' \` and quotes are separators (AC-22). Fewer than one term: the empty answer.
- **The tsquery** is `to_tsquery('offload_search', $1)` with `$1 = terms.map(t => t + ':*').join(' & ')`, bound as a parameter. The terms are letters and digits, so the string cannot carry syntax; a unit test feeds it every operator.
- **Thread names** use `unaccent(threads.name) ilike unaccent($1) escape '\'` with `$1 = '%' + escapeLike(q.trim()) + '%'`, the whole query and not its terms, so *bon* finds Lisbon trip. `escapeLike` escapes `\ % _`.
- **Under two letters** (counting letters and digits) the server answers names only; the clients do not send it.

### The arms

All four in one transaction on one pooled connection, **in sequence**, under `set local statement_timeout = '500ms'`, so the worst case is four statements at 500 ms. Four connections per request would starve the pool of 10 at three concurrent searches. A timeout leaves the transaction aborted, so **a timeout is the empty answer**, 200 with empty groups: the client still has its previous answer and the names it drew itself.

**Threads**, up to 5:
```sql
select t.id, t.name from threads t
join thread_members m on m.thread_id = t.id
where m.account_id = $account and m.state = 'accepted' and t.deleted_at is null
  and t.id <> (select default_thread_id from accounts where id = $account)
  and unaccent(t.name) ilike unaccent($pattern) escape '\'
order by position(lower(unaccent($q)) in lower(unaccent(t.name))), t.name
limit 5
```
**Not in a thread** is never matched by its stored name. The answer carries `loose: true` when `'not in a thread'` contains the folded query, and the clients draw it as the first thread.

**Rows**, up to 6. The content arms are lifted out of `search()` in `search/read.ts` into one exported function both callers use:
```ts
contentArms(accountId, { match: Sql, vector: string | null, limit: number }): Promise<{ live: string[][]; archived: string[][] }>
```
`search()` passes `websearch_to_tsquery('offload_search', query)` and `SHORTLIST`, exactly what it runs today with the configuration renamed; the page passes its prefix tsquery and 20. Then `fuse()` (exported, unchanged) and the existing read of the fused ids through `readable_content` joined to `threads`. Lifecycle as `search()` states it: `c.deleted_at is null`, `t.deleted_at is null`, archived as its own pile behind the live one. **Rows in Not in a thread are included**; the row carries `loose: true` when `thread_id` is the account's default thread, and the client draws *Not in a thread* rather than a name it does not hold.

**Notes**, up to 3: `readable_notes` with `asidesFor`'s `noteFilter` (viewer, not deleted, not superseded, not muted, thread not deleted), the words arm on `search_text` and, with a vector, the `note_chunks` arm, fused. `noteFilter` becomes `noteFilter(accountId)` at module scope, since it closes over the viewer, so both use one definition.

**Memories**, up to 3: `active(db, accountId)` from `memories/store.ts`, exported, never a `notes` query by scope alone, since `readable_notes` holds thread notes only. `active()` has no `muted_at` because a memory cannot be muted; it is the Memories tab's own definition of what exists, which is the point of reusing it. Words on `search_text`; with a vector, `notes.embedding <=> $vector` on the same rows (040 embeds a memory on its own row). Fused.

### Meaning

- **`search/embed.ts`**, a `fetch` to `https://api.voyageai.com/v1/embeddings` with `model: "voyage-4"`, `input_type: "query"`, `output_dimension: 1024`, the same three values as `apps/agent/src/offload_agent/embed.py`, asserted equal by a test that reads both files. Abort at 1.5 s, no retry. Anything but 200 with one 1024-wide vector is no vector: logged as `query not embedded` with the status or error name, never the body, which can echo the input. Returns pgvector's text form.
- **Only when** `meaning` is true, the query has four letters or more, the key is set, and the account's budget allows. Otherwise the arms run words only and the answer is the same shape.
- **Budget:** 30 embeds per account per minute, one counter per account reset each minute, in process. *shortcut: per process, so a second Core API replica doubles it; upgrade to a count in Postgres when the API runs more than one replica.* Over budget is words only, silently. The idle gate already bounds a person; this bounds a script.
- **Fusion reorders results** (owner, 2026-10-30): the meaning answer replaces the words answer on the client wholesale.

### The response

```ts
{
  threads: { id: string; name: string }[];
  loose: boolean;                       // Not in a thread matches by its name
  rows: { id; threadId; loose: boolean; type; title; at: string | null; dateKind: "occurs" | "due" | "created"; archived: boolean }[];
  notes: { id; threadId; text: string }[];
  memories: { id; text: string; kind: MemoryClass }[];
}
```
- A thread's name is returned because a thread shared a moment ago may not be in the client's list yet; its icon and line come from the client's list, and a thread not in it draws its name with the default icon.
- A row's date is the one the thread page shows first (occurs, then due, then created), with which it is, so the client formats it as the thread page does.
- **Text is capped** at 200 characters per row, note and memory, `ANSWER_ROW_CHARS`, since a result line shows one or two lines.
- **No log line carries `q`**; the route logs nothing beyond Fastify's request line (route and status). Errors go through `guard()` as every route does, and a database error's message is already replaced by its SQLSTATE in `logger.ts`.

## Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | Threads 40 typical, 300 heavy. Rows 2,000 typical, 20,000 heavy (`decisions.md`'s heavy account). Notes 100, 1,000. Memories at most 300. |
| Fan-out | Rows per thread 50 typical, 500 heavy; a shared thread's rows count for each member. |
| Growth | About 20 rows a day for an active account; 15,000 in two years. |
| Read pattern | Search, on each settled keystroke: about 5 words requests and 1 meaning request per search; perhaps 30 searches a day for an active account. Peak, one person typing: about 8 requests a second for a second or two. At 1,000 active accounts with 1 percent searching at once: about 80 requests a second, each holding one connection for the sum of its arms, target 20 ms (threads 2, rows 10, notes 3, memories 3, plus embed wait outside the transaction). |
| Write pattern | None. The migration rewrites three columns once. |
| Sort and filter | Membership; `deleted_at`, `archived_at`, `superseded_at`, `muted_at`; prefix tsquery on `search_text`; cosine distance on chunk and memory vectors; substring on thread names. |

What follows:
- **Pagination:** none. Each group is a fixed small limit and the response is bounded at 17 entries of at most 200 characters.
- **Indexes:** the existing GIN indexes on `search_text` (0027) and HNSW on the chunks (0027) and memories (0086); no new index. Thread names are a scan of the account's own memberships, at most 300 rows, through `thread_members`' account index.
- **Measured 2026-10-30 (A0)**, on a local Postgres 17 with 201 accounts and 220,100 rows, one heavy account holding 300 threads and 20,100 rows. The planner starts from the account's memberships (`thread_members_account_state_idx`) and checks the tsquery per row through `content_thread_priority_idx`; it never scans the GIN index corpus-wide, because the membership side is the selective one. Rows arm, live pile: heavy `li:*` 21 ms (16,062 matches ranked), heavy `lisb:*` 6 ms, ordinary `li:*` 0.8 ms, ordinary `lisb:*` 0.6 ms. **The server's minimum stays at two letters, with no forced plan.** The cost that grows is ranking a heavy account's many two-letter matches, not the index.
- **The weak point that remains:** a heavy account's two-letter query ranks every match it has. *shortcut: unscoped GIN prefix scan; when p95 of `POST /v1/search` passes 150 ms or `content` passes 2 million rows, add a `btree_gin` index on `(thread_id, search_text)`.* The p95 is read from the request logs' durations, which carry no query.
- **Denormalisation:** none.
- **Cost of meaning:** about 10 tokens per embed at $0.06 a million; under a cent an account a year.

## The clients

### Shared, `packages/widgets`

- `SEARCH_LIMITS`, the group sizes; `MEANING_FROM = 4`; `SETTLE_MS = 120`; `MEANING_IDLE_MS = 350`.
- `ROW_PARAM = "row"`, `NOTE_PARAM = "note"`, `ARCHIVED_PARAM = "archived"`, beside `MEMORY_PARAM`.
- `matchSpans(text, query)`: the spans to draw semibold, accent and case insensitive, prefix of a word for rows, notes and memories and any run for thread names. Folds with `normalize("NFD")` and strips combining marks, close enough to `unaccent` for highlighting; a miss draws no bold and nothing else.
- `nameMatches(threads, q)`: the local thread-name matches drawn before the server answers, with the same folding.
- `recentAfter(list, q)`: the five most recent, the same words moved to the top.
- `rowLabel(row, threadName)`: the one-sentence accessibility label.

All pure, tested in `packages/widgets` once for both clients.

### Phones

- **Tabs.** `Shell.tsx`: `TABS` gains `/search`; the tab list gains Search between Threads and Memories, labels *Threads* and *Search*. `(tabs)/_layout.tsx` gains `<Tabs.Screen name="search" />`. Re-tap follows `resetToday`: a `lib/search.ts` `onSearchFocus`/`focusSearch` pair, called from the tab's `onPress` when already on `/search`.
- **The page,** `app/(tabs)/search.tsx` → `components/screens/Search.tsx`. Memories' field is lifted out of `Memories.tsx` into `components/SearchField.tsx` and used by both, drawn the same, taking its placeholder as a prop (Memories passes `MEMORY_COPY.search`), `maxLength={128}`. Results in one `ScrollView` with `keyboardDismissMode="on-drag"` and a bottom inset of the keyboard's height from `react-native-keyboard-controller`, which the plate already uses, so Ask clears the keyboard on Android edge to edge (AC-19).
- **Requests:** `lib/search.ts` `searchFor(q, meaning)` via `request()`, a sequence number per call; the screen keeps the newest it has drawn and ignores older answers. `request()` has no abort, and an ignored answer costs nothing.
- **Ask:** `conversation-context` gains `fill(text)`, the phone's `FILL_COMPOSER`; the Composer reads it as its text. Then `Keyboard.dismiss()`; the page stays.
- **Recent:** `offload_recent_searches` in `ACCOUNT_KEYS` (`lib/device-data.ts`), so `forgetAccountData` clears it at sign-out and on an account switch.
- **Results open** `/threads/[id]?row=…[&archived=1]`, `?note=…`, `/threads/loose?row=…`, `/memories?memory=…`.
- **Announcements:** `AccessibilityInfo.announceForAccessibility` on iOS and a polite live region on Android, after 700 ms without a keystroke.

### Web

- **Sidebar.** *Threads*, and *Search* between Threads and Memories, a button that opens the window, with the key cap. Crumbs on four pages and `MyThreads`' title say *Threads*.
- **The window,** `components/shell/SearchWindow.tsx`, mounted once in `(shell)/layout.tsx`, opened by a context the sidebar and the key handler share. Surface from `WPalette`: `--surface-raised`, `--border-hairline`, `--radius-lg`, `--shadow-3`, the rise at `--duration-base` `--ease-out`, `--surface-scrim` behind; width per the handoff, and below 660 px the page's width less its gutter. No hex.
- **Keys:** one `keydown` listener on `document`. ⌘K or Ctrl K always; `/` only when the target is not an `input`, `textarea`, `select` or editable. Inside the window, Escape calls `stopPropagation` and closes, so `PaneHead`, `Toast`, `PhotoViewer` and `MyThreads` never see it; focus returns to the element that had it.
- **ARIA:** the input `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; the list `role="listbox"`; each group `role="group"` labelled by its heading; rows `role="option"`. A visually hidden polite region announces the count.
- **Ask:** closes the window and dispatches `FILL_COMPOSER`, which moves from `panes/Today.tsx` to `lib/composer-fill.ts` so the shell does not import a pane.
- **Recent:** `localStorage` under `offload.search.recent.<accountId>`, so another account on the browser never reads it, and `sign-out.ts` removes the signed-out account's key.
- **Results open** `/threads/[id]?row=…`, `?note=…`, `/threads/loose?row=…`, `/memories?memory=…`.
- Reduced motion: no rise, no fade.

### The thread page, at a row (both clients)

- **The content read gains `through`**, a row id: `GET /v1/threads/:id/content?through=<id>`. **The server owns the fallback.** It first checks the row is in this thread, not deleted, and in the pile asked for (`archived`); if not, `through` is ignored and the usual first page comes back. If so, it returns every row with `id >= through` in the page's order, at most 90 (three pages), with the usual `nextCursor` after them; a target further back than 90 is ignored the same way. Ids are UUIDv7 and the page orders by id alone (`routes/threads.ts:2277`). With `through`, the label filter and `ticksFor` are not applied, so a filter cannot hide the target; the page clears its filter when it opens at a row. Both the `limit(PAGE + 1)` and the `slice(0, PAGE)` branch on it.
- **The page, given `row`:** reads with `through` (and `archived=true` when `archived` is set, which also switches the page to archived), opens the widget fold or layout section that holds the row, expands a widget that shows only its first rows, scrolls the row into view, and adds it to `arrived` so the 023 mark draws. The page knows the target was reached when the row is in the read; if not, it opens as today. **Mobile** draws the thread in a `ScrollView` (`Thread.tsx:1180`), so there is no index to scroll to: the row's view reports `onLayout`, and once the fold or widget holding it has expanded and the layout has settled, `measureLayout` against the scroll view gives its offset and the page scrolls it to a third of the way down. The web uses `scrollIntoView({ block: "center" })` on the row's element after the same expansion.
- **Given `note`:** opens the notes section if folded, scrolls to the note, marks it. A note found by search is active, so it is in the bundle the page already reads; the folded history holds superseded notes, which search never returns.
- **Not found** after the read: the page opens as it does today, nothing marked, nothing said (AC-12).
- **Not in a thread** takes `row` the same way; its read is the same content route on the default thread.

### The rename

`Shell.tsx`, `MyThreads.tsx` (both clients), `Sidebar.tsx`, four web crumbs, `notifications/copy.ts` (*Waiting in Threads.*), and `prompts/plan_v2.md`'s line on where threads are deleted. A test asserts *My threads* in no client source string, prompt or notification copy.

### The privacy policy

Section 18, one clause: the browser and the phone keep display preferences and recent searches on the device. `CONSENT_VERSION` moves with the policy's date, as the policy says it does. The companies page is unchanged: it already says Voyage receives the words of a search inside offload.

### The design system

The bundle is applied on this branch (owner, 2026-10-02): the readme's **Search** section, its tab glyph line and vocabulary row only; the design `decisions.md` entry from the bundle, then one entry logging the five divergences in the feature spec's Amends, with **Design system impact**: the kits' plates and `WSidebar` gain the fourth tab and the Threads label; Search is drawn with *In your threads*, *Search everything*, a Notes group, archived rows, meaning from four letters, and `WPalette`'s surface.

## Edge cases

- **The query is all separators:** no terms, the empty answer, the client shows the empty field's page.
- **A term of one letter among others** (*a lisb*): it is a prefix like any other; `a:*` narrows little and costs little next to the others.
- **Voyage slow or down:** words only, in 1.5 s at worst; the client has already drawn the words answer.
- **The statement timeout:** the empty answer; the client keeps what it drew.
- **A thread renamed after its row was drawn:** the next answer carries the new name.
- **Two tabs of the web app:** each its own window and recent list, the same storage key.
- **The sweep embedding late:** a new row is found by words at once and by meaning once its chunk is embedded.

## As built, 2026-10-30

Where the build departed from the sections above, each folded in here rather than rewritten above it:
- **A row carries the date fields an answer's row carries** (`dueAt`, `occursAt`, `occursEndAt`, `allDay`, `rrule`), not `at` and `dateKind`, so both clients draw its date with the existing `foundMeta`, as answers do, and fall back to the kind's word (`KIND_WORDS`) when it has none.
- **Meaning locally is an opt-in per shell, `MEANING_LIVE=1`**, as `MAIL_LIVE` and `PUSH_LIVE` are: the suite and a dev server read the same `.env`, which carries the Voyage key, and a paid third party is never reached from a local process by default. Production uses the key as described.
- **Not in a thread reads from its own route**, `GET /v1/loose`, not the content route. It takes `through` too: when the row is in the default thread's live pile within 90, the page reads 90 entries (rows and notes interleave there, so this is the reach, not an exact count), and a row it still misses opens the page with nothing marked.
- **The keystroke scheduling is one shared function**, `searchSession` in `packages/widgets/src/search.ts`, used by both clients: settle, the meaning pause, newest wins, a failed meaning read leaves the words standing, nothing asked under two letters.
- **The phones' Ask uses the conversation's existing `setDraft`**; no `fill()` was needed.
- **Opening at a row on the phones** goes through a small `Reveal` context (`components/shell/reveal.tsx`): the thread screen provides the id and a `found(view)` that measures against its `ScrollView`; `ContentRowView` and the note row report themselves, and `Widgets` and `NotesSection` keep the fold holding it open. Not in a thread is a `FlatList` and uses `scrollToIndex`. A revealed row or note takes the existing change mark.
- **The web** passes `reveal` through `RowHandlers` and a prop on `Notes`; rows and notes carry `data-row-id` and `data-note-id` for `scrollIntoView`.
- **Search counts as home** for the voice-note quick action (`RecordArrival`'s `HOME`), since it carries the plate's composer.
- `docs/tech/decisions.md` is shared state and is edited on `main`, so its entry (D2) goes in at the merge.

## Review, 2026-10-30

Project lead as tech lead. Changed:
- **Every query on `search_text` moves with the column**, `listContent`'s existence check included, which the first draft missed and would have made *did I add café* answer no. A red test on it.
- **Arms run in sequence on one connection**, 500 ms per statement, and a timeout is the empty answer: the first draft's "in parallel" and "the arms that finished are returned" were not what one transaction does.
- **The mobile thread is a `ScrollView`**: open at a row is `onLayout` and `measureLayout` after expansion, not `scrollToIndex`.
- **`through` checks the row is in the thread and the pile first**, ignores the label filter, falls back on the server, and reads at most 90 rows, not 300, into a page that draws everything.
- **The plan for a two-letter prefix is measured before the arms are written** (A0), and decides the minimum and the membership path. Peak request rate and per-arm targets added.
- `noteFilter(accountId)`, a per-minute counter, `FILL_COMPOSER` moved out of Today, `SearchField`'s placeholder prop, `VOYAGE_API_KEY` optional in `env.ts`, and production's Postgres major stated (18.6).

Not changed: the in-process embed budget stays, as the one-line counter the review allowed.

## Review of the build, 2026-10-30

Code, client and security reviewers on the whole diff. Changed:
- **Recent searches are forgotten on every way a web session ends**, not only Sign out: the 401 that follows a remote sign-out, a staff disable or a deletion mark (`use-me.ts`), and deleting the account (`delete-account.ts`). The phones already cleared them through `ACCOUNT_KEYS` on all four. Section 18's "until you sign out" is true on both now.
- **Opening at a row no longer erases the thread's kept label filter**: the page shows All for that visit and the kept pick is there next time, on both clients.
- **`POST /v1/search` holds at most three searches in flight per account** (429 `busy`, which the client draws as a failed read), the statement timeout is 250 ms, and the comment counts the real twelve statements. A request a browser marks `sec-fetch-site: cross-site` is refused like a foreign Origin.
- **The web**: the Threads page heading renamed (the crumb had been, the heading had not); an archived Not in a thread row opens the archived pile; chips reach 44 with a hit area round the drawn 36; tokens for every radius and target; Tab stays in the window; ⌘K pressed while open no longer loses where focus came from; a click inside the window keeps the keys working; a window opened before `/me` answers reads its recent list when it does; the count is announced for the server's answer only, as on the phones; the chip wrapper is `role="presentation"`; ids from the address go through `CSS.escape`.
- **The phones**: `measureLayout` measures against the scroll view's content view, a host component (the ScrollView itself raised a dev error on the simulator); the Ask row lost an edge the handoff does not draw.

Not changed:
- **"Accent folding misses `memories.search_text`"**: there is no `memories` table since 0033; memories are `notes` rows, whose column 0098 folds (checked in the database).
- **A remove control inside a recent option** may not be reached by a screen reader in browse mode; it needs a VoiceOver and NVDA pass, which was not run.
- **iOS hears no live region** for *Couldn't search.*; `accessibilityLiveRegion` is Android's. The count is announced on both.
- **The keyboard spacer on the phones** adds the plate's height under Ask while the keyboard is up: extra scroll room, nothing hidden.
- **"Add it to my threads"** in two sentences on the web (`NeedsYou.tsx`, `InvitationModal.tsx`) is prose rather than the tab's name; left for the owner.

## The meaning floor, 2026-10-31

Found on production the day after the merge: with no floor, a meaning arm always returned its nearest sixty, so "xqzvt plork" filled every group to its cap and *Nothing matches* (AC-14) could not appear from four letters on. The owner asked for a floor here and in the answer path.

- **Every meaning read drops a candidate further than `MEANING_FLOOR = 0.56`** cosine distance (similarity under 0.44): content in `contentArms`, both of `search()`'s asides, and this page's notes and memories. One constant in `search/read.ts`, applied by `near()` to the index's top sixty after they are read, not as a where clause: with `hnsw.iterative_scan` on, a where that nothing passes (every nonsense query) keeps the scan widening to pgvector's tuple limit on every arm, which the review caught. The words arms are unchanged, so a prefix while typing still finds its row: meaning cannot tell "resu" from anything else (relevant and irrelevant both sat near 0.7).
- **Measured, not chosen.** `docs/experiments/2026-10-meaning-floor`: 63 invented rows shaped like dumps, embedded with the agent's breadcrumb, 63 labelled queries, then 32 held-out queries written before they were embedded. At 0.56 all 25 nonsense and off-topic queries but one read nothing (the one: "weather in Tokyo" reaches the Japan trip), and 56 of 61 real questions still find a row they should. A final check on eight synthetic accounts written from the eval cast (2,030 items, 400 labelled queries) held it: 82% of real questions find a right item, 59 of 61 web questions and every nonsense query read nothing. A margin relative to the best match bought a few points of precision for a second constant and was left out. Nothing published gives a Voyage cutoff; the advice that exists is to floor the vector arm on its raw distance before fusing, calibrated on your own data, which is what this is.
- **What it costs.** A question worded far from its row is not read by meaning: "my CV" sits at 0.578 from "Finish resume". The model can still search again in other words or list the thread, and the answering spec's AC-4c is amended to say an empty read is not evidence of absence.

## Constitution check

- **OFF-1:** the query is in a body, never an address; no log, event or error carries it; Voyage failures log the status only; recent searches are device storage.
- **OFF-3 and SEC-2:** every arm reads through `readable_content`, `readable_notes`, `active()` or `thread_members` with the session's account. The request has no account, thread or scope field.
- **SEC-1:** terms are letters and digits; the tsquery and pattern are bound parameters; `LIKE` wildcards are escaped. The Voyage key is environment.
- **OFF-8:** the model's search keeps `ANSWER_RESULTS` and `ANSWER_SETS`; only its configuration name changes.
- **OFF-7:** tokens only, and the divergences are logged.
- **QUAL-1:** see `tasks.md`; each task opens with its failing test.
- **Evals:** the planner prompt changes one word and the model's search folds accents, so `apps/agent/evals/` gains a case for each (a question about *cafe* finds *Café Lisboa*; deleting a thread names *Threads*). Running them is a separate ask.

## Reuse and skips

| Piece | Rung | Where |
| --- | --- | --- |
| Accent folding | Platform | `unaccent`, a text search configuration, `SET EXPRESSION` |
| Word matching | Already here | `search_text` and its GIN indexes (0027) |
| Fusion and archived piles | Already here | `fuse()` and the content arms, lifted out of `search()` |
| Note lifecycle filter | Already here | `asidesFor`'s `noteFilter` |
| Memory scope | Already here | `active()` in `memories/store.ts` |
| Vector arms | Already here | the chunk and memory HNSW indexes, `read.ts`'s queries |
| Query embedding | New code, small | `search/embed.ts`, a `fetch`; the agent's client is Python and the Core API cannot call it |
| Route | New code | `routes/search.ts`, one POST |
| Embed budget | New code, small | an in-process counter, with its `shortcut:` |
| The field | Already here | Memories' field, lifted into `SearchField` |
| Composer fill | Already here (web), small (phones) | `FILL_COMPOSER`; `fill()` on the conversation context |
| The mark on a row | Already here | `arrived`, 023 |
| Open at a row | New, small | `through` on the content route; a param on two pages |
| Tab re-tap | Already here | the `resetToday` pattern |
| Recent searches | Platform | SecureStore under `ACCOUNT_KEYS`; `localStorage` |
| The web window's surface | Already here | `WPalette`'s tokens |
| Keyboard inset | Installed | `react-native-keyboard-controller` |

Left out on purpose:
- **A rate limiter dependency.** The words path is bounded by the statement timeout and the client's settling; only Voyage spend needs a budget.
- **Request cancellation.** A sequence number drops stale answers; an ignored answer costs one small read.
- **A new index.** Its trigger is stated.
- **Typo tolerance** (trigrams), offered and not chosen.
- **A search event, a query log, a server-side recent list.**
- **Thread names by meaning.**
