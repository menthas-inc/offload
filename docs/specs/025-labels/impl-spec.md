# 025 Labels, implementation spec

**Status:** drafted 2026-09-26 from the revised feature spec, after `GATE: PASS`
**Reads with:** `feature-spec.md` in this folder; `docs/tech/decisions.md` (OFF-6 allowlist, the 2026-09-10 compaction entry, the tool budget entry of 2026-09-11, the 016 provenance entry); 022's impl-spec for `requireMember` and `requireReadable`; 023's for the absent-versus-null edit route; 024's for `activity`

## Shape of the change

Four parts, built in this order, each shippable:

1. **Retire** `tags`, `groupBy`, 018's tag field. Pure removal, and it frees the tool budget the label tool needs.
2. **The person's labels**: schema, routes, the row, the sheet, the label's list, the filter bar, Today, the timeline, `#` on a thread.
3. **Live filing**: one model tool, `#word` from Today, the turn footer, `undoTurn`.
4. **The nightly sort**: its job, its endpoint, Activity's first Undo.

Parts 3 and 4 are the offload track the owner put last; part 2 ships without them.

## Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | Labels: 0 on most threads; a thread that has any holds 3 typical, 10 at most (enforced). An account of 40 threads typical holds about 30 labels; 300 threads heavy, about 400. |
| Fan-out | Rows per thread: 15 typical, 500 heavy (001). Labels per row: 0 to 1 typical, 3 heavy. Joins per thread: about 15 typical, 1,500 at the heavy ceiling (500 rows, 3 each). Rows per label: 5 typical, 500 heavy. Deleted labels kept 30 days: a handful per thread. |
| Growth | Joins track content: an active account adds about 20 rows a week, so about 20 joins a week once labelled, about 2,000 over two years. Labels themselves stop at 10 per thread. `label_runs`: at most one nightly per changed thread per day plus one per labelling turn; about 15 a week for an active account; purged at 30 days, so bounded at about 60 live. |
| Read pattern | Thread page: every content page (30 rows) and the notes in the bundle carry each row's label ids; the bundle carries the thread's labels with counts. Today: its agenda rows carry label ids and the labels they name. The label's list: pages of the thread's rows with ticks. Model plane: the thread's labels (at most 10) in the turn context. Nightly: one thread's recent rows, bounded. |
| Write pattern | Person: bursty and tiny, a sheet or a list save, one statement per save, at most 500 joins in the largest list save. Live: a few joins per turn. Nightly: at most the budgeted rows per thread per day. |
| Sort and filter | Labels by thread, in creation order, not deleted. Joins by row (to draw marks), by label (the list, counts), and "rows of this thread carrying any of these labels" and "carrying none" for the filter. Counts per label per thread for chips, excluding archived and deleted rows and non-listed notes. Runs by thread and by turn. Deleted labels by name per thread (offload's refusal) and by `deleted_at` (purge). |

**Pagination.** The thread's content stays server-side, cursor on id, 30 per page (`PAGE`), and gains the filter as a parameter, so a narrowed list pages exactly as an unnarrowed one. The label's list reads through the same endpoint with `ticksFor` set (below). Labels per thread are at most ten and return whole. Notes stay in the bundle, whole, as today, and are filtered client-side, which is correct because the bundle holds every active note.

**Indexes.**
- `labels (thread_id, created_at) where deleted_at is null`, and a unique index on `(thread_id, lower(name)) where deleted_at is null`, and a unique index on `(thread_id, colour) where deleted_at is null`. Every label write takes the thread's row `for update` first, so two writes to one thread run one after the other and the second sees the first. The two uniques are the backstop for AC-2 and AC-3: a write that ever skipped the lock still loses at the database, and `takenOnConflict` turns that into `label_taken`.
- `content_labels (content_id, label_id)` primary key, which serves the marks per row; `content_labels (label_id, content_id) where removed_at is null` for the list, the counts and the filter's `exists`.
- `note_labels` the same two.
- `label_runs (thread_id, created_at)` and `label_runs (turn_id) where turn_id is not null`.
- The filter predicate is `exists (select 1 from content_labels cl where cl.content_id = content.id and cl.label_id = any($ids) and cl.removed_at is null)`, which rides the primary key per row inside the existing `content_thread_idx` scan. No label id on `content` itself.

**Normalisation.** Counts are computed, not stored: one grouped count over `content_labels` joined to live content for one thread is at most 1,500 join rows at the heavy ceiling, run once per bundle read. A stored count would need every row delete, archive, move and restore to maintain it, which is four writers for one number. Revisit if the bundle read shows it.

**Partitioning.** None.

## Data model

Migrations `0060_tags_retire.sql` (the retirement, with `readable_content` dropped and recreated around the column, since it is `select content.*`) and `0061_labels.sql`:

```sql
create table labels (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references threads(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 24),
  colour        smallint not null check (colour between 1 and 10),
  set_by        text not null check (set_by in ('person', 'offload')),
  created_by    uuid references accounts(id) on delete set null,  -- OFF-3: who wrote the name; null for offload
  run_id        uuid,                                             -- the sort that created it, null for a person
  touched_by_person_at timestamptz,                               -- a person renamed or recoloured it
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_by_person boolean not null default false,
  purge_after   timestamptz
);

create table content_labels (
  content_id    uuid not null references content(id) on delete cascade,
  label_id      uuid not null references labels(id) on delete cascade,
  set_by        text not null check (set_by in ('person', 'offload')),
  run_id        uuid,                 -- the sort that set it
  removed_at    timestamptz,          -- soft removal: a tombstone for a person, a restorable state for Undo
  removed_by    text check (removed_by in ('person', 'offload')),
  removed_run_id uuid,                -- the live turn that removed it
  created_at    timestamptz not null default now(),
  primary key (content_id, label_id)
);

create table note_labels ( ... the same, note_id references notes(id) on delete cascade ... );

create table label_runs (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references threads(id) on delete cascade,
  kind        text not null check (kind in ('nightly', 'live')),
  turn_id     uuid,                   -- live only
  undone_at   timestamptz,
  created_at  timestamptz not null default now()
);

alter table threads add column labels_sorted_at timestamptz;
alter table activity add column label_run_id uuid references label_runs(id) on delete set null,
                     add column undone_at timestamptz;
-- activity.kind gains 'labelled'

alter table content drop column tags;
update threads set attrs = attrs - 'groupBy' where attrs ? 'groupBy';
-- questions.field loses 'tag': delete open tag questions, then narrow the check
```

- **One row per (row, label), ever.** A person removing a label sets `removed_at` and `removed_by = 'person'` and keeps the row: that is the tombstone offload reads (AC-26), and re-applying clears it and stamps `set_by = 'person'`. `content_labels.set_by` is the last writer.
- **Soft label delete.** `deleted_at`, `deleted_by_person`, `purge_after = now() + 30 days`. The joins are untouched by a delete and are hidden by the label's `deleted_at`; Undo clears `deleted_at`, and the purge job hard-deletes the label, cascading its joins. The unique indexes are partial on `deleted_at is null`, so a new label may take a deleted one's name and colour; offload's refusal to re-create a person-deleted name reads the deleted rows.
- **`created_by`** makes the name resolve to an author (OFF-3). Account deletion sets it null; a label in a private thread goes with the thread, one in a shared thread stays, as content does.
- **Moving a row** leaves its join rows where they are. Every read returns a label only on a row in the label's own thread (`l.thread_id = content.thread_id`, in the marks, the counts and the filter), so a moved row shows none of its old labels, and moving it back, by Undo or by hand, shows them again with nothing to restore. Changed during the build from deleting the joins on move, which needed a restore path the reads make unnecessary (DEV-1).
- **Account-scope notes** cannot join: enforced by the write statement (below) and by a trigger-free check, not a foreign key, since `notes.scope` is a column.

## The write path, one function

`apps/core-api/src/threads/labels.ts` holds every write, called by the person routes, the dump route and the tool route alike, so there is exactly one place that enforces AC-1 to AC-6 and AC-26.

```ts
applyLabels(trx, { actor: { accountId, via: "person" | "offload", runId? },
                    threadId, rows: { content?: string[]; notes?: string[] },
                    add: string[], remove: string[] })
```

- **Resolution in one statement.** The label ids and row ids are selected together with `labels.thread_id = $thread`, `content.thread_id = $thread` (and for notes `scope = 'thread' and subject_id = $thread`), not deleted, and the thread passing `memberOf(accountId)`. Any id that does not come back is refused as `not_found`, the whole write rolls back (AC-4, AC-5). `threadId` itself comes from the row for person routes and from the job's resolved thread for tools, never from a body that also names rows.
- **`via` is a parameter of the caller, never of the body.** Session routes pass `person`; `/tools` and `/internal` pass `offload` (AC-6).
- **offload's refusals**, when `via = 'offload'`: a join whose current `set_by = 'person'` or whose `removed_by = 'person'` is refused `person_set`; a label with `touched_by_person_at` is refused `person_set` for rename, recolour, delete, which offload has no path to anyway; a create whose name matches a label deleted with `deleted_by_person` and not yet purged is refused `person_deleted`; a create at six or more live labels is refused `label_limit` (offload's six; the person's ten). Refusals carry `declined: true` per the 2026-09-15 entry, so they do not make a turn partial.
- `createLabel`, `renameLabel`, `recolourLabel` (with the swap: one statement updating both rows' colours, deferred-unique so the swap does not trip the index), `deleteLabel`, `restoreLabel` sit beside it with the same resolution and the same `via`.
- **Name normalisation** is one function shared by every path: trim, collapse whitespace, drop a leading `#`, refuse control characters (`\p{Cc}`) and length outside 1 to 24 as `bad_label_name`.

## Interfaces

### Person routes, Core API

All under `requireMember` for the thread the label or row resolves to; all return the previous state for Undo.

| Route | Body | Returns |
| --- | --- | --- |
| `POST /v1/threads/:id/labels` | `{ name, colour? }` | the label |
| `PATCH /v1/labels/:id` | `{ name?, colour? }` (absent unchanged) | the label and its previous name and colour, plus the other label's id if a colour swapped |
| `DELETE /v1/labels/:id` | none | `{ deleted: true }` |
| `POST /v1/labels/:id/restore` | none | the label; only for the member who deleted it and within thirty seconds of the delete (the eight-second Undo plus the round trip), otherwise `label_gone`; a label a sort's Undo took back is never restored by id |
| `POST /v1/labels/:id/rows` | `{ add: {content: [], notes: []}, remove: {content: [], notes: []}, name?, colour? }` | the previous name, colour and the rows whose state changed, which Undo sends back reversed |
| `PATCH /v1/content/:id` | gains `labels?: string[]` (absent unchanged), the full set for that row, diffed server-side into add and remove | 023's previous values plus `labels` |
| `PATCH` note edit | the same `labels?` | the same |

The label's list saves through `POST /v1/labels/:id/rows` for an existing label and `POST /v1/threads/:id/labels` followed by it for a new one, in one transaction via a `rows` field on the create. Writing deltas rather than a full set is what lets two members tick different rows (AC-32).

### Reads

- **`GET /v1/threads/:id`** (`threadBundle`) gains `labels: { id, name, colour, count }[]` in creation order, counts from one grouped query over live, unarchived content and listed notes; loses `preference.groupBy`. `counts` gains `unlabelled` for No label.
- **`GET /v1/threads/:id/content`** gains query `labels` (comma-separated ids) and `unlabelled` (boolean), either logic between them, and returns `labels: string[]` on every row. With `ticksFor=<labelId>` it returns every row in the thread (the filter ignored) with a `ticked` boolean, for the label's list.
- **Every response schema carrying a content row or a note** gains `labels: string[]`: the content row schema at `routes/threads.ts:277`, `noteSchema`, the agenda row in `routes/notifications.ts` (which also gains `threadLabels: {id,name,colour}[]` for the labels its rows name, since Today has no bundle), the turn result's filed rows in `routes/dumps.ts`, and the tool results the agent reads. A Fastify schema drops what it is not told about, so the implementation lists each one in the PR.
- The turn result gains `labels: { id, name, colour }[]`, what the turn applied in order, which both footers read.
- **Calendar events** (`/v1/threads/:id/events`) carry no labels; with any filter other than All the clients hide them, since a calendar's event is neither Lisbon nor unlabelled in any sense a person means.

### The dump route

`POST /v1/dumps` gains `labels?: ({ id: uuid } | { name: string })[]`, max 10, beside `mentions`, kept on the message's `attrs` for a thread dump only. The turn result (`/internal/v1/turn-result`) resolves them once the rows exist (`applyTurnLabels`), per thread each row landed in: an id only where the label is that thread's, a name matched or made there under the person's ten. On a Today dump it has no thread yet: the client sends nothing structured, and after the turn files, the Core API scans the message text for `#word` tokens (the same tokenizer the clients use, one shared function in `@offload/widgets`) and applies them by name in the thread the turn filed into, creating where there is room, `via: 'person'`. What was applied is recorded in a `label_runs` row of kind `live` for the turn, set by the person, so `undoTurn` reverses it the same way it reverses the model's.

### The model plane

- **One tool, `label_content`**: `{ content_ids: uuid[] (max 30), add: label_id[] (max 10), new: name[] (max 5), remove: label_id[] (max 10) }`. `new` is its own list rather than a union inside `add`, because the definition builder strips `$defs` and a nested model would leave a dangling reference. One tool, not the handoff's three, because the definition budget holds one: measured 2026-09-26 at 1,741 of 1,800 with `tags` and `group_by` together costing about 80, so after retirement there is about 140 tokens of room. The tool's definition is written to fit in that; the guard test measures it. If it does not fit, `label_content` moves behind `defer_loading`, as `plan.py`'s comment prescribes, and the number does not move (AC-30).
- **The thread's labels reach the model as data**: the turn context's user block gains a `labels` list of `{id, name}` under the existing untrusted-data marker, beside `mentions` in `context.py`. The tool's schema says label ids and never lists names (AC-24).
- **The Core API's tool handler** resolves through `applyLabels(via: 'offload', runId)` with the turn's run, and for each `new` name runs the **provenance check**: the name, normalised and case-folded, must appear as a word sequence in the text of the message the turn is filing (`messages.text` for the turn's message), by `nameInDump`: every word of the name, lowercased and matched on Unicode letters and digits, is a word of the message, and a link's words do not count. Only the Core API checks it, so there is no second copy in the agent to keep in step. Otherwise `not_in_the_dump`, declined. The eval runner's stub runs the same rule, so a case cannot pass a model that invents labels.
- **The filing prompt** loses its tags guidance and gains two lines: apply the thread's labels where a dump clearly belongs, create one only when the person names it, and never label something they took a label off. The prompt is a request; `applyLabels` is the enforcement.
- **`undoTurn`** gains: for every `label_runs` row with this `turn_id`, delete the joins it set that are still `set_by = 'offload'` and `run_id` = it (or `person` for a person's `#` run), restore joins it removed (`removed_run_id` = it) by clearing `removed_at`, soft-delete labels it created that no live join outside the run carries, and set `undone_at`. Inside the existing transaction.

### The nightly sort

- **Enqueue.** The existing daily run in `jobs/handlers.ts` (which enqueues `notes.compact` per account per thread) also enqueues `labels.sort` per thread, keyed `labels.sort:{thread}:{day}`, once per thread rather than once per member, for threads where `max(content.updated_at) > coalesce(labels_sorted_at, '-infinity')` and the thread has at least six live rows. The job's `account_id` is the member whose daily run found it first; it is used only for the claim-time membership check and the per-account queue cap.
- **The worker**, `apps/agent/src/offload_agent/label_sort.py`, `KINDS = ["labels.sort"]`: at claim, confirm the job's account is still an accepted member of the thread (`thread_members.state = 'accepted'`), else finish with nothing read. Read the thread's labels (at most ten) and its **200 most recently updated live, unarchived content rows**, id, type and title only, never a body and never a note, `LABEL_SORT_BUDGET = 200`, the same shape as `compact.py`'s `BUDGET`. One model call with a forced tool whose input schema is `{ create: [{ name, rows: [row_id] }], apply: [{ label_id, rows: [row_id] }] }`, validated with one repair retry (OFF-5). The prompt, `prompts/label_sort.md`, is frozen and system-side; the rows and labels travel in the user block under the data marker. No log line carries a title or a name: counts and error types only, as `compact.py` does.
- **The endpoint**, `POST /internal/threads/:id/labels/sort`, internal token, takes the validated plan, creates a `label_runs` row of kind `nightly`, and calls `applyLabels(via: 'offload', runId)` per entry, dropping (not failing on) entries refused as `person_set`, `person_deleted` or `label_limit`, and ignoring any `remove`, which the schema does not have. It sets `threads.labels_sorted_at = now()` whether or not anything changed. If anything was applied it records one Activity row per accepted member (below). The model's choice of *whether* a thread holds more than one subject is judged by eval cases, not code.
- **Model.** The same model `notes.compact` uses, from `docs/tech/stack.md`, so this adds no new processor; cost is one call per changed thread per day, bounded by the 200-row budget.

### Activity, amended

- `activity.kind` gains `labelled`. `record()` is called with `sent: false`, `reason: 'design'`, `threadId`, and the new `labelRunId`, for every accepted member. Being unsent, it never reaches `push.ts`. Carrying `thread_id` means `purgeAbout` removes it when a member leaves or is removed.
- Words are composed once, at the moment of the run, by one function in `notifications/copy.ts`: *Sorted {thread} into {A}, {B} and {C}. {N} labelled.* and *Labelled {N} in {thread} under {A}.* Counts under ten as words, as the design's copy writes them.
- **`POST /v1/activity/:id/undo`**: the row must be the caller's and `labelled`, not older than 30 days, not already undone; the caller must still be an accepted member of its thread (`requireMember`); then in one transaction revert the run as `undoTurn` does for a live run, except that joins a person has since touched (`set_by = 'person'` or `removed_by = 'person'`) and labels with `touched_by_person_at` are left alone, and set `activity.undone_at` on **every** row with that `label_run_id` and `label_runs.undone_at`. This is the first cross-account write to `activity`; it is correct because the rows describe the same thread-level change and the writer has passed the thread's membership check.
- The clients render *Undone* from `undone_at` in the tag slot, and the Undo control only while `undone_at` is null and the row is under 30 days old. The words are never rewritten. 024's AC-18 ("inert or a door") is narrowed in 024's feature spec in the same change to "and a labelled row carries Undo".
- **Purge.** `label_runs` purges at 30 days with Activity's own sweep; `activity.label_run_id` is `on delete set null`, and a row without a run cannot be undone.

### Clients

**Shared (`@offload/widgets`):** the `#` tokenizer (end-of-draft token, and the server's scan for Today), the name normaliser for immediate validation, `labelFilter` state helpers, and the loss of `parseTag`, `dimensionsIn` and `groupBy`.

**Both phones (`apps/mobile`):**
- `components/shell/Chip.tsx`, new, with `Platform.select` for the iOS pill and the Android M3 filter chip, `min-height`, `label` colour prop per the contract.
- `components/shell/LabelMark.tsx`, new, sizes 20, 24, 30.
- `ContentRow.tsx`: a `labels` prop, the marks line after `DateChip`, the `tag` tool first among the tools on every unlabelled row including door and archived rows, `hitSlop` raised so every tool's target is 44.
- `LabelSheet.tsx` (the one row sheet) and `LabelList.tsx` (the many rows sheet, a `FlatList` paged from `/content?ticksFor=`, keyboard handled for edge to edge, following the waitlist fix).
- `FilterBar.tsx` under the app bar in `screens/Thread.tsx`, sticky, the pinned `plus`, the kept pick in the same device store the thread's other device preferences use, keyed by thread.
- `Composer.tsx`: a `LabelList` for `#` alongside `MentionList`, sending `labels` with the dump.
- `Conversation.tsx`: the footer's marks at 30 after the thread pill, three plus a count.
- `Timeline.tsx`: the anchor dot rule; the rail narrows through the filtered rows.
- `screens/TodayAgenda.tsx`: rows receive `labels` from the agenda's `threadLabels`.
- `screens/Activity.tsx`: the `labelled` row with its Undo control and *Undone* in the tag slot.
- The `tag` glyph through `scripts/icons.mjs`, and `dead-icons.mjs` run.

**Web (`apps/web`):** the same list against `ContentRowView.tsx`, `RowTools.tsx`, `Thread.tsx` (the filter bar under `PaneHead`, sticky), `Widgets.tsx` (bare tags out of the meta, `groupBy` out), `Timeline.tsx`, `Today.tsx`, `Activity.tsx`, `shell/TurnFooter.tsx`, the composer; the label sheet as a popover and the list as a modal, both with focus management; a chip's context menu and the picked chip's `pencil`; the kept pick in `localStorage` wrapped in try/catch, keyed by thread.

## Dependencies

- No new package on any surface. Virtualised lists use `FlatList` on the phones and the web's existing list pattern. No gradient.
- Tokens: `--label-1` to `--label-10` already flow through `pnpm tokens` (checked after the sync: present in `tokens.css`, `nativewind.css` and the preset).
- No open decision at the bottom of `docs/tech/decisions.md` is assumed: the feature touches none of encryption custody, the warehouse or the connector OFF-4 seam.

## Edge cases

- **A label deleted between a list open and its save:** `label_gone`, the client closes the sheet and toasts.
- **Two members creating the same name at once:** the thread lock runs them in turn and the second is refused as `label_taken`; the unique index is the backstop.
- **Colour swap under a race:** the swap runs under the thread lock, parking one label with a temporary `deleted_at` while the other takes its colour, so no concurrent write sees two labels on one colour.
- **An eleventh label from a `#` pick on the phone that thought there was room:** `label_limit` on send; the dump itself still files; the footer shows no mark; the composer's list is refreshed next time the thread loads.
- **A row moved while its label sheet is open:** the save's resolution finds the row in another thread and refuses `not_found`; the client toasts *Couldn't save that* and closes.
- **A note folded while labelled:** `applyCompaction` inserts the new note, then copies the union of the superseded notes' live joins with `set_by = 'offload'` unless any source join was `person`, in which case that label's join is `person` (AC-29).
- **A member removed who had labelled rows:** nothing changes on the labels; their Activity rows purge with 024's rule.
- **A thread whose last member leaves:** the thread cascade removes labels, joins and runs.
- **A `#` in the middle of a word or a number** (`#3`, `a#b`): not a token; the tokenizer requires start of draft or whitespace before `#` and a letter after it.
- **An agenda row on Today in a thread with ten labels:** it carries only its own labels; `threadLabels` is only the ones the agenda's rows name.

## Constitution check

- **SEC-1:** label names reach the model only in the user block under the data marker; the tool schema carries ids; every SQL value is bound; the provenance check bounds creation by the dump's own words.
- **SEC-2:** one write function resolves label, row and membership in one statement; `via` comes from the route; the Activity Undo rechecks membership.
- **DATA-1:** this document, before code.
- **OFF-1:** names and titles never in `console.log`, analytics, traces, error reports or `jobs.last_error`; the worker and the endpoint log counts and error codes; Activity rows are unsent. offload deletes only labels it created that nobody touched.
- **OFF-3:** membership-scoped; `created_by` on `labels`; account deletion follows the thread rules.
- **OFF-5:** the nightly plan and the live tool are validated schemas with one repair retry.
- **OFF-6:** person writes have the eight-second toast; live labels sit inside 004's whole-turn Undo; the nightly sort is added to the reversible allowlist in `docs/tech/decisions.md` in the same change as a sibling of the 2026-09-10 compaction entry, with its Undo in Activity; nothing leaves offload.
- **OFF-7:** the design log entries listed in the feature spec land with the code that diverges.
- **OFF-8:** the live context gains at most ten names of 24 characters; the nightly read is capped at 200 rows.
- **QUAL-1:** every task in `tasks.md` starts with its failing test.

**Principles the eval set gains:** a new principle file, `apps/agent/evals/principles/NN-labels.json`, with cases for applying an existing label, creating only a named one, not creating from an unnamed subject in a live turn, respecting a removal, and for the nightly sort, labelling a three-city thread and leaving a one-subject thread alone. The tag assertions in the current cases are rewritten or removed. Running them is a separate ask.

## As built

**As built:** the nightly sort shipped 2026-09-27, switched off the same day, deleted by 032 on 2026-10-02 with its job, worker, prompt, endpoint, switch and evals. What stays is the live-turn labelling, whose `labelled` Activity row keeps its Undo.

Divergences found during the build, each folded into the sections above or recorded here, and the decision-log entries they need are in `at-merge.md`.

- **Migrations** are `0060_tags_retire.sql` and `0061_labels.sql`; `readable_content` is dropped and recreated around the column drop, since it is `select content.*`.
- **Moving a row keeps its joins**; the reads filter by the row's own thread, so moving back restores them with nothing to write.
- **A dump's `#` picks** are resolved at `/internal/v1/turn-result`, once the rows exist, per thread each row landed in.
- **The turn footer's labels** ride the stream's `done` event, the single-message read and the conversation tail, from `labelsForTurns`, only in threads the viewer is in and never for an undone turn.
- **The nightly endpoint** is `/internal/v1/labels-sorted`, closing its own job as `notes-compacted` does. A plan whose rows all turn out refused leaves no empty label behind: the sort's own labels are taken back.
- **Activity's Undo** is `POST /v1/activity/:id/undo`: the caller's own `labelled` row, still in the thread, under thirty days, not undone; else 404 or 409.
- **The privacy page's date and `CONSENT_VERSION` move together** to 27 September 2026; a web test holds them to the same day.
- **The tool set measures 1,798 of 1,800.** No `defer_loading` was needed; the next tool will need it.
- **Evals:** principle 25 (six filing cases) and principle 26 (four overnight cases on a new `label_sort` surface) are written and have not been run.

## Amended 2026-10-07

`GET /v1/threads/:id/content?ticksFor=` filters done rows and events whose last day is before today unless the label carries them (`apps/core-api/src/routes/threads.ts`). The web's `EditModal` takes `labels` and saves through `withMadeLabels`, moved to `@offload/widgets` so both clients share it; `LabelPopover` gains `made` and `align`. See the feature spec's amendment of the same date.
