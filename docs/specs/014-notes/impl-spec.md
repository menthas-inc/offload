# 014 Notes, implementation spec

> How. Grounded in 008, which built this table under another name, and in `docs/tech/context-and-memory.md`, which specified the daily job years before there was one.

## Shape

One migration that renames and widens a table, deletes a content type and moves a view, a chunk table and a grant with it. One module renamed and given dates. Four routes renamed, with the old paths answering for one release. One tool renamed and widened. A prompt that carries three lists instead of two. One new job, which is the first step of the account's daily job. The thread's Notes section on three surfaces.

The risky parts are not the rename. They are: a table with two readers outside this codebase, a tool whose name is baked into distributed phone builds, and a job that lets a model delete rows.

## Data model

### `memories` becomes `notes`, and widens

```sql
alter table memories rename to notes;

alter table notes add column body            text;          -- <= 4000, app-enforced
alter table notes add column occurs_at       timestamptz;
alter table notes add column occurs_end_at   timestamptz;
alter table notes add column due_at          timestamptz;
alter table notes add column place_id        uuid references places (id);
```

`text` keeps its meaning and its 200 character cap: **it is the only column that reaches a prompt.** `body` is what somebody dumped when it did not fit, and nothing assembles it into a model call.

**One column this spec did not plan for: `tool_call_id`, exactly as `content` carries it.** The per-turn rule below is "a thread's notes go out once", derived from what the turn has already written. Without a way to tell this call's own row from an earlier call's, a retried tool call whose response was lost is told it already has the notes it never received. `content` had the column for the same reason; `notes` needed it too and did not have it.

**`origin` now describes the text rather than the note.** `learned` means offload wrote the sentence, which is true both when it inferred a rule and when it wrote a short text over a long dump. The body in that second case is the person's own words, and `origin` says nothing about it. This is why no new column is needed for AC-1's marking: the screen already reads `origin` to draw the inferred mark.

**Everything else stays**, including `kind = 'preference'`, `scope`, `subject_id` with no foreign key, `derived_from_untrusted`, `muted_at`, `superseded_at` and the nullable `account_id` that is authorship and never an access predicate.

### A note has a place in its section, since 2026-09-16

```sql
alter table notes add column priority smallint not null default 50;   -- 0045
```

The same scale and column type as `content.priority`, so one drag helper serves both lists. Default 50 rather than 0, so a note can be moved either way before the section is re-spread. **`readable_notes` is dropped and recreated in the same migration**: it is `select notes.*`, which froze its column list when it was created, and `create or replace view` may only append columns while `*` puts the new one in the middle. 0036 did the same for the same reason.

No index: the section is read whole, a few hundred rows at most, through `notes_thread` on `subject_id`, and sorts in memory.

`readableNotes` orders by `priority desc, created_at asc`. `notesForPrompt` is untouched: it still budgets by `updated_at desc` and hands the model the set oldest written first. `reprioritiseNote` writes `priority` and **nothing else**, `updated_at` included, because that column is precedence and a note dragged to the top has not been written again. Any member, through `requireReadableNote`, like every other arrangement of a shared thread.

### What moves with it

| | |
| --- | --- |
| `readable_memories` | Renamed `readable_notes`. It is a view with one authorization predicate, recreated rather than altered, and 0028 is the migration that already had to fix these when a table changed under them. |
| `memory_chunks` | Renamed `note_chunks`, with its two indexes and its HNSW index. |
| The `offload_agent` grants | 0032 granted the agent plane select, insert, update and delete on `memory_chunks`. **Nothing to do: privileges follow a rename in Postgres.** Written here because the first draft of this spec said to re-grant them, which would have been a no-op that read like a safeguard. |
| `apps/agent/src/offload_agent/embed_jobs.py:72` | The one place outside this codebase that names the table, mapping `embed.memory` to `("memory_chunks", "memory_id", "subject_id", ...)`. The job kind is renamed with it. |
| Four index names | `memories_thread`, `memories_thread_text`, `memories_account`, `memories_purge`. |

### The unique index narrows

```sql
drop index memories_thread_text;

create unique index notes_thread_text on notes (subject_id, lower(text))
  where scope = 'thread' and deleted_at is null and origin = 'learned';
```

