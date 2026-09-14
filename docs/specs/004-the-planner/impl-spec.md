# 004 The planner, implementation spec

> How. The what and the why are in `feature-spec.md`.

## Shape

```
web  ──POST /v1/dumps──────────────▶  core-api  ──enqueue dump.answer──▶  jobs
     ◀─SSE /v1/messages/:id/stream─┘

                                      agent (python)
                                        │  claim
                                        │  read context  ────────────▶ postgres (read only)
                                        │
                                        │  ┌─ model call ─────────────▶ anthropic
                                        │  │      │
                                        │  │      ▼ tool_use
                                        │  └── POST /internal/v1/tool-call ──▶ core-api ──▶ writes content
                                        │         │
                                        │         ▼ tool_result back into the loop
                                        │
                                        └─ POST /internal/v1/turn-result
```

003 built every arrow here except the tool-call one. **The only new plumbing is the middle box**: a loop instead of one call, and one new endpoint the loop writes through. Everything else this feature adds is schema, Undo and the purge job.

The one-writer rule holds unchanged. Python still writes nothing: `create_thread` and `add_content` are HTTP calls to the Core API, which is what makes AC-5's membership check a server-side check rather than a convention the worker is trusted to follow.

## Data model

### `things` becomes `content`

The table is created here for the first time, so this is a naming decision rather than a migration. What is already in the database and does have to move: **`threads.thing_count`**, created by `0001` and currently always zero because nothing writes content. It becomes `content_count` in `0011`.

The full rename checklist, applied in the same change:

| Where | What |
| --- | --- |
| `apps/core-api/migrations/0011_the_planner.sql` | `alter table threads rename column thing_count to content_count` |
| `apps/core-api/src/schema.ts` | the `threads` interface, plus the new `content` interface |
| `docs/specs/001-data-model/feature-spec.md` | 17 occurrences |
| `docs/specs/001-data-model/impl-spec.md` | 88 occurrences: the `things` section heading and field list, `thing_blobs`/`thing_id`, `memory_sources.thing_id`, `notifications.thing_id`, `threads.thing_count`, `thing_people`, the `readable_things` view, the volume table, the access-path table, the edge cases |
| `docs/specs/001-data-model/tasks.md` | 33 occurrences |
| `docs/tech/decisions.md` | 57 occurrences, including the analytics properties `thing_id` and `thing_type` |
| `docs/tech/architecture.md` | 18 occurrences |
| `docs/tech/context-and-memory.md` | 7 occurrences |
| `docs/constitution/principles.md` | 7 occurrences, in OFF-1, OFF-2, OFF-3 and OFF-6 |
| `docs/tech/stack.md` | 6 occurrences |
| `CLAUDE.md` | the vocabulary line: **thread** holds **content** |
| `.claude/skills/offload-design/decisions.md` | one entry, per the two-decision-logs rule |

**Not renamed:** the design system's kits and explorations. `WThing.jsx`, `data.js` and the 40-odd exploration files are a prototype fixture and a historical record; `CLAUDE.md` already says the kits' fixture vocabulary is residue rather than schema. The `readme.md` vocabulary section is renamed because it is the contract; the explorations are not, because rewriting a log of what was explored is falsifying it.

The one collision is accepted and named in the feature spec: `content` rows and Anthropic `content` blocks live in the same Python file. Locally disambiguated by `ContentRow` in type names and `blocks` for the API's.

### `content`

Only the columns something in 004 writes or reads (DEV-1). The rest of 001's field list arrives with the feature that needs it, and the CHECK on `type` carries 001's full value set because widening a constraint later is a migration and listing eight strings now is not.

```sql
create table content (
  id                       uuid primary key default uuid_v7(),
  account_id               uuid not null references accounts (id) on delete cascade,
  thread_id                uuid not null references threads (id) on delete cascade,
  derived_from_message_id  uuid references messages (id) on delete set null,
  -- 001's full set. 004 only ever writes 'note': task and event need occurs_at
  -- and due_at, which are not columns yet, so a task here would be a note with
  -- a misleading label.
  type                     text not null default 'note'
                             check (type in ('note','link','image','screenshot',
                                             'voice','file','task','event')),
  title                    text not null,
  body                     text,
  source                   text not null default 'person'
                             check (source in ('person','share','gmail','calendar','browser')),
  source_ref               text,
  -- AC-17. The model's own tool_use block id, unique within the turn it was
  -- produced in. See "Idempotency has two halves" below.
  tool_call_id             text,
  attrs                    jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,
  purge_after              timestamptz
);
```

Indexes:

```sql
-- A thread's content, newest first. 001's primary access path.
create index content_thread_idx on content (thread_id, created_at desc)
  where deleted_at is null;

-- The Undo unit, and the resume read. Both ask the same question.
create index content_message_idx on content (derived_from_message_id)
  where deleted_at is null;

-- AC-17, at the storage layer rather than in a handler. Scoped to the message
-- because a tool_use id is only unique within one model response.
create unique index content_tool_call_idx
  on content (derived_from_message_id, tool_call_id)
  where tool_call_id is not null;

-- What the purge job scans. Partial on the predicate it actually uses, so the
-- scan is over the handful of rows in the window rather than the whole table.
create index content_purge_idx on content (purge_after)
  where deleted_at is not null;
create index messages_purge_idx on messages (purge_after)
  where deleted_at is not null;
```

### `messages.state` gains `partial`

```sql
alter table messages drop constraint messages_state_check;
alter table messages add constraint messages_state_check
  check (state in ('queued','seen','answered','failed','partial'));
```

`partial` is what AC-15 and AC-16 need a name for: content landed, the reply describes it, and there is more the turn meant to do. It is distinct from `failed`, which means nothing landed, and from `answered`, which means the turn finished. The composer renders a Retry on `partial` and on `failed` and they resume differently.

### Agent role

`0009` granted the worker `select` on what 003 reads. It gains `content` on the same terms, and nothing else: no insert, no update, no delete anywhere. The worker reads content only to tell the planner what already landed on a resume.

```sql
grant select on content to offload_agent;
```

### Undo, and where `purge_after` lives

One turn is one `turn_id` on `messages`, already there since 0008. Undo soft-deletes:

- the person's message,
- offload's reply, if there is one,
- every `content` row whose `derived_from_message_id` is the person's message.

All three in one transaction, all with the same `deleted_at` and the same `purge_after = deleted_at + interval '8 seconds'`. The conversation row is untouched: a conversation with every message undone is an empty conversation, not a deleted one.

`content.thread_id` is `on delete cascade`, which is right for account deletion and irrelevant here: Undo never hard-deletes.

## Idempotency has two halves, and they are different mechanisms

Worth stating because conflating them is the bug this design is shaped to avoid.

**Within a turn**, the loop posts each tool call over the private network and retries the post on a transport failure, exactly as `_post_result` already does. A post that succeeded and whose response was lost must not file twice. The model's `tool_use.id` is stable across those retries because the retry re-sends the same block, so `(derived_from_message_id, tool_call_id)` unique is the whole answer, enforced by the index rather than by a check in a handler.

**Across a resume**, AC-16's Retry runs a *new* model call, which produces *new* `tool_use` ids. The unique index does nothing there and is not meant to. What stops a resume filing the same piece twice is context: the planner is told, in a trusted block, exactly what already landed for this message, and asked to do only the rest. That is a model instruction rather than a constraint, which is weaker, and it is why AC-15 puts the durable half first: **nothing already written is ever lost or rewritten by a resume**, and a duplicate is a wrong answer rather than a lost dump.

## Interfaces

### `POST /internal/v1/tool-call`

One endpoint, a discriminated union on `tool`. One endpoint rather than two because the auth path, the job lookup, the account derivation and the per-turn bound are identical, and duplicating them is how two of them drift.

```
authorization: Bearer <INTERNAL_SERVICE_TOKEN>

{ "tool": "create_thread", "jobId": uuid, "toolCallId": string,
  "name": string (1..80) }

{ "tool": "add_content",   "jobId": uuid, "toolCallId": string,
  "threadId": uuid, "title": string (1..200), "body": string (0..4000) }
```

Response, always 200 with a body the loop can hand straight back to the model as a `tool_result`:

```
{ "ok": true,  "threadId": uuid, "threadName": string }          create_thread
{ "ok": true,  "contentId": uuid, "threadName": string }         add_content
{ "ok": false, "error": "unknown_thread" | "limit_reached" }
```

Failures are 200 with `ok: false`, not 4xx. A tool that fails is data the planner is meant to read and recover from (AC-14); an HTTP error is a transport problem the loop retries. Making the two the same status is how a refusal gets retried three times and a network blip gets shown to the model as a refusal.

Properties, each one an acceptance criterion:

