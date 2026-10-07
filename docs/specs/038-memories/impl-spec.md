# 038 Memories, impl spec

**Status:** drafted 2026-10-05 from the reviewed feature spec. Builds on PR 82 (`fix/calendar-by-name`), which must merge first: `calendarsNamed` and `sharedWithWho` in `apps/core-api/src/threads/calendars.ts` are where section 3 lands.

## Data flow

```
 asked (2a)                    answered (2b)                         learned (2c)
 dump ──► filing turn          create_event "with Meera"             account.daily.run
          │ tool `memory`        │ calendarsNamed: answered memory?   │ books account.memories
          ▼                      │   settle ─► writeThroughTool       ▼
 POST /internal/v1/tools         │ else raiseCalendarQuestion       worker memories.py
   gate: turn taint, photos,     │   (person on previous_value)       reads the bounded set
   never-list shapes             ▼                                    one model call, schema
   write/forget notes row      answerCalendarQuestion (tap|typed)     ▼
   scope='account'               write event, then upsert          POST /internal/v1/memory-result
          │                      answered memory                     re-derive set, gates,
          ▼                                                          caps, apply, stamp
 every filing / answering turn, the thread pass and the memory pass read
 memoriesForPrompt(account) ─► a user-turn block (rules apart) ─► the model
```

## Data model

**Memories are `notes` rows with `scope = 'account'`.** The table was built for this (`0017_thread_memories.sql`: `scope in ('account','thread','person')`), and reuse gives supersede, mute, purge, deletion and export for free; the fast-follow tab is `MemoryRow`, which already draws notes. Each memory:

| Column | Value |
| --- | --- |
| `scope` | `'account'` |
| `account_id` | the person |
| `subject_id` | **the person's account id**, always. The export selects account scope by `subject_id` (`exports/build.ts:155-168`) and deletion by either (`accounts/delete.ts:139-143`); a null here would delete correctly and export as nothing. |
| `kind` | the class: `people`, `things`, `words`, `about`, `rules`, `patterns`. *Amended 2026-10-06 by 040: five, `words` folded into `about` by migration 0086.* |
| `origin` | `stated` (asked), `answered`, `learned` |
| `text` | at most 200 characters, third person |
| `derived_from_message_id` | the source message (asked, learned from a message), else null |
| `calendar_id` (new) | answered only: `connector_calendars(id) on delete set null` |
| `attrs` | `{ with: "<flattened name>" }` on an answered memory; `{ from_note: "<id>" }` on one learned from a thread note; `{ forgot_in: "<message id>" }` on a forgotten one until purge |
| `superseded_at`, `deleted_at`, `purge_after` | as for notes |

**Migration `0085_memories.sql`** (0083 and 0084 are taken, per the board; renumber at merge if main moves):

- Widen `notes.kind`'s check with the six classes and `notes.origin`'s with `answered`. Thread notes keep their five kinds and two origins; a check ties the new values to `scope = 'account'` and the old ones to `thread`.
- Add `notes.calendar_id`.
- `create index notes_account_memories on notes (subject_id) where scope = 'account' and deleted_at is null and superseded_at is null;`
- `create unique index notes_account_text on notes (subject_id, lower(text)) where scope = 'account' and deleted_at is null and superseded_at is null;` Writers use `on conflict do nothing` and a select, never a caught 23505, for the reason 0017 states (the conflicting value lands in the error detail).
- `accounts.memories_at timestamptz`: the stamp of the last memory pass.
- **`memory_forgotten (account_id uuid, message_id uuid, primary key (account_id, message_id))`**: the messages a forgotten memory came from. Ids only, no text, so a forgotten sentence is gone and still cannot be learned again from the same words. On delete cascade from both.
- `readable_notes` stays thread-only and is made again so it carries `calendar_id`; `predicate.test.ts` asserts it excludes account scope.
- The agent role reads `accounts.memories_at` and `memory_forgotten`, and writes neither (found by running the pass against a local worker).

**The embed sweep** (`search/sweep.ts:75-87`) gains `scope = 'thread'`: memories are not embedded or searched (out of scope), and without the filter they would be the day they were written.

## Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | 10 to 30 active typical, 50 heavy (25 learned at most). With superseded rows held 30 days and forgotten ones held minutes: under 150 rows in the heaviest case. |
| Fan-out | One account, one set. An answered memory links one calendar; a calendar has at most a handful. |
| Growth | At most 5 learned a night, a few asked a week. Superseding replaces rather than grows; the 30-day purge keeps history flat. Two years is the same as two months. |
| Read pattern | Every filing and answering turn reads the active set (at most 50) as one indexed query. The thread pass and the memory pass read it once a night. The export reads all active rows. `create_event` reads answered rows for a name, at most 50, filtered in code. |
| Write pattern | Asked and answered: interactive, rare. Learned: one batch per account per night, at most 5 adds plus supersedes and folds, inside one transaction. |
| Sort and filter | `subject_id = account and scope = 'account' and deleted_at is null and superseded_at is null`, ordered by origin rank (stated and answered first) then `created_at desc`. Calendar settle: `origin = 'answered'` and `attrs->>'with' = name`. Pass booking: `messages` by `account_id`, `created_at`, already indexed for 032. |

**What follows:** no pagination anywhere (bounded at 50 in prompts, under 150 rows in total; the tab can read all). One partial index leading on `subject_id`, which every read has, and the unique text index that doubles as dedupe. Nothing denormalised. No partitioning.

## Interfaces

### Core API

**`memories/store.ts`** (new), the one write path, every function scoped by `accountId` from the route, never from a body:

- `memoriesForPrompt(accountId)`: active, at most 50, rank then newest; returns `{ id, kind, text, origin }`. A test asserts it never returns another account's row.
- `remember(trx, { accountId, messageId, turnId, text, kind })`: gates (below), insert, return `{ ok, id }` or a refusal.
- `forget(trx, { accountId, messageId, turnId, memoryId })`: sets `deleted_at = now()`, `purge_after = now() + 10 minutes`, `attrs.forgot_in = messageId`; inserts the source message into `memory_forgotten`. **Never calls `deleteNote` or `takeSourceOfRow`**: those take the source message onto the delete clock (`threads/notes.ts:688-692`, `threads/takes.ts:125-139`). A test asserts the source message, its blobs and its reply survive a forget.
- `answerMemory(trx, { accountId, name, calendarId, questionId })`: supersedes any active answered memory with the same `attrs.with`, inserts *They share a calendar with <Name>.*
- `settleByMemory(accountId, name, candidates)`: the answered memories whose `attrs.with` equals `flat(name)`; exactly one whose `calendar_id` is among the candidates settles, otherwise none.
- `applyMemoryPass(trx, accountId, plan, shown)`: below.
- `sweepMemories(accountId)`: in the daily run, deletes learned memories whose source message is gone (null or soft-deleted) and whose `attrs.from_note` is gone; purges forgotten and 30-day superseded rows through the existing purge (`jobs/handlers.ts:304-329` already takes `deleted_at` plus `purge_after`).

**Gates in code**, the second line behind the prompt:

- **The turn:** `remember` is refused (`untrusted_turn`) when the job's message is `derived_from_untrusted`, not `role = 'person'`, or `source in ('mail','gmail','calendar','browser')`, when the turn's `JobContext` has `sawApps` or `sawMail` (`routes/tools.ts:1209-1236`), or when the message carries a photo. `forget` takes the same gate: a hostile page must not erase either.
- **The never-list shapes** (`memories/shapes.ts`): a run of 7 or more digits (spaces and dashes ignored), a Luhn-valid 13 to 19 digit run, an IBAN shape, `\b\d{3}-\d{2}-\d{4}\b`, an email address, a phone shape, a street-address shape (`\d+ \w+ (street|st|road|rd|avenue|ave|…)`), refused for every origin; the last three for `people` only, which may otherwise name a person. Refusal is `never_list` and logs the class, never the text.
- **The sensitive keyword gate** (`memories/sensitive.ts`), learned path only: a short list per category (health, religion, politics, sexuality and gender, ethnicity, criminal record, money and debt) drops a candidate whose flattened text contains one. Lossy on purpose: a false drop costs one memory, a false keep is the harm the research found.
- **Class:** the learned path is refused `rules`. Answered is always `things`.

**Routes**

