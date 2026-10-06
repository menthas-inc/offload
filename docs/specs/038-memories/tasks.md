# 038 Memories, tasks

Every task opens with its failing test, run and seen red for the reason the task exists (QUAL-1), and closes with it green and nothing else red. The privacy page change (T1) lands before any task that writes a memory is merged. Tracks: Docs, API, Agent, Evals. No Mobile or Web track: no screen changes (the Memories tab is the fast follow); the web change is the privacy page and the admin panel's names.

## Setup

- [x] **T0** Built on PR 82's branch (`fix/calendar-by-name`), which this branch contains; merge PR 82 first. Take the next free migration number from the board (0085 at the time of writing) and say so there. Isolated databases `offload_038` and `offload_038_test`.

## Docs (before code that writes)

- [x] **T1** The privacy page, with the owner's sign-off on the words:
  - what memories are, and how each kind is written;
  - that sensitive ones are kept only when asked;
  - that names, relations and birthdays of people in their life are kept;
  - that every call now also carries them;
  - how to see one (ask, export) and remove one (say so);
  - that none reach a web search.

  Also `:146` (the derived list), `:212`, section 15, section 17 and section 16, per the security review. (AC-21, OFF-2)
- [x] **T2** On main, as shared state:
  - `CLAUDE.md`'s vocabulary and the design readme's table get *memory* back for the account, with the 014 defence sentence;
  - a design `decisions.md` entry for the vocabulary, the question sentence and the reply lines, with **Design system impact** naming the three Memories kits and `MemoryRow`'s origins;
  - `context-and-memory.md`'s daily job and prompt budget;
  - OFF-6's allowlist entry in `docs/tech/decisions.md`;
  - 019 AC-11;
  - the OFF-1 exception, dated and in the owner's name, written into `principles.md` as 014's was.

  (AC-21, OFF-7, DEV-2)

## API, foundational

- [x] **T3** Migration `0085_memories.sql`: the kinds and origin, `calendar_id`, the two partial indexes, `accounts.memories_at` and `memory_forgotten`. Tests: a thread note cannot take a class kind and an account memory cannot take a thread kind; duplicate text at account scope is a no-op through `on conflict`; `readable_notes` still excludes account scope (`predicate.test.ts`). (AC-1, OFF-3)
- [x] **T4** `memories/shapes.ts` and `memories/sensitive.ts`, pure. Table tests: each never-list shape refused (a card number, an IBAN, an SSN shape, a passport-length digit run), the three People-only shapes, and the sensitive words per category, with near misses kept ("Sam's 5th birthday", "Rebalance Schwab" in a non-sensitive sense where the list allows). (AC-3, AC-11)
- [x] **T5** `memories/store.ts`: `memoriesForPrompt`, `remember`, `forget`, `answerMemory`, `settleByMemory`, `sweepMemories`. Tests:
  - scoped to the account, and another account's rows are never returned;
  - rank then newest, at most 50;
  - forget sets the purge clock, records `memory_forgotten`, and **leaves the source message, its blobs and its reply alive**;
  - an answered memory supersedes the same name's;
  - settle needs exactly one match, by flattened whole name.

  (AC-1, AC-6, AC-8, AC-9, AC-18, OFF-3)
- [x] **T6** Embed sweep filtered to thread scope; the export lists memories with class, origin and day under `subject_id = account`; account deletion removes them. Tests: a written memory appears in the export (red today if `subject_id` were null), is not embedded, and is gone after deletion. (AC-18)

## API, feature

- [x] **T7** The `memory` tool on `/internal/v1/tools`, with its turn gate. Tests:
  - remember in a clean turn writes origin `stated`;
  - remember and forget are refused `untrusted_turn` after a link read, a calendar read, a mail turn, a photo, or an untrusted message;
  - never-list text is refused `never_list`, with the text in no log line;
  - forget of an unknown id is `unknown_memory`;
  - over 200 characters is `too_long`.

  (AC-2, AC-3, AC-5, AC-20)
- [x] **T8** Undo: `undoTurn` takes back a turn's remember and restores its forget. Tests both ways, and a forget past the purge is gone for good. (AC-6, OFF-6)
- [x] **T9** The calendar question in the person's terms. First red: the exact sentence at `test/thread-calendars.test.ts:983` gains the person variant. Tests:
  - `with Meera` with no match raises `Filed "Pay mortgage". Which calendar is shared with Meera?` in the person's casing, clipped to 16, within the bound;
  - a tapped answer and a typed answer each write the event and the memory *They share a calendar with Meera.* with `calendar_id` and no calendar name;
  - `Not that` writes none;
  - a second answer supersedes;
  - the next `with Meera` settles with no question, no `sharedWith` call and over the thread's pick, and still waits on a shared calendar;
  - a deleted or un-approved calendar asks again;
  - two memories for one name ask.

  (AC-7, AC-8, AC-9)