AC-3b: a person's repeat lands, offload's does not. The index keeps the job it was built for, which is a model asked twice about the same thread writing the same sentence twice, and stops refusing a person. `on conflict do nothing` plus a select stays, and a caught `23505` stays forbidden: Postgres puts the conflicting value in the error detail and note text is dumped text.

### New indexes

```sql
-- 015 reads dated notes beside dated content. Thread-leading, like every read
-- through readable_notes.
create index notes_thread_dated on notes (subject_id, occurs_at)
  where occurs_at is not null and deleted_at is null and superseded_at is null;

create index notes_thread_due on notes (subject_id, due_at)
  where due_at is not null and deleted_at is null and superseded_at is null;

-- The folded history, newest first. It is the one list here that grows forever.
create index notes_thread_superseded on notes (subject_id, superseded_at desc)
  where superseded_at is not null and deleted_at is null;
```

`content_thread_dated_idx` from 0016 is the content-side half and needs nothing.

### The content type goes

```sql
delete from content_chunks where content_id in (select id from content where type = 'note');
delete from content where type = 'note';
alter table content drop constraint content_type_check, add constraint content_type_check
  check (type in ('link','image','screenshot','voice','file','task','event','location'));
```

**This destroys dumped content and it is the exception written into OFF-1 on 2026-09-10**, dated, one time, alpha only. The rows offload filed from a dump still have their message; rows typed straight into a section carry no `derived_from_message_id`, so for those this is the only copy. Run it in the same transaction as the rename, so a half-migrated database cannot exist.

`add_content` loses `note` from its enum **and loses its default**, which is `note` today. A model that cannot say what something is now calls `add_note`, which is the honest routing rather than a silent fallback to a type that no longer exists. The column's own `default 'note'` is dropped in the same statement, or every insert that omits a type fails the new check instead of the old default.

**`quickAdd` loses its fallback too, and gains a branch.** `STARTS_AS` maps a widget section to the type a typed line starts as: To do to `task`, the timeline to `event`, the map to `location`, and Files to `note`, which no longer exists. You cannot type a file, so **a section with no answer writes a note** through `addNote` and returns `{ kind: "note" }`. It enqueues no `thread.quick_add` job: that job exists to turn a typed line into a task with a date, and a note typed by a person is already exactly what it is.

## Volume and access

| | |
| --- | --- |
| Records per account | 5 notes per thread typical, 100 active heavy, which is the budget. 40 threads typical is 200 notes; 300 threads heavy is up to 30,000 including folded history. |
| Fan-out | Active notes per thread are capped at 100 by the daily job, not by the write path. Folded history per thread is unbounded and is the only list here that grows without a ceiling. |
| Growth | A few notes per active thread per week, minus what the daily job folds. Folded rows accumulate at roughly the same rate. |
| Read pattern | The thread page, once per open, active notes only. The tool result, once per distinct thread per turn. 015's timeline, dated notes only, once per thread open. The daily job, once per thread per day. Search, through `note_chunks`. |
| Write pattern | Rare and not bursty at dump time. Bursty once a day per account, inside the daily job, which rewrites a thread's set in one transaction. |
| Sort and filter | `subject_id` plus the active predicates ordered by `updated_at desc` for the prompt and `created_at asc` for the screen; `(subject_id, occurs_at)` for 015; `(subject_id, superseded_at desc)` for history. |

**Pagination.** None for active notes: 100 is the whole set and the budget is what makes that true. **The folded history is cursor-paginated**, page of 20 on `superseded_at desc`, because it is the one thing here with no ceiling.

**Retention.** A folded note offload wrote is purged 30 days after it was superseded, on the existing purge sweep. A note a person typed is never purged by us, superseded or not, per OFF-1 as amended. That asymmetry is the whole of the amended principle expressed as a clock.

**Normalisation.** No count column. The section needs an active count and a folded count, both `count(*)` behind partial indexes over at most a few hundred rows.

## The module

`apps/core-api/src/threads/memories.ts` becomes `notes.ts`. `MAX_MEMORIES_PER_THREAD` becomes `NOTE_PROMPT_BUDGET = 100` and stops being a cap: **nothing refuses a write for being over it.** `MEMORY_TEXT_CHARS` becomes `NOTE_TEXT_CHARS = 200`, joined by `NOTE_BODY_CHARS = 4000`.