- **The account comes from the job row** (AC-7), looked up `where id = :jobId and kind = 'dump.answer'`, exactly as `turn-result` already does. A body naming an account is not merely ignored; there is no field for one.
- **`threadId` is validated against `thread_members` for that account, on every call** (AC-5), with `state = 'accepted'`. Not against `threads.created_by_account_id`, which is informational and which OFF-3 forbids as a permission.
- **One failure reason** (AC-4). A thread that does not exist and a thread that is somebody else's both return `unknown_thread`. Two reasons would make the endpoint a membership oracle for any thread id a compromised worker could guess.
- **The per-turn bound is enforced here** (AC-18) by counting `content` rows for this message and returning `limit_reached` past `MAX_TOOL_CALLS`. The loop counts too; this is the one that holds when the loop's counter is wrong. **It counts filings, not tool calls**: a `create_thread` writes no content row and so is bounded only by the loop's `MAX_MODEL_CALLS`. A real gap and a small one, since the failure mode is empty threads a person can delete rather than a bill.
- **`create_thread` inserts the thread and the creating account's `thread_members` row as `accepted`** in one transaction, matching `promote.ts`. A thread with no members is unreachable by every query in the product.
- **`add_content` bumps `threads.content_count` and `threads.last_activity_at`** in the same transaction as the insert, per 001's denormalisation rule.
- **`add_content` is idempotent** on `(derived_from_message_id, tool_call_id)` via `onConflict(...).doNothing()` plus a re-select, so a retried post returns the same `contentId`. **`create_thread` is not**, and that is a decision rather than an omission: there is no natural key, since two threads may share a name within an account, so an upsert on the name would silently hand back somebody else's thread. A retried create makes a second empty thread instead, which is visible and deletable. The weaker of the two halves, and the right side to be weak on.

### `POST /internal/v1/turn-result`, extended

The union gains a third arm:

```
{ "outcome": "partial", "jobId": uuid, "replyText": string, "usage": {...} }
```

which writes the reply exactly as `answered` does and sets the person's message to `partial` instead of `answered`. The idempotency guard changes from `state !== 'seen'` to `state !== 'seen' && state !== 'partial'`, because a resume's result arrives against a message that is `partial` rather than `seen`.

`usage` becomes an **array** rather than one object (AC-20): a turn is several model calls and each writes its own `llm_usage` row. The existing single-object shape is accepted for one release and mapped to a one-element array, so a worker and an API deployed a minute apart do not lose a ledger row.

### `POST /v1/turns/:turnId/undo`

Session-authenticated, the person's own. Soft-deletes the three sets above in one transaction, `where account_id = :account and deleted_at is null`.

Idempotent by construction (AC-11): the second press matches zero rows and returns `{ "undone": false }`. Returns `{ "undone": true }` the first time.

**No server-side time window.** The eight seconds is the toast's lifetime in the client. A server window would add a clock-skew failure mode to defend against a person deleting their own content, which is not a threat and is arguably a feature. Written down because the acceptance criterion says "available for eight seconds" and a reader would otherwise look for the check.

### `GET /v1/conversations/current`, extended

Each message gains `turnId`, so the composer knows what an Undo would undo, and `state` already carries `partial`.

## The loop

`apps/agent/src/offload_agent/harness/plan.py`, replacing `answer.py` as the worker's entry point. `answer.py` is deleted rather than kept: it was the pretence, and a second path to a model that files nothing is exactly the thing this feature retires.

```python
MAX_MODEL_CALLS = 6      # round trips
MAX_TOOL_CALLS  = 8      # per turn, mirrored by the Core API
```

The shape, deliberately dull:

```
blocks = build_blocks(ctx)                    # 003's, plus a landed-so-far block
messages = [{"role": "user", "content": blocks}]

for call in range(MAX_MODEL_CALLS):
    response = await client.messages.create(model=..., tools=TOOLS, system=[...], messages=messages)
    record_usage(response)                    # AC-20, every call

    if response.stop_reason != "tool_use":
        return Finished(reply=text_of(response), landed=landed)

    results = []
    for block in tool_use_blocks(response):
        if block.name not in TOOLS_BY_NAME:   # AC-8, closed set, explicit branch
            results.append(refusal(block, "unknown_tool")); continue
        try:
            args = SCHEMAS[block.name].model_validate(block.input)   # AC-13
        except ValidationError as exc:
            results.append(refusal(block, shape_only(exc))); continue

        if len(landed) >= MAX_TOOL_CALLS:
            results.append(refusal(block, "limit_reached")); continue

        outcome = await post_tool_call(block.name, block.id, args)   # the only writer
        if outcome.ok: landed.append(outcome)
        results.append(tool_result(block, outcome))

    messages += [assistant(response.content), user(results)]

return Partial(landed=landed)                 # ran out of round trips
```

Points that are decisions rather than plumbing:

- **`stop_reason` drives the loop, not the presence of text.** A response can carry both a paragraph and a tool call.
- **Tool results re-enter as `tool_result` blocks with `is_error` set on failures** (AC-21). They are data. Nothing from a tool result is ever concatenated into a system prompt or a trusted block, and `add_content` returns only ids and the thread name it was given, never pre-existing content text.
- **`refusal()` carries the shape and never the arguments.** A validation error message from pydantic quotes the input value, which is the person's dumped text, and that string goes into a model turn and could go into a log. `shape_only()` reduces it to field names and expected types.
- **A tool name the model invented is refused and reported back**, not raised. The model is capable of recovering, and raising costs the whole turn including whatever already landed.
- **Running out of round trips is `Partial`, not an error.** Content that landed stays landed.

### Tools

Defined once, in `harness/tools.py`, as pydantic models plus the Anthropic tool schema generated from them, so the schema the model sees and the schema the loop validates against cannot drift.

```python
class CreateThread(BaseModel):
    name: str = Field(min_length=1, max_length=80)

class AddContent(BaseModel):
    thread_id: str          # AC-6: an id, never a name
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=4000)
```

**AC-6 needs the ids in context**, which 003's `context.py` does not provide: it selects `t.name` only. It gains `t.id`, and the trusted block becomes a list of `id  name` pairs. The token cost is a UUID per thread against a cap of 12 threads, which is inside the existing budget.

### Prompt

`prompts/plan_v1.md`, replacing `answer_v1.md`. Frozen, no account data, cacheable, same as 003. What changes: it describes the two tools, says that every piece of content needs a thread and that `default_thread_id` is where anything with no obvious home goes, and it says the reply names the threads written to and nothing else (AC-3, AC-23).

The Miscellaneous thread is passed in the trusted block, flagged, rather than left for the model to find by name (AC-2).

### Context, extended

`load()` gains a fourth read, for AC-16:

```sql
select c.id, c.title, t.name as thread_name
from content c join threads t on t.id = c.thread_id
where c.derived_from_message_id = :message_id and c.deleted_at is null
order by c.created_at
```

Empty on a first attempt, which is the common case and costs one indexed lookup returning nothing. Non-empty on a resume, and rendered as a trusted block: "Already filed for this dump, do not file these again." Titles come from our own database and are trusted for provenance, but they are model-derived from the person's text, so they are inside the OFF-1 boundary for logging (AC-22) even though they are outside the SEC-1 boundary for instruction.

## The numbers

| | Value | Why |
| --- | --- | --- |
| `MAX_MODEL_CALLS` | 6 | Two pieces of content is one call to plan and one to reply. Six leaves room for a failed tool and a recovery, and bounds the bill. |
| `MAX_TOOL_CALLS` | 8 | 001's own figure for a dump is "several". Eight is generous and finite. |
| `MAX_THREADS` in context | 12 | Unchanged from 003, now carrying an id each. |
| `MAX_TURNS` in context | 20 | Unchanged. |
| `MAX_PROMPT_TOKENS` | 8,000 | Unchanged. Tool definitions add roughly 300 tokens. |
| Tool-definition budget | 1,500 tokens | AC-19's second half. Two tools use ~300. At 1,500, which is roughly ten tools, they move behind `defer_loading`. |
| `UNDO_WINDOW_MS` | 8,000 | OFF-6 and the readme. Client-side. |
| `purge_after` | `deleted_at + 8 seconds` | 001. |
| `PURGE_CEILING` | 500 rows | AC-12. See below. |
| Model | `claude-sonnet-5` | Unchanged from 003. |

## The purge job

`content.purge`, owned by the Core API's runner, not by the worker: it is a write, and writes are the Core API's.

```sql
delete from content
where deleted_at is not null and purge_after < now()
```

and the same for `messages`. Both in one transaction, content first so a foreign key can never orphan.

AC-12's four properties:

- **Both predicates, always.** `purge_after < now()` alone would delete rows that were never soft-deleted, since `purge_after` is nullable and null compares false, but a future column default or a partial write makes that a one-character distance from a mass delete. Both conditions are stated even though either implies the other today.
- **A whole turn's rows in one transaction**, so a crash mid-purge cannot leave a message whose content is gone.
- **The only holder of hard-delete rights on these tables.** `offload_agent` has none. The Core API's runtime role has `delete` on `content` and `messages`; a follow-up narrows that to the purge path, and until then the fact that this is the only `delete` in the codebase is what a test asserts.
- **It halts rather than continues past the ceiling.** It counts first; if the count exceeds `PURGE_CEILING` it logs the count and deletes nothing. 500 is far above any real run, which is a handful of rows a day, and far below what a bad predicate would produce. A purge job that suddenly wants to delete 40,000 rows is a bug, and the right response to a bug in a delete is to stop.