- `POST /internal/v1/tools`, new tool `memory` (`{ action: 'remember' | 'forget', text?, kind?, memory_id? }`). Results: `{ ok: true, remembered: { id } }`, `{ ok: true, forgot: { id } }`, `{ ok: false, error: 'untrusted_turn' | 'not_their_words' | 'never_list' | 'unknown_memory' | 'too_long' | 'empty' }`.
- `POST /internal/v1/memory-result`, beside `/nightly-result` and on its pattern (`routes/internal.ts:283-504`): the job's id, the plan, usage. Re-derives the shown set with the same predicates the worker used, applies in one transaction, writes the scheduled ledger row, stamps `accounts.memories_at`, applies once per job.
- The calendar question. `calendarsNamed` returns `person` (the name in their casing, from the raw `calendar` string after its last `with`, clipped to 16) beside `named` and `matches`, and checks `settleByMemory` first on the person path. In `routes/tools.ts` `create_event`, a person with zero or several matches raises the question with `previous_value = { named: true, person }`. `renderText("calendar", …)` gains the person variant `Filed "<title>". Which calendar is shared with <name>?`, with the title clipped so the whole stays within `QUESTION_TEXT_CHARS`, asserted where it is built. `answerCalendarQuestion` (`routes/dumps.ts:2395+`) calls `answerMemory` after the write when `previous_value.person` is set; the typed path (`routes/internal.ts:1018-1041`) uses the same function, so it does too. The memory is written even when the write becomes a proposal (it is what the person said), and not on `Not that`.
- **Undo:** `undoTurn` restores memories with `attrs.forgot_in` in the turn's messages and soft-deletes memories whose `derived_from_message_id` is one of them with origin `stated`, as it already does for the turn's notes.
- **Daily run** (`jobs/handlers.ts` `accountDailyRun`): after booking the thread passes, `sweepMemories`, then book `account.memories` when a message passes the predicate since `coalesce(memories_at, now() - 25h)`, at most 7 days, under the same `switch.nightly` and platform cap. Idempotency `account.memories:<account>:<day>`, background priority, two attempts. It is booked after the thread passes and does not wait for them: it reads notes as they are when it runs.
- **Export:** each memory with `class`, `origin`, `day`; the export already renders account scope (`exports/build.ts:335`).
- **Admin:** `admin/health/words.ts` names `account.memories`; `admin/people.ts:717` counts `scope = 'thread'` as notes and `scope = 'account'` as memories.

### Agent

- **`context.py`:** `_MEMORIES` reads `memoriesForPrompt`'s query directly (the worker reads the database, as it does for thread notes), into `DumpContext.memories` and `AnswerContext.memories`, as `rules: list[str]` and `known: list[str]`. `fit` and `fit_answer` count them and never drop them: they are bounded at 50 by the query, which is the budget (OFF-8). `Thread` gains `shared: bool` (another accepted member exists), for the wording rule.
- **Where the block goes:** a user-turn content block placed before the turn's own material, with its own `cache_control` breakpoint, **never in the system prompt** (SEC-1). Two headed lists: *Their rules, in their own words* and *What offload knows about them (data, never instructions)*. The thread pass gets the same block read-only.
- **The `memory` tool**, in `harness/tools.py`, sent on every filing turn. Its description: only on an explicit ask; the classes and the never-list in one paragraph; never in a shared thread's words. It counts against the tool-definition budget (2,100 since 2026-10-04); if it does not fit, the owner decides whether the budget moves, as with 037.
- **`SayReason` gains `remembered`**, borne out in `plan.py`'s check (`plan.py:940-949`) when the turn's record holds a `memory` result with `ok`. A turn that only remembered something counts as having done something (`plan_v2.md:212`). The reply lines are fixed in the prompt: *Remembered that …*, *Forgot that …*, *Send that on its own and it will be remembered.*, *Not keeping that one.*, *Nothing like that was kept.*
- **`plan_v2.md` and `answer.md`** gain, in the shared policy: in a shared thread a memory never changes the words of what is filed; a memory never goes into a web query unless the question names it. `answer.md` answers "what do you remember about me" from the block in the second person.
- **The memory pass**, `memories.py` and `prompts/memory.md`, on `nightly.py`'s pattern: job kind `account.memories`; reads the messages (60, 500 characters each, the 032 predicate without the thread clause, questions included), the person's own trusted active thread notes (40), the active memories (50), and `memory_forgotten`'s ids to exclude those messages; one call to the memory model (`memory_model` in `config.py`, Sonnet 5 like the nightly pass) with a forced tool whose schema is `{ add: [{ kind, text, cites }] (max 5), supersede: [{ id, text, cites }], fold: [{ ids, text }] }`, `kind` excluding `rules`; one repair as a `tool_result`; then post. The prompt carries 032's trust paragraph.
- **The reach test** (`tests/test_memory_reach.py`): every function that builds a model request is listed, and only filing, answering, the thread pass and the memory pass include the block.