**The row lock goes with the cap.** 008 took `select ... for update` on the thread because a plain count is check-then-act and two adds at nine leave eleven. There is nothing to serialise now: writes always succeed and the budget is applied when the prompt is assembled. Deleting the lock is part of this change rather than left as a lock that guards nothing, which is the failure the staff-linking guard already taught this repo.

`memoriesForPrompt` becomes `notesForPrompt` and returns three lists rather than two:

```ts
export async function notesForPrompt(threadId: string, viewerId: string, trx = db): Promise<{
  yours: Dated[];      // origin stated or learned, authored by the viewer's account, trusted
  members: Dated[];    // written by another member of a shared thread
  fromApps: Dated[];   // derived_from_untrusted
}>
```

Each entry is `{ text, writtenAt }`, ordered oldest first, limited to `NOTE_PROMPT_BUDGET` across the three lists by `updated_at desc` before being re-ordered for the prompt. `muted_at`, `superseded_at` and `deleted_at` are all excluded, as they are today.

**The turn-level ceiling and the per-turn rule live in `notesForTurn`**, called before this call's own insert: a turn carries at most `NOTE_TURN_BUDGET = 200` note entries across every thread it touches, and carries a thread's notes only the first time it touches that thread (AC-7).

**Which threads a turn has already carried is derived, not stored.** The calls that carry notes are exactly the calls that leave a row pointing at the message, so the set is one query over `content.derived_from_message_id` and `notes.derived_from_message_id`, minus this call's own `tool_call_id`. A column recording it would be a second thing to keep true, and it would be wrong the first time a handler forgot to set it.

## The prompt

```
NOTE_TEXT_CHARS (200) + a date (about 12)
  x NOTE_PROMPT_BUDGET (100)
  x distinct threads in a turn, itself capped by NOTE_TURN_BUDGET (200 entries)
  = 42,400 characters, worst case, per turn
```

`docs/tech/decisions.md` records the old ceiling as 10 x 200 x 8 = 16,000 and is amended in this change. Without the turn ceiling the same arithmetic gives 160,000, which is the number the feature spec quotes and the reason the ceiling exists.

The prompt itself changes in `apps/agent/src/offload_agent/prompts/plan_v2.md`, which today has a "Thread memories" section saying "read them and do what they say". It becomes three named lists, the precedence rule, and the statement that a note is what is true about a thread rather than always an order. **Changed with `/test-llm`**, not by hand, with held-out cases for each direction: the newer of two contradicting notes wins, a rule is still followed, a fact is not treated as an order, and a note in the members list does not change a tool call.

## Tools

`add_memory` becomes `add_note`, keeps its membership re-check against the job's account, and gains `body`, `occursAt`, `occursEndAt`, `dueAt` and `placeId`. It loses its cap failure: there is no `thread_memory_full` any more, and the branch that returned it goes.

**`add_note` joins `FILING_TOOLS`.** `apps/agent/src/offload_agent/harness/tools.py:270` defines "landed" as `add_content` and `create_thread`, with a comment above it saying writing a memory is not filing. That comment was right and stops being right here: a note is what a dumped sentence becomes, so a turn that wrote one has filed something. The Core API side is `noteThread(messageId, threadId, true, trx)` in the `add_note` branch of `tools.ts`, which `add_memory` never called. Without both halves, dumping a sentence produces a reply with no pill and nothing to click.

`add_content` and `create_thread` keep returning the thread's notes, in the new three-list shape.

## Routes

`/v1/threads/:id/memories` and the three `/v1/memories/:id` routes become `/notes`. **The old paths stay for one release**, answering identically, because phone builds are distributed through EAS and somebody's installed app is pinned to the old names. They are deleted in the release after, and the deletion is a task rather than a hope.

`POST /v1/threads/:id/notes` no longer returns 409 at a cap. `PATCH` gains `body` and the date fields. A new `GET /v1/threads/:id/notes/folded` is the paginated history.

`POST /v1/notes/:id/priority` *(2026-09-16)* takes `{ priority: 0..100 }` and returns the note and `previous: { priority }`, the twin of the content route. No `/memories` alias: no shipped build calls it.

