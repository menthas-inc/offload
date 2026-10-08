# 025 Labels, tasks

Every task starts with its failing test, run and seen red for the reason the task exists, then the code (QUAL-1). A task is done when its test is green and nothing else is red. Three tracks after the foundation, API, Mobile and Web; the feature closes when all three pass. Parts 3 and 4 (offload) come last and part 2 ships without them.

## 0. Setup

- [x] **T0.1** Worktree `labels` via `.claude/scripts/new-worktree.sh labels`, its own database, launch entries that cd into it. The design system is already synced on `main` (`faa9ef6`); nothing under `.claude/skills/offload-design/`, `docs/tech/` or `docs/constitution/` is edited in the worktree. *(process)*
- [x] **T0.2** Before any code: confirm the privacy page line change with the product owner (feature spec, "The privacy page, as it will read"). *(AC-34, CLAUDE.md)*

## 1. Retire tags and group-by (API, agent, both clients)

- [x] **T1.1 API.** Tests: the thread bundle has no `preference.groupBy`; `PATCH` preference and `set_thread_preference` refuse `groupBy`/`group_by` as unknown; `add_content`/`edit_content` refuse `tags`; 018 never asks a `tag` question and an open one is gone after migration; the content row schema has no `tags`. Then migration `0060_tags_retire.sql` (drop `content.tags`, strip `attrs.groupBy`, narrow `questions.field`), remove `threads/tags.ts` and its imports. *(AC-30, DEV-1)*
- [x] **T1.2 Shared.** Tests in `@offload/widgets` that `widgetsFor` groups nothing and `parseTag`, `dimensionsIn`, `groupBy` are gone (a compile-level test via the package's exports list). Then remove them. *(AC-30)*
- [x] **T1.3 Agent.** Tests: `AddContent`/`EditContent`/`SetThreadPreference` have no `tags`/`group_by`; the tool definition guard still passes and prints the new total. Then remove them, the filing prompt's tag lines, and rewrite or remove the eval cases asserting tags (not run). Correct `embed_jobs.py:105`'s comment. *(AC-30, OFF-8)*
- [x] **T1.4 Web.** Test: a widget row's meta carries no bare tags. Then remove it and `groupBy` from `Widgets.tsx` and `lib/threads.ts`. *(AC-30)*
- [x] **T1.5 Mobile.** Test: `Widgets.tsx` takes no `groupBy`. Then remove it from `Widgets.tsx`, `screens/Thread.tsx`, `lib/threads.ts`. *(AC-30)*
- [x] **T1.6 Docs, on main after merge.** `docs/tech/decisions.md`: the entry retiring 007's grouping and 006's tags. 006 AC-8, 007 and 018 feature specs get a dated "retired by 025" line. *(DEV-2, AC-34)*

## 2. The person's labels

### Foundation (API)

- [x] **T2.1** Migration `0061_labels.sql`: `labels`, `content_labels`, `note_labels`, `label_runs`, `threads.labels_sorted_at`, `activity.label_run_id`, `activity.undone_at`, `activity.kind` += `labelled`, the indexes in the impl-spec. Tests: the partial uniques refuse a second live name ignoring case and a second live colour, and allow both once the first is deleted. *(AC-1, AC-2, AC-3, DATA-1)*
- [x] **T2.2** `threads/labels.ts`: `normaliseLabelName`. Tests for trim, collapse, leading `#`, control characters, 0 and 25 characters, kept case. *(AC-2)*
- [x] **T2.3** `applyLabels` and the label writers. Tests, each red first: a non-member gets `not_found`; a label from thread A on a row in thread B is refused and nothing is written; an account-scope note and another thread's note are refused; `via` is taken from the caller and a body carrying `set_by` is refused by the route schema; an eleventh label is `label_limit`; a taken name is `label_taken`; a new label takes the lowest free colour; a recolour to a taken colour swaps both in one statement; a person removal writes the tombstone; re-applying clears it. *(AC-1 to AC-6, SEC-2, OFF-3)*
- [x] **T2.4** Delete and restore. Tests: delete soft-deletes and hides the label and its joins and deletes no row; restore by id brings back name, colour and joins; restore after purge is `label_gone`; the purge sweep hard-deletes labels past `purge_after` with their joins. *(AC-7, OFF-6)*
- [x] **T2.5** Routes: `POST /v1/threads/:id/labels`, `PATCH /v1/labels/:id`, `DELETE`, `restore`, `POST /v1/labels/:id/rows`, `PATCH /v1/content/:id` and the note edit gaining `labels` (absent unchanged). Tests per route for membership, previous state returned, and deltas from two members ticking different rows both landing. *(AC-4, AC-11, AC-12, AC-32)*
- [x] **T2.6** Reads: the bundle's `labels` with counts and `counts.unlabelled`; `/content` with `labels`, `unlabelled` (either logic) and `ticksFor`; `labels: string[]` on every content and note response schema, listed in the PR; the agenda's `labels` and `threadLabels`. Tests: filtered pages page correctly across the cursor; counts exclude archived, deleted and non-listed notes; a label is never returned on a row outside its thread; a response schema without the field fails its test. *(AC-9, AC-18, AC-22)*
- [x] **T2.7** Move and delete: moving a row removes its joins and returns them for Undo; undoing the move restores those whose label still lives in the source thread; deleting and restoring a row keeps its labels. *(AC-31)*
- [x] **T2.8** `applyCompaction` carries the union of superseded notes' labels to the new note, `person` where any source was. *(AC-29)*
- [x] **T2.9** Account deletion: `created_by` goes null; a shared thread's labels stay; a private thread's go with it. *(OFF-3, AC-8)*
- [x] **T2.10** Leaving and removal keep labels and joins. *(AC-8)*
- [x] **T2.11** OFF-1 guard: a test that the label routes' error paths and logs carry no name (inject a sentinel name, assert it appears in no captured log line or error body beyond the person's own response). *(AC-33, OFF-1)*
- [x] **T2.12** `POST /v1/dumps` accepts `labels` ids and names on a thread dump, resolves them after filing under the person's rules, and records a person `live` run for the turn; `undoTurn` reverses it. *(AC-14, AC-6)*