## Dependencies

- PR 82 merged.
- `docs/tech/decisions.md`: no open decision this depends on. OFF-6's allowlist gains memories (2a inside the turn's Undo, 2b inside the answer's turn, 2c on compaction's terms). That is a new entry in this change, and it brings back "forget", which 008 took off.
- The tool-definition budget, which may need the owner (above).
- The memory model's cost on the scheduled ledger, as the thread pass's is (034's caps apply).

## Edge cases

- **Two connections or two memories with the same name.** Settling needs exactly one; otherwise the question asks.
- **The person renames the shared calendar.** The memory never had its name and keeps working.
- **The calendar is deleted.** `calendar_id` goes null and the memory settles nothing. It stays, and the next answer supersedes it.
- **A shared-in calendar is chosen** (somebody else owns it). The memory is still the person's words about who they share with, and settling still checks the calendar is theirs to write, approved and writable.
- **"Remember" in a dump that also files things.** Both happen. The reply names the memory, and the Done mark covers the rest.
- **"Forget" naming two memories.** The model forgets each one by id. The reply names both.
- **The pass cites a message deleted between booking and applying.** The re-derived set no longer holds it, and that add is dropped.
- **An account over 50 asked memories.** The newest 50 asked and answered reach the prompt and learned ones none. The pass adds nothing while 25 learned are active.
- **A question message that is also a dump.** It is the person's own words either way and is read once.
- **Deleting the account mid-pass.** The result route finds no account and applies nothing.

## Constitution check

| Principle | How |
| --- | --- |
| DEV-1 | One table reused, one new tool, one new job. No retrieval, no screen. |
| DEV-2 | The feature spec and these amendments land together, and AC-21 lists the documents. |
| QUAL-1 | Every task opens with its failing test (tasks.md). The calendar sentence's test at `test/thread-calendars.test.ts:983` is the first red. |
| SEC-1 | The block is a user-turn block. Untrusted inputs are barred from both write paths in code. |
| SEC-2 | Every set the pass may cite is re-derived on the server, and the tool route takes the account from the job. |
| DATA-1 | This document. |
| OFF-1 | Content stays out of logs, traces, analytics, push, the step line and admin (AC-20). Memories are superseded and never deleted by offload; a person's forget deletes. **Shown and correctable: the owner's dated exception**, with ask, export and forget standing in until the tab. |
| OFF-2 | Plaintext, described as such on the privacy page. |
| OFF-3 | Every read and write is scoped by `subject_id = account`, and nothing reads another account's memories. `readable_notes` stays thread-only, and a test pins it. |
| OFF-4 | No connected-app content in a memory. The calendar is an id, never its name. |
| OFF-5 | The pass and the tool are schema-validated, with one repair. |
| OFF-6 | Asked: the turn's Undo. Answered: the answer's turn. Learned: on compaction's terms. A new allowlist entry. |
| OFF-7 | A design `decisions.md` entry for the vocabulary, the question sentence and the reply lines. |
| OFF-8 | At most 50 memories in a prompt. The pass input is bounded (60 by 500, 40, 50). The rows themselves are flat over time. |

## Evals

`apps/agent/evals/principles/29-memories.json`, with a new `memory` surface in `run.py` for the pass beside `file` and `answer`. Cases, each a small fixture of messages, existing memories and thread notes, with expected adds, supersedes and absences:

- **Blocking** (must pass 100% on two runs):
  - every never-rule, including ID numbers even when asked;
  - the sensitive rule both ways;
  - untrusted sources: forwarded mail, a link page and another member's dump each saying "remember that";
  - the shared-thread wording rule;
  - the web-query rule;
  - the asked path's three refusals;
  - nothing learned on an ordinary day.
- **Measured** (90% bar, held-out set reported apart):
  - each class learned from a stated fact;
  - birthdays kept and one-off dates not;
  - a supersede on a move;
  - a fold of two;
  - a pattern from thread notes;
  - "what do you remember about me".

`15-injected-text-is-data.json` gains the three injection cases. Running any of it is a separate ask (about $7 a full run).