- [x] **T10** The daily run books `account.memories` on the predicate and sweeps. Tests:
  - booked after a trusted message of the person's, a question included;
  - not booked for a mail-only day or a day with no messages;
  - once per day by idempotency;
  - not booked while `switch.nightly` is off;
  - a learned memory whose source message was deleted is removed by the sweep.

  (AC-10, AC-18)
- [x] **T11** `/internal/v1/memory-result`. Tests:
  - the shown set is re-derived, and a cite outside it drops that add;
  - at most 5 adds;
  - none at 25 learned;
  - `rules` refused;
  - a sensitive word dropped;
  - an asked memory not superseded without a later message of the person's;
  - a cite of a forgotten memory's message dropped;
  - a fold supersedes both;
  - the 30-day purge of superseded learned rows;
  - one repair then nothing applied;
  - a second post applies once;
  - the ledger row is scheduled;
  - `memories_at` is stamped.

  (AC-11, AC-12, AC-13, AC-20)
- [x] **T12** Admin: the job's name, and memories counted apart from notes. (AC-20)

## Agent

- [x] **T13** `context.py` reads memories into `DumpContext` and `AnswerContext` as rules and known, and `Thread.shared`. Tests: bounded at 50, never dropped by `fit`, another account's never read. (AC-14, OFF-8)
- [x] **T14** The block's placement: a user-turn block with its own cache breakpoint, the rules list headed as their words and the rest as data, nothing in the system prompt. The reach test lists every request builder and asserts only filing, answering, the thread pass and the memory pass carry it. (AC-14, AC-15, SEC-1)
- [x] **T15** The `memory` tool and `SayReason` `remembered`. Tests:
  - the schema's keys;
  - the definition budget measured (stop and ask the owner if it does not fit);
  - a turn whose record holds only an `ok` memory result may say `remembered`, and a turn without one may not.

  (AC-4)
- [x] **T16** `plan_v2.md` and `answer.md`: the asked path and its fixed lines, the shared-thread wording rule, the web-query rule, and "what do you remember about me". Through the `test-llm` skill, as any prompt change is; the model-calls page is republished. (AC-4, AC-16, AC-17, AC-18)
- [x] **T17** `memories.py` and `prompts/memory.md`: the bounded reads (60 by 500, questions included, `memory_forgotten` excluded; 40 trusted own thread notes; 50 memories), the forced schema without `rules`, one repair, the post. Tests on the reads' predicates against fixtures, mirroring `nightly.py`'s. (AC-10, AC-11, OFF-5, OFF-8)

## Evals

- [ ] **T18** With the owner, the fixtures: a handful of synthetic people, each with a week of messages, some thread notes and some memories, and the memories each should and should not end with. This is the set the owner asked to develop together, written before the prompt is tuned against it. Held-out people are kept apart.
- [x] **T19** `29-memories.json` and the `memory` surface in `run.py`, with the blocking and measured cases from the impl-spec's Evals. The three injection cases go in `15-injected-text-is-data.json`. **Not run without the owner's explicit yes in the session.** (AC-19)
- [ ] **T20** With permission: run, read the report, change the prompt only where failures agree, then measure on the held-out set. The blocking set at 100% on two runs and the measured set at 90% before merge.

## Close

- [ ] **T21** Full gates in the worktree: the suites on the isolated database, lint, typecheck, `ruff`, the three `dead-*` scripts. Then code, security and client reviews. Then the PR.

## Built, 2026-10-05

- **What was found by running it end to end:** the worker's database role could not read `accounts.memories_at` or `memory_forgotten`. The suite connects as the owner and never saw it; 0085 grants both, read only, and `agent-role.test.ts` holds it.
- **T19's cases** are a first set I wrote. The 16 in `29-memories.json` passed 16/16 twice, and the two injection cases in principle 15 passed. T18 still owes the owner-built fixtures, a few synthetic people each with a week of messages; the narrow runs so far cost about $3.
- **Also found by the evals:** `plan_v2.md` still said "'My calendar' names none", which contradicted PR 82's tool description. Fixed here, and principle 8's naming cases pass twice each.