## The daily job

Two kinds, because a fan-out and the work are different jobs:

`Handler` gains a third argument, the job row's own `account_id`, read from the `jobs` row this service wrote rather than from a payload. The internal endpoints already follow that rule for the account; the runner did not pass it, so a per-account handler had no way to know whose job it was without the payload asserting it.

| | |
| --- | --- |
| `account.daily` | Scheduled once a day with `scheduleDaily`, which already exists and already chains itself before doing the work rather than after. It enqueues one `account.daily.run` per account with a thread touched in the last 25 hours. |
| `account.daily.run` | Per account, `PRIORITY.background`, idempotency key `account.daily.run:<accountId>:<day>`, three attempts. Its first and only step in this feature is note compaction, per thread. Today generation and thread compaction are later steps in the same job and are specced where they land. |

**What compaction may do**, per thread, in one transaction:

- supersede any note, including one a person typed, which changes what offload acts on and destroys nothing;
- delete a note **only where `origin = 'learned'` and no person has edited it**, which is the same predicate `editMemory` already enforces for offload's rewrites;
- insert new notes derived from that day's conversations, `origin = 'learned'`, carrying `derived_from_message_id`;
- never touch a note where `derived_from_untrusted` is true, and never fold two authors' notes into one (AC-14a): the folded row carries the author of what it folded.

**The model call is structured output** against a closed schema (OFF-5): a list of supersede ids, delete ids, and new notes with their text and optional dates. One repair-and-revalidate retry, then raise. An id the model returns that is not in the thread's set is dropped rather than retried, because a hallucinated uuid is not a validation failure and a retry would not fix it.

**Its failure path carries ids and counts, never text** (OFF-1). This is the `jobs.last_error` class of defect that `decisions.md` already records once, and compaction is the first job in the product that holds a hundred sentences of dumped text at the moment it can fail.

**No Undo.** Compaction has no turn and no toast, so OFF-6's eight seconds do not apply; it goes on the reversible allowlist in `decisions.md` with the argument that it destroys nothing a person wrote. Without that entry OFF-6's default makes it outward facing, which would mean confirming it per action.

## Screens

Web is `apps/web/src/components/panes/Thread.tsx` and `Memories.tsx`; the phones are `apps/mobile/components/shell/Memories.tsx`. All three keep their shape and gain:

- **a date and place on the row**, and a mark that a body exists;
- **the inferred mark on `origin = 'learned'`**, which already exists and now also means "offload wrote this text over your longer one";
- **a folded count** and the control that opens the history;
- **the over-budget line**, beside the control that resolves it.

**And a handle, since 2026-09-16.** Each active row draws `grip-vertical` at its trailing edge, where the edit tool would be if a note row had one: on web as a button beside the text, which meant the row could no longer be one button, since a control inside a control is focusable by nothing; on the phones inside the row with the same pan-after-a-hold the content row uses. The drop goes through `reorderPlan` from `@offload/widgets` and `setNotePriority`, one call per changed row, with one Undo. Folded history draws no handle: it is read, not arranged.

`MemoryRow` in the design system has no props for any of this. It is extended and renamed, and the entry in `.claude/skills/offload-design/decisions.md` carries the **Design system impact** field. The section heading is a raw `h2` today and moves to `SectionHeader`, which is a pre-existing divergence resolved rather than copied. The folded-history control has no governed pattern; the nearest built thing is the bespoke archived-content row on the thread page, and this is where that either becomes a pattern or is logged as a second divergence.

The phones' Notes tab stays the empty screen it is, on both platforms, and its `cloudy` glyph is looked at once rather than inherited from the old word.

## Edge cases

