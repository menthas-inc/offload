# 017 Saying what it is doing, and stopping it, implementation spec

**Status:** drafted 2026-09-14
**Reads with:** `feature-spec.md`, and `../016-reaching-the-web/research.md` §4 and §9

## Data flow

Both halves ride rails that already exist. Neither needs a new transport.

**The brief, outward:**

1. The worker, between steps of the tool loop, posts a line to
   `POST /internal/v1/turn-step` with the message id.
2. The Core API writes it to one column on the message and `pg_notify`s the
   channel `answers.ts` already listens on, with a payload that says this was a
   step rather than a result.
3. The SSE loop in `dumps.ts` wakes, reads the column, and sends a `step` event.
   `GET /v1/messages/:id` returns the same column, so a client that reconnected
   or fell back to polling catches up.
4. When the turn settles, the column is cleared in the same transaction that
   writes the result. The column holds the current step and never a log.

**The cancel, inward:**

1. `POST /v1/turns/:turnId/cancel`, authenticated and scoped, marks the turn's
   job `cancelled` and `pg_notify`s a second channel.
2. The worker holds one listening connection, the same shape `answers.ts` uses,
   and cancels the asyncio task running that job. The in-flight model request is
   abandoned by the cancellation, which is what `httpx` does when the task
   holding it is cancelled.
3. The worker posts `outcome: "cancelled"` with whatever landed, or posts
   nothing if it was killed mid-call, in which case the Core API settles the turn
   from the job's state on its own.
4. The client does not wait for any of this. It stops watching the moment the
   control is pressed.

## Data model

```sql
alter table messages
  add column step text,              -- the current line, null the rest of the time
  add column step_at timestamptz;    -- so a stale step from a dead worker is ignorable

alter table jobs
  add column cancelled_at timestamptz;
```

`step` is capped at 80 characters by a check constraint as well as by the code
that writes it, because AC-4 says the cap is the server's and a constraint is the
version of that claim which survives a second writer.

No new table. A step is not a log and there is nothing to accumulate.

## Volume and access

| Field | Number |
| --- | --- |
| Records per account | None added. Two columns on a row that already exists. |
| Fan-out | Steps per turn: 0 for a turn under the threshold, 2 to 5 for a turn with a lookup in it. Each overwrites the last. |
| Growth | Zero. The column is cleared when the turn settles. |
| Read pattern | The SSE loop on each wake, and `GET /v1/messages/:id` on reconnect. Both already read this row. |
| Write pattern | One update per step, 2 to 5 per long turn, none on a short one. |
| Sort and filter | None. The step is read by message id, which is the primary key. |

- **Pagination:** not applicable.
- **Indexes:** none. Both reads are by primary key.
- **Normalisation:** the step lives on the message rather than in a table
  because there is exactly one and it is disposable. A table would invite a
  history nobody asked for, which is AC-2 stated in DDL.
- **Partitioning:** no.

## Interfaces

- **`POST /internal/v1/turn-step`**: `{messageId, text}`. Worker to Core API,
  the same authentication `turn-result` uses.
- **`POST /v1/turns/:turnId/cancel`**: person to Core API. 404 for a turn that is
  not theirs, which is how the rest of this API refuses rather than 403.
- **SSE gains a `step` event**: `{text}`.
- **`GET /v1/messages/:id` gains `step`**, null on anything settled.

## What the brief may contain, and where that is enforced

Free text, in offload's voice, capped at 80 characters by the constraint above.

**It may not contain anything the turn read.** That is the 017 half of a finding
from 016's security pass: a page title is written by whoever owns the page, and a
line reading "Payment failed, verify your card" drawn in offload's own progress
line is a phishing message the product rendered itself. The step is written by
the planner from what it is about to do, and the reader's output never reaches
it. The eval in T-8 is what holds that.

It is never written to a log, an event or a trace, and it does not survive the
turn. That is what makes free text allowable at all: it is shown to the person
whose content it describes and goes nowhere else.

## Edge cases

- **A worker that dies mid-turn** leaves a step behind. `step_at` is what makes
  that ignorable: a step older than the job's own timeout is not drawn.
- **A cancel that arrives after the result.** The result wins. The cancel
  endpoint is idempotent and returns the turn's settled state.
- **A cancel during a tool call.** The task is cancelled between awaits, and a
  Core API write already in flight completes. Cancel never rolls anything back;
  undo is the thing that does that.
- **Two clients watching one turn.** Both get the step. One cancels, both stop.
- **A turn that settles between the threshold and ten seconds** never draws the
  cancel, which is correct and is the common case for a lookup turn.
- **Reduced motion** changes nothing: the line is text, not movement.

## Constitution check

OFF-1: the step is never logged, never evented, never stored past the turn, and
the column is cleared by the transaction that settles the turn. OFF-5: the step
is not a model output crossing a boundary into a decision, it is a string
rendered to its own author, and it is length-checked at the boundary anyway.
OFF-6: cancel destroys nothing and undo is untouched. SEC-2: the cancel endpoint
resolves the turn to the account server-side. OFF-8: nothing enters a prompt.