### Shared

- [x] **T2.13** `@offload/widgets`: the `#` tokenizer (end-of-draft token; not `#3`, not `a#b`) and the filter state helpers (All clears, last cleared returns to All, deleted labels drop out). Tests first. *(AC-14, AC-19)*

### Mobile

- [x] **T2.14** `LabelMark` (20, 24, 30) and `Chip` with the iOS and Android branches, `min-height`, `label` as colour. Component tests and a dark-theme snapshot. *(AC-9, AC-17, OFF-7)*
- [x] **T2.15** `ContentRow`: `labels` prop, the marks line after the date chip, the `tag` tool first on every unlabelled row including door, archived and another member's, every tool at a 44px target. Tests on the rendered tree; then on-device check at 200% text on both phones. *(AC-9, AC-10)*
- [x] **T2.16** `LabelSheet`: lists, ticks, New label in place, Done one write with the toast and Undo, Cancel writes nothing, the field above the keyboard. Tests, then a device check with the keyboard up. *(AC-11, AC-32)*
- [x] **T2.17** `LabelList`: `FlatList` paged from `ticksFor`, ticks kept across pages, Label N and Save, Rename, Colour with the swap, Delete asking once in place, Undo; edge to edge keyboard handling on Android. Tests, then device check with a 300-row fixture thread. *(AC-12, AC-13, AC-3)*
- [x] **T2.18** `FilterBar`: sticky, All, label chips with counts (none at zero), No label, pinned `plus` on an opaque ground, *+ Group with labels* at six or more with no labels, the pick kept per thread on the device, the read narrowed through `/content`, notes filtered client-side, calendar events hidden under any filter, the empty line, reduced motion. Tests. *(AC-15 to AC-21)*
- [x] **T2.19** Composer `#` list: end-of-draft token, three rows, unmatched New label row, suppressed as `@` is, sends `labels`. Tests. *(AC-14)*
- [x] **T2.20** Today rows draw their labels from `threadLabels`; the timeline's anchor dot rule; the rail narrows. Tests. *(AC-22, AC-23)*
- [x] **T2.21** `tag` through `scripts/icons.mjs`; run `dead-icons.mjs`, `dead-classes.mjs`, `dead-css.mjs`. *(AC-10)*

### Web

- [x] **T2.22** `LabelMark` and `Chip label` from the design contract, passing `pnpm lint`'s prop rules. *(AC-9, AC-17)*
- [x] **T2.23** `ContentRowView` and `RowTools`: `labels` prop, marks line, the `tag` tool first on every unlabelled row, 44px targets. Tests. *(AC-9, AC-10)*
- [x] **T2.24** The label popover: focus in, Escape, focus returned, one write, toast with Undo. Tests. *(AC-11)*
- [x] **T2.25** The label's list modal: paged, focus trapped, Rename, Colour swap, Delete, Undo. Tests. *(AC-12, AC-13)*
- [x] **T2.26** The filter bar under `PaneHead`, sticky, the chip context menu and picked chip `pencil`, the pick in `localStorage` in try/catch, the narrowed read, the empty line, reduced motion. Tests. *(AC-12, AC-15 to AC-21)*
- [x] **T2.27** The composer's `#` list; Today's marks; the timeline's anchor dot; the rail narrowing. Tests. *(AC-14, AC-22, AC-23)*
- [x] **T2.28** Browser check of the whole path on the dev server, both themes; `dead-classes.mjs`, `dead-css.mjs`, `dead-icons.mjs`. *(AC-9 to AC-23)*

### Close of part 2

