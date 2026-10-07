# 040 The Memories tab, impl spec

**Status:** drafted 2026-10-06 from the reviewed feature spec, against `main` at `066aca5`. Migration `0086` is claimed on the board. **Four parts, four PRs:** A, B, C, D, as the feature spec's table has them.

## Data flow

```
Part A                        Part B                       Part C                        Part D
tab ──► /v1/memories ──► store.ts ◄── tool / pass      sweep ──► embed.memory ──►    daily run ──► layout.ts
         GET POST PATCH          (one write path)      notes.embedding (worker)      pgvector distances
         DELETE restore                                 turn: count > 50 ?           ──► notes.place_dx/dy
                                                          embed the person's words   GET: no place ──► beside
                                                          (300ms) ──► rules, own,      nearest neighbour
                                                          learned by distance
```

## Data model

**Migration `0086_memories_tab.sql`:**

- **Five kinds.**
  - `update notes set kind = 'about' where scope = 'account' and kind = 'words';`
  - Drop and recreate `notes_kind_check` with the account branch as `('people','things','about','rules','patterns')`.
- **The embedding and the place, on the memory's own row.** A memory is one sentence, so one vector.
  - `alter table notes add column embedding halfvec(1024), add column embedding_model text, add column embedded_at timestamptz, add column place_dx real, add column place_dy real, add column placed_at timestamptz;`
  - A check: all six null unless `scope = 'account'`. The search corpus (`note_chunks`) never holds a memory.
  - **No vector index.** At most 300 rows an account behind the `subject_id` index, so a flat scan; an HNSW graph would cost upkeep for nothing (DEV-1).
- **The agent role.** It already reads `notes` whole. It gains `update (embedding, embedding_model, embedded_at) on notes`: an index of a row, written by the sweep's job as `note_chunks` is today. `agent-role.test.ts` asserts it can write those three columns and nothing else of `notes`.
- **`readable_notes` is made again** to carry the new columns, still thread scope only.

