# 032 Fewer, better model calls: implementation

## Constitution gate

| Principle | Status | Evidence |
| --- | --- | --- |
| DEV-1 | compliant | Quick add is removed, not replaced; the nightly pass reuses `applyCompaction` and `applyProposals` and adds one function, `applyLearned`. |
| DEV-2 | compliant | 014, 025, 028 and `context-and-memory.md` are amended in the same change (AC-20). |
| QUAL-1 | compliant | Every task below starts with a test seen red. |
| SEC-1 | compliant | Messages and notes reach the model in the user turn as JSON entries under a data label; nothing a person wrote is in a system prompt. |
| SEC-2 | compliant | The Core API re-derives which messages a pass may cite and which notes it may touch, from the job row and the database, never from the worker's body. |
| OFF-1 | compliant | Learned notes are derived and removable by offload; the pass deletes only notes offload wrote. Logs carry counts and ids only (AC-16). |
| OFF-3 | compliant | A pass runs as one member and changes only that member's notes; a learned note is authored by that member. |
| OFF-5 | compliant | Forced tool, validated schema, one repair through a `tool_result`, then nothing applies. |
| OFF-6 | compliant, conditional | Learned notes join the reversible allowlist as compaction did on 2026-09-10: automatic, offload-owned surface, destroying nothing, deletable by their author, mutable by any member. The `decisions.md` entry is a task, and lands on `main`. |
| OFF-7 | compliant | The placeholder copy and the spinner's removal get one design `decisions.md` entry, on `main`. |
| OFF-8 | compliant | 100 notes, 40 messages of 500 characters, 200 candidates for proposals at 200 characters: constant in account age. |

`GATE: PASS`

## Data flow

1. `account.daily.run` (Core API) books `thread.nightly` jobs for its account: one per thread the account is an accepted member of where a note it authored changed in 25 hours, or the thread is over `NOTE_PROMPT_BUDGET`, or it has a landed message in the thread in 25 hours; and one for its default thread when its notes need it or `shouldPropose` holds. Payload `{ threadId, propose }`, key `thread.nightly:<thread>:<account>:<day>`, background priority, two attempts. No `notes.compact`, `loose.propose` or `labels.sort` is booked.
2. The worker (`nightly.py`) claims `thread.nightly`, checks membership, reads the thread's active trusted notes (up to 100, newest first, then oldest first for the model), and either the member's landed messages (ordinary thread) or the proposal candidates (default thread). One forced-tool call on `cfg.nightly_model`, one repair as a `tool_result`.
3. It posts `/internal/v1/nightly-result` with the plan, the candidate ids it sent, the message ids it showed, and usage.
4. The Core API, in one transaction: refuses a job that is not running (applies once); checks membership; holds `supersede`, `remove` and `add.foldedFrom` to notes authored by the job's account; runs `applyCompaction`; runs `applyLearned`, which re-derives the eligible message set in SQL and drops anything outside it; runs `applyProposals` for the default thread; writes ledger rows as `thread.nightly`, scheduled; closes the job.

## Interfaces

**Job payload** `{ threadId: uuid, propose: boolean }`.

**`POST /internal/v1/nightly-result`**
```
{ jobId, usage?,
  supersede: uuid[] (<=200), remove: uuid[] (<=200),
  add: [{ text (1..200), foldedFrom: uuid[1..50], occursAt?, occursEndAt?, dueAt? }] (<=100),
  learned: [{ text (1..200), from: uuid[1..10], occursAt?, occursEndAt?, dueAt? }] (<=3),
  sent: uuid[] (<=50), groups: [{ name, ids }] (<=10) }
-> { superseded, removed, added, learned, proposals, ignored }
```

**`applyLearned(trx, { accountId, threadId, entries })`** in `threads/notes.ts`. Per entry: the text trimmed, 1 to 200 characters, one line; every `from` id is a message of `accountId`, role person, not deleted, not untrusted, source not in mail, gmail, calendar, browser, created in the last 25 hours, with a live content row or note in `threadId` derived from it; no active note in the thread has the same text, compared case-folded and trimmed; the account holds fewer than `LEARNED_CAP` (20) active learned notes in the thread. Written through `addNote` with `origin: "learned"`, `derivedFromMessageId` the first cited id. No `noteAddition` call.

**Prompt** `prompts/nightly.md`, assembled by `prompt_files.load` into two fixed variants by markers: `<!-- learn -->` for ordinary threads, `<!-- propose -->` for the default thread.

**Model input** (user turn, one text block under a data label):
```
Today is <day>.
Thread: "<name>"
Notes, oldest first, one JSON object per line:
{"id": "...", "written": "2026-10-01", "yours": true, "by": "typed" | "assistant", "text": "..."}
What you dumped into this thread since yesterday, newest first:
{"n": 1, "day": "2026-10-02", "text": "..."}
```
or, for the default thread, the 028 candidates as `{"n": 1, "kind": "task", "text": "..."}`.

## Volume and access

| Field | Estimate |
| --- | --- |
| Passes per active account per night | 2 typical (threads with that day's activity), 15 heavy |
| Notes read per pass | 10 typical, 100 cap |
| Messages read per pass | 3 typical, 40 cap |
| Input tokens per pass | 2,000 to 4,000 typical, about 15,000 cap |
| Learned notes per thread per member | 0 most nights, 3 cap, 20 active cap |

The booking query runs once per account per day over that account's threads; the landed-message test is an `exists` on `content.derived_from_message_id` and `notes.derived_from_message_id`, both indexed, filtered by `messages.account_id` and `created_at`. No new table, column or index.

## What goes

- **Quick add (done in task group A):** `thread.quick_add`, its worker path, prompt, context, result route and tool restriction; `filing_at` writes; the client spinner; the eval surface.
- **Label sort:** `label_sort.py`, `prompts/label_sort.md`, `labels.sort` booking and `NIGHTLY_LABEL_SORT`, `sortableThreads`, `/internal/v1/labels-sorted`, `test_label_sort.py`, `labels-nightly.test.ts`, principle 26. `labels.ts`'s sort-record readers stay for the Activity rows already written.
- **`notes.compact` and `loose.propose`:** their bookings, endpoints, worker modules (`compact.py`, `loose_propose.py`) and prompts, folded into `nightly.py`, `nightly.md` and `/internal/v1/nightly-result`.

## Edge cases

- A member left between booking and the run: the worker finishes the job; the endpoint refuses it whole.
- A shared thread where two members both had activity: two passes, each touching only its own member's notes.
- A message whose row was moved out of the thread since: no longer landed there, so it cannot be cited.
- A learned note equal to a typed one: not added.
- The default thread with proposals switched off (`LOOSE_PROPOSALS=off`): its pass compacts only.