- [x] **T2.29** Privacy page line and updated date, as confirmed in T0.2. *(AC-34)*
- [x] **T2.30** Design log entries from the feature spec, each with its Design system impact, and `docs/tech/decisions.md`'s labels entry, on main after merge. *(OFF-7, AC-34)*

## 3. Live filing (offload track)

- [x] **T3.1 API.** The provenance check in TypeScript, `nameInDump`, held with the eval stub's rule to one fixture, `apps/agent/evals/fixtures/label-names.json` (added after review; its first run found the two disagreeing on an underscore). Tests: a name in the message's words passes; one absent, one in another message, and one only in a URL are refused `not_in_the_dump`. *(AC-24, SEC-1)*
- [x] **T3.2 API.** The `label_content` tool route through `applyLabels(via: 'offload', runId)`. Tests, each red first: apply an existing label; create only below six; refuse `person_set` on a join a person set or removed; refuse `person_deleted` for a kept person-deleted name; refuse a label or row from another thread; refusals carry `declined: true`. *(AC-24, AC-26, AC-5)*
- [x] **T3.3 API.** `#word` from Today applied by name after filing, `via: 'person'`, creating under ten; a person `live` run recorded. Tests. *(AC-15)*
- [x] **T3.4 API.** `undoTurn` reverses every run of the turn: joins set, joins removed, labels created with nothing else carrying them. Tests. *(AC-14, OFF-6)*
- [x] **T3.5 API.** The turn result's `labels`, and the live Activity row per member, unsent, with thread and run. Tests. *(AC-16, AC-27)*
- [x] **T3.6 Agent.** `LabelContent` tool model; the thread's labels in the user block under the data marker in `context.py`; the tool schema lists no names; the guard test passes at 1,800, or the tool moves behind `defer_loading`. Tests. *(AC-24, AC-30, SEC-1, OFF-8)*
- [x] **T3.7 Agent.** Filing prompt lines; eval cases for the live principle written, not run. *(AC-24, QUAL-1)*
- [x] **T3.8 Mobile and Web.** The footer's 30px marks after the thread pill, three plus a count. Tests on both. *(AC-16)*

## 4. The nightly sort (offload track)

**As built:** the nightly sort shipped 2026-09-27, switched off the same day, deleted by 032 on 2026-10-02 with its job, worker, prompt, endpoint, switch and evals. What stays is the live-turn labelling, whose `labelled` Activity row keeps its Undo.

- [x] **T4.1 API.** (Built, then deleted by 032 on 2026-10-02.) Enqueue `labels.sort` per changed thread of six or more rows, once per thread per day. Tests: unchanged threads are not enqueued; a shared thread is enqueued once. *(AC-25)*
- [x] **T4.2 API.** `POST /internal/threads/:id/labels/sort`: validated plan, a `nightly` run, `applyLabels` per entry dropping refusals, no `remove` in the schema, `labels_sorted_at` set, Activity per member if anything applied. Tests. *(AC-25, AC-26, AC-27, OFF-5)*
- [x] **T4.3 Agent.** `label_sort.py`: claim-time membership check (a removed account reads nothing), the 200-row budget, titles and types only, forced tool, one repair retry, counts-only logging. Tests with a stub that runs the real validation and can fail. *(AC-25, AC-33, OFF-1, OFF-8)*
- [x] **T4.4 Agent.** `prompts/label_sort.md`; eval cases for the nightly principle written, not run. *(AC-25)*
- [x] **T4.5 API.** `POST /v1/activity/:id/undo`: own row, `labelled`, under thirty days, not undone, caller still a member; reverts only untouched joins and labels; sets `undone_at` on every member's row. Tests including a person's later edit surviving the Undo and a removed member being refused. *(AC-28, SEC-2)*
- [x] **T4.6 API.** Purge `label_runs` with Activity's sweep; a row whose run is gone cannot be undone. Tests. *(AC-28)*
- [x] **T4.7 Mobile and Web.** The `labelled` Activity row: hollow lead, `tag`, Undo as its own 44px control outside the row's press, *Undone* in the tag slot from `undone_at`. Tests on both. *(AC-27, AC-28)*
- [x] **T4.8 Docs, on main after merge.** The OFF-6 allowlist entry for labels beside the 2026-09-10 compaction entry; 024's AC-18 narrowed in its feature spec. *(OFF-6, DEV-2, AC-34)*

*T1.6, T2.30 and T4.8 are written in `at-merge.md` and land on `main` with the merge, since both decision logs are shared state.*

## Done means

All three tracks green in CI; a device run on both phones and a browser run on the web covering the row, the sheet, the list, the filter bar, Today and the timeline; the privacy page and both decision logs updated; eval cases written and a run offered, not run.

## Amended 2026-10-07

T-2026-10-07 The label's list offers what is ahead; the web edit dialog carries Labels. Done. See the feature spec's amendment of the same date.