**Shared constants** go in `packages/widgets/src/memories.ts`, imported by the Core API and all three clients:
- `MEMORY_KINDS` (order, hue token, glyph);
- `MEMORY_CAP = 300`, `RULES_CAP = 20`;
- `ROW_PITCH = 58` and `COLUMN_PITCH`;
- `memoryWorld` (the tall and wide placement of the kinds and their radii, computed from each kind's extent);
- the zoom range and the 0.55 threshold.

## Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | 10 to 60 typical, 300 at most (the cap); at most 20 rules and 25 learned. About 60 KB of sentences at the cap, and 2 KB of `halfvec` a row. |
| Fan-out | One account, one set; five kinds; a kind holds at most 300. |
| Growth | Typing, asking and five learned a night, flat at the cap. |
| Read pattern | **The tab:** `GET /v1/memories` once per open, everything, about 60 KB at the cap, unpaginated *because* of the cap. **A turn:** a count, then the rules (at most 20), then at most 50 ordered by distance, a flat scan of at most 300. **The passes:** the same shape once a night. **The layout:** a distance matrix per kind, at most 300 squared (90k distances, computed in Postgres), once a night. |
| Write pattern | Interactive adds, changes and forgets; one embedding per write, within a sweep; one layout per account a night. |
| Sort and filter | `subject_id = account and scope = 'account' and deleted_at is null and superseded_at is null` (the existing `notes_account_memories` index), then `kind`, `origin`, `embedding <=> q`, `created_at`. |

**What follows from these numbers:**
- **Pagination:** none; the cap bounds the list.
- **Indexes:** the existing partial index only.
- **Normalisation:** nothing denormalised; the counts the tab shows are computed client-side from the one list.
- **Partitioning:** none.

## Interfaces

### Core API

**`memories/store.ts`** gains these, every one scoped `scope='account' and subject_id = account and account_id = account`:
- **`listMemories(accountId)`**: every active memory, with `source`:
  - **`message`:** the thread its message landed in, from `message_threads.landed`, then its `looking_at_thread_id`;
  - **`note`:** the note's thread;
  - **`answer`:** the question's text;
  - **`none`:** nothing.

  A thread is named only if the account is an accepted member, and the default thread reads as not in a thread. It also carries `place` and the cap state. It never returns `calendar_id` or a calendar name.
- **`addMemory(trx, { accountId, text, kind })`:**
  - `shaped()` and the People rule first;
  - then the rules cap, then the duplicate pre-check, then the cap;
  - at 300 it retires the oldest learned memory (`deleted_at`, `purge_after now()`) or refuses `memories_full` when none is learned.
- **`changeMemory(trx, { accountId, id, text?, kind? })`:**
  - the same checks;
  - learned to `stated`, recording `derived_from_message_id` in `memory_forgotten` then clearing it;
  - an answered memory's text change sets `origin='stated'`, `calendar_id=null`, and removes `attrs.with`;
  - a changed kind or text clears `place_*` and `embedded_at`, so the sweep re-embeds it and it is placed afresh.
- **`forget()`** takes a nullable `messageId`. A tab forget stamps `attrs.forgot_by = 'tab'` and records the source in `memory_forgotten` when there is one.
- **`restoreMemory(accountId, id)`** restores by id while `attrs.forgot_by = 'tab'` and `purge_after > now()`.
- **`remember()`, the turn's tool:** the same rules cap and 300 logic, refusing `rules_full` and `memories_full`. `applyMemoryPass` adds nothing at 300.

Every duplicate is checked by select before writing; nothing catches a 23505.

**`routes/memories.ts`** (new), all under the session (`requireAccount`, the first-run and disabled gate) with JSON bodies:
- `GET /v1/memories`;
- `POST /v1/memories` with `{ text, kind? }`;
- `PATCH /v1/memories/:id` with `{ text?, kind? }`;
- `DELETE /v1/memories/:id`;
- `POST /v1/memories/:id/restore`.

Refusals are 200s with `{ ok: false, error }`: `empty`, `too_long`, `never_list`, `duplicate`, `rules_full`, `memories_full`. Not found is a 404. Logs are the route, the outcome and the kind; never text.

**The memory tool's refusals** `rules_full` and `memories_full` join the tool route's enum, the worker's `ARGUMENT_REFUSALS`, and the prompt's fixed lines.

**`search/sweep.ts`** gains a memories corpus: active account-scope notes where `embedded_at is null or embedded_at < updated_at`, booked as `embed.memory` jobs, the version being `updated_at`. **`memories/layout.ts`** (Part D):
- **The distances:** `layoutMemories(accountId)` reads each kind's ids and pairwise `embedding <=> embedding` in one query.
- **The projection:** two dimensions by classical scaling, with a deterministic power iteration from a fixed start vector, ties by id.
- **The rows,** in a grid sized to the kind, one sentence per row (*corrected while building Part D, 2026-10-06*: the first draft fitted columns inside the handoff's fixed cloud radii, which hold about five memories a kind):
  - `gridOf(n)`: `round(sqrt(n × ROW_PITCH / COLUMN_PITCH))` columns and as many rows as that needs, so a kind is about as tall as it is wide;
  - columns are filled by the second coordinate and the rows inside a column ordered by the first, ties by id, what has no embedding last;
  - columns sit `COLUMN_PITCH` apart and rows `ROW_PITCH` apart, centred on the kind. No nudge: a nudge put sentences in two columns within a sentence's width of each other.

  A kind of thirty is two columns of fifteen; one of 300 eight columns of 38. **The clients size each cloud from its kind's extent and place the kinds** (`memoryWorld` in the shared module), so the handoff's fixed centres and radii are not used: tall stacks the kinds down the world, wide lays them in rows, and no two clouds overlap. It writes `place_*` and `placed_at` and is called at the start of `accountDailyRun`.
- **Between nights:** `listMemories` places a memory with no `place` beside its nearest placed neighbour in its kind (`dy + ROW_PITCH`, the same `dx`), or below the kind's lowest row when it has no embedding. It is computed on read and not stored.

### Agent

- **`embed_jobs.py`** gets `embed.memory`. It embeds the sentence (`input_type="document"`) and updates `embedding`, `embedding_model` and `embedded_at` on the row, guarded by `updated_at = :version`.
- **`context.py`**, `memories_for(conn, account_id, query_text)`:
  - **Fifty or fewer:** count, and if at most 50 return all, rules then own then learned, newest first, with no embedding call.
  - **Otherwise:** rules (newest, at most 20), then the query embedding, started by `start_memory_query` as soon as the turn's words are read and waited for at most 0.3 s once the rest of the context is loaded (`QUERY_SECONDS`), the call itself bounded at 2 s (`QUERY_LONGEST`).
  - **With a vector:** the rest ordered by `(origin = 'learned'), embedding <=> q nulls last, created_at desc`, to 50.
  - **Without one:** `(origin = 'learned'), created_at desc`.
  - `DumpContext` and `AnswerContext` carry `rules` and `known` separately.
- **Query text, one place, `query_words(ctx)`:**
  - **A dump:** `ctx.dump`, or `mail.note` for mail, never the forwarded body.
  - **An answer:** the question.
  - **The memory pass:** its messages' texts joined.
  - **The thread pass:** the thread's name and its own trusted notes joined.

  Every one is cut to 2,000 characters.
- **`embed()` takes a timeout.** The query call passes 2 s with no retry, and the turn waits 0.3 s for it after its context load; `EmbeddingUnavailable` and a timeout are the same fallback, logged as an outcome.
- **`plan.py` `memories_block`** becomes two blocks: the rules, with `cache_control`, then the known memories with none. The known block's header says a memory in the first person is the person speaking.
- **`memories.py`** (the pass): its `Kind` is people, things, about and patterns. `read()` uses `memories_for` with the messages' words. `prompts/memory.md` folds *words* into *about*. `harness/tools.py` drops `words` from the tool's `kind`. `nightly.py` uses `memories_for` with the thread's words.

### Clients

**Web:**
- `components/panes/Memories.tsx` and `memories.module.css`;
- `components/memories/{MemoryRow,MemoryEditor,KindGrid,Origin,MemoryMap}.tsx`;
- `lib/memories.ts` (the client and its types).

The sidebar row is enabled and routed to `/memories`. `PaneHead` carries search and plus, and the editor is the right-hand pane. The map is DOM: buttons in a world `div` transformed by pan and zoom, and clouds as CSS radial gradients with `mix-blend-mode: multiply` in light and `screen` in dark.

**Mobile:**
- `app/(tabs)/memories.tsx`, with `notes.tsx` redirecting;
- the `Shell.tsx` tab key `memories`, label Memories;
- `components/screens/Memories.tsx`, `components/memories/{MemoryRow,MemoryEditor,KindGrid,Origin,MemoryMap}.tsx`, `lib/memories.ts`.

The editor is a `DragSheet` with `keyboard="lift"`; the swipe is `SwipeRow` at 88. The map is a Skia canvas for the ground and the clouds (`BlendMode.Multiply` or `Screen` by theme), with Reanimated-transformed `Pressable` pills and dots over it. The gestures come from `react-native-gesture-handler`, as the thread map's are.

## Dependencies

- `@offload/widgets` for the shared constants, which the Core API already imports.
- No new packages. The phones have Skia, Reanimated and gesture-handler; the web uses the DOM.
- No open decision in `docs/tech/decisions.md` blocks this. The new entry is: memories embedded on their own row; the per-turn query; the caps; the layout in the Core API; the agent's update grant; and OFF-6's allowlist gaining "the cap retires the oldest learned".

## Edge cases

- **A sentence changed during a sweep.** The `updated_at` guard drops the stale embedding, and the next sweep embeds the new one.
- **A kind with one memory.** It lays out at the centre.
- **A kind with 300.** Five or six columns inside the kind's area, never 17,000 units of rows; the cloud is drawn around the columns' extent. Neighbouring kinds' centres are far enough apart in both worlds for six columns; the shared module's test asserts that no two kinds' extents overlap at the cap.
- **Forget, then Undo after the purge.** A 404; the toast is long gone by then.
- **A thread note's id on a memory route.** A 404, through the scope predicate.
- **The default thread as a source.** "Not in a thread", never its stored name.
- **The query service down for an hour.** Turns use rules then the newest, the sweep retries, and nothing waits on it.

## Constitution check

| Principle | How |
| --- | --- |
| DEV-1 | One table, no vector index, no new package, layout in TypeScript over database distances. |
| DEV-2 | The amendments are listed in the feature spec and land with each part. |
| QUAL-1 | Every task opens red. Part C's cast case is the reach change's measure. |
| SEC-1 | The memories block stays a user-turn block. Query text is the person's words only. |
| SEC-2, OFF-3 | Routes take the account from the session and resolve by scope; 404 otherwise; a test per route. |
| OFF-1 | No text in logs or events. Voyage is named for what it receives before Part C. The exception ends at Part B. Own before learned. |
| OFF-4 | No connected-app text as a query. |
| OFF-6 | A tab forget has its restore; the cap's retirement is on the allowlist on compaction's terms. |
| OFF-7 | Design log entries for each divergence; the bundle taken selectively. |
| OFF-8 | At most 50 memories in a prompt, from at most 300; the query is bounded at 2,000 characters. |