Scheduling: the runner ticks every second already. `content.purge` is enqueued with `run_after = now() + 10 seconds` by the undo endpoint itself, in the same transaction as the soft delete, and the job is idempotent so overlapping enqueues are free. No cron, no new process. *This is deliberately a consequence of a delete rather than a timer: a timer that stops running leaves content the person believes is gone, and nothing notices.*

## The screen

`apps/web/src/app/(app)/today/page.tsx` and `lib/dump.ts`.

- **Undo is a `Toast`**, the existing component contract, "float it above the composer with 16px of side gutter", message `Sorted into Lisbon trip` and action `Undo`. Eight seconds, then it goes. Nothing new is designed.
- The toast's message names the threads, from the reply's own turn, so what the toast says and what the reply says come from one source.
- **`partial` renders the reply plus one inline line**, reusing the treatment 003 invented for `failed`: inline and persistent rather than a toast, because a toast that clears itself takes the only route back with it. Copy: `Didn't finish that one.` (reworded 2026-09-14 by the voice change in 016) with `Finish it` beside it.
- `Finish it` POSTs to `/v1/dumps/:messageId/resume`, which enqueues a fresh `dump.answer` job for the same message and returns the same envelope `POST /v1/dumps` does, so the composer's existing wait path is reused unchanged.
- `Try again` on `failed` keeps 003's behaviour: it puts the text back in the composer, because nothing landed and there is nothing to resume.

Both are entries in the design system's `decisions.md`, per OFF-7 and the two-logs rule.

## Dependencies

None new. The Anthropic SDK's tool use is the same `messages.create` this already calls.

## Edge cases

- **A resume after the thread was deleted.** `add_content` returns `unknown_thread`, the planner picks another thread or Miscellaneous, and the reply says where it actually went.
- **The model creates a thread and then fails to add to it.** An empty thread survives. Correct: the person can see it and delete it, and deleting it on failure would race a resume that was about to fill it.
- **Undo on a turn that is still running.** Soft-deletes what exists; the job completes and writes a reply against a soft-deleted message. Prevented by `turn-result`'s existing guard, which requires the person's message to be `seen` or `partial` and finds it neither, so the result is discarded as `already`. Content the tool loop already filed is soft-deleted by the undo and is not resurrected, because the tool endpoint writes rows and never revives them.
- **Two dumps in flight, one undone.** `turn_id` scopes everything, and the per-account cap is 2, so this is reachable in normal use rather than exotic.
- **A dump that mentions a thread by a name the account does not have.** The planner creates it, which is the product working. There is no fuzzy match, on purpose: a near-match to the wrong thread is worse than a duplicate thread.
- **`account.default_thread_id` is null.** Only possible for an account that was never promoted, which cannot dump. The tool endpoint returns `unknown_thread` rather than inventing a thread, and the case is asserted rather than assumed.
- **The reply names a thread the tool call actually failed on.** This is AC-23's failure mode and the one worth testing hardest: the reply is generated from the model's own idea of what it did, and the loop's `landed` list is the record of what happened. The test compares the thread names in the reply against `landed` on a body of dumps.

## Constitution check

| | |
| --- | --- |
| DEV-1 | Two tools, not four. Content carries the columns 004 writes and no others. |
| DEV-2 | `architecture.md` step 4 and `decisions.md`'s `sort` entry are amended in this change, not after it. |
| DEV-3 | A loop over the SDK. No agent framework. Prompts in git. |
| QUAL-1 | `tasks.md` maps every one of the 23 criteria to a test. |
| QUAL-2 | Each task is one thing. The rename is its own task and lands before anything is built on it. |
| SEC-1 | AC-21. Tool results are `tool_result` blocks; nothing from one reaches a trusted block. |
| SEC-2 | The account comes from the job row and there is no field for one in the body. |
| DATA-1 | This document carries the schema, the indexes, the volumes and the access paths before any of it is written. |
| OFF-1 | AC-22, widened: thread names and titles are content. Asserted by the existing isolation test, extended to tool arguments and results. |
| OFF-2 | No blobs. |
| OFF-3 | `thread_members` with `state = 'accepted'`, never authorship. |
| OFF-4 | No connectors. |
| OFF-5 | Tool arguments validated against pydantic before execution, and refused rather than coerced. |
| OFF-6 | Eight seconds, nothing destroyed, one `purge_after` per turn, and the purge is enqueued by the delete rather than by a timer. |
| OFF-7 | `Toast` is the existing contract. The `partial` line reuses 003's `failed` treatment, and both are logged. |
| OFF-8 | Prompt bounded by count and by tokens; tool definitions have their own stated budget. |