| | |
| --- | --- |
| A dump longer than 200 characters | Body keeps every word, offload writes the text, `origin = 'learned'`, and the row shows the inferred mark. |
| A dump longer than 4000 characters | The body is what the message holds; the message is kept whole and the note points at it. Refusing the dump is not an option. |
| A person edits offload's text | `origin` becomes `stated`, offload may never rewrite or delete it again, and compaction may only set it aside. |
| Two people, one thread, both dumping | Two notes, two authors, both in their own list in the other's prompt. Nothing merges across them. |
| A thread at 400 notes | Every one is stored and shown. The prompt carries the newest 100, the screen says how many are not instructing, and the daily job is what brings it down. |
| Compaction runs while somebody is typing | The transaction is per thread and short. A note written during it lands after and is simply not in that day's set. |
| Compaction produces nothing | Normal. Most threads on most days need no fold. |
| A note with a date and no place | The timeline draws it, the map does not. Both widgets are earned, per 007. |
| A muted note | Off every prompt list, on the screen, still counted, still compactable. |
| Thread deleted | `deleteNotesForThread`, the renamed `deleteMemoriesForThread`, which still has no caller because thread deletion is still not built. |

## Constitution check

| | |
| --- | --- |
| **OFF-1** | Amended in this change. Dumps durable, derived state not, offload deletes only what it wrote, and the migration's deletion is the dated exception written into the principle. Egress: compaction's failures and traces carry ids and counts. |
| **OFF-3** | Reads through membership on `subject_id`, delete by author, no fold across authors, account deletion sets the author null and never cascades into a shared thread. |
| **OFF-4** | Connector-derived notes keep `derived_from_untrusted`, stay in their own list, and are never folded or rewritten. |
| **OFF-5** | The compaction call is a closed schema with one repair retry, then raise. |
| **OFF-6** | Compaction goes on the reversible allowlist with its reasoning, since it has no turn to undo. |
| **OFF-7** | Four design-system changes, each logged with **Design system impact** filled in. |
| **OFF-8** | The budget is enforced at assembly, three constants, asserted at 200 threads, and `decisions.md`'s recorded ceiling is amended rather than quietly outgrown. |
| **SEC-1** | The exception is accepted and recorded, and contained by the three lists. |
| **SEC-2** | Membership re-checked server-side against the job's account, never taken from a tool call. |
| **DATA-1** | This document, before the code. |

## What the reviews changed, after the code was written

Recorded here rather than folded in silently, because most of them are a rule this document already stated and the code did not keep.

- **`log.exception` renders the traceback.** The compaction failure path carried the comment "the type, never the value" over a call that sets `exc_info=True`, and structlog prints `str(exc)` with it. An SDK error can echo the request body, and the request body there is a hundred notes. `log.error` now, and **the identical line in the embed path had the same defect since 013** and is fixed with it.
- **The untrusted list had no writer.** `derived_from_untrusted` governed which prompt list a note lands in and nothing ever set it, so the two-hop path 001 described was open and the second list was a shape nothing reached. A turn that reads a calendar now marks itself on its own job row, and every note it writes afterwards is untrusted. **Per turn and with no partial version**, which is 008's own rule for the column: a note drawn from a stranger's event and the person's own words is still a note a stranger had a hand in.
- **A note folded and removed in one plan was destroyed.** An id in both `foldedFrom` and `remove` was superseded and then soft-deleted, so the history lost the note it was standing in for. Folding never deletes what it just set aside.
- **The daily fan-out could not reach a dormant account.** It gated on activity in the last 25 hours, so a thread that went over the budget and then went quiet was never compacted, which AC-8 does not allow. Over the budget is now its own reason to run.
- **The compaction endpoint took a model's dates without checking them.** Its twin refuses an unparseable or implausible date and cites the incident that taught us; this wrote whatever came back. The date is dropped rather than the entry: a fold whose replacement is right and whose date is wrong should lose the date, not put the thread back.
- **Folded history had no clock.** `purge_after` is set on offload's own folded rows and swept after thirty days; a person's stays null and is never purged by us. Without it the folded list was the one thing on a thread that grew forever.
- **Quick add handed every member's note over as instruction.** It is split there now the way the tool result splits it.
- **The worker could rewrite the job row every internal endpoint trusts.** 0009 granted `update on jobs` table-wide with a comment saying "only to claim work", and 0034 makes the grant say it: seven columns, and neither `payload` nor `account_id`. Every one of these endpoints reads the thread and the account from that row.
- Smaller: `memories_search_idx` was the one index the rename missed, the folded cursor is checked as a timestamp rather than fed raw to `new Date`, compaction reports its token usage like every other model call, its repair turn now runs when a response comes back with no plan in it at all, and `ignored` counted an untouchable source twice.
