# 008 Thread memories, implementation spec

> How. Grounded in `001-data-model`, which specified this table and never shipped it.

## Shape

One migration, one module, three routes, two new tools and one changed tool result, one section on the thread page. No job, no schedule, no embedding.

The whole feature is small on purpose. What makes it worth writing down is the handful of places where the obvious implementation is wrong: the cap under concurrency, the account id that looks like an authorization input and is not, and the polymorphic column that cannot carry a foreign key.

## Data model

### `memories`, and where this diverges from 001

`001-data-model/impl-spec.md:147` specifies the table in full. This creates a subset of it, plus two deliberate changes. **001 is amended in the same change** rather than left describing something else.

```
memories
  id                       uuid pk default uuid_v7()
  account_id               uuid references accounts (id) on delete set null
  scope                    text not null check (scope in ('account','thread','person'))
  subject_id               uuid                       -- a thread_id here; no FK, polymorphic
  kind                     text not null check (kind in ('going_on','person','preference','noticed','standing'))
  text                     text not null
  origin                   text not null check (origin in ('stated','learned'))
  derived_from_untrusted   boolean not null default false
  muted_at                 timestamptz                -- any member; thread-wide
  derived_from_message_id  uuid references messages (id) on delete set null
  attrs                    jsonb not null default '{}'::jsonb
  created_at, updated_at   timestamptz not null default now()
  superseded_at            timestamptz
  deleted_at, purge_after  timestamptz
```

**Change 1: `account_id` exists on thread scope, and is nullable.** 001 says it is NULL when `scope = 'thread'`, and argues that a non-null account id is "a hole in both directions": filter reads by it and the memory is invisible to every member but its author; drop the filter and anyone guessing a thread id reads another thread's memories.

That argument is about **using the column as the authorization predicate**, and it is correct about that. It is not an argument against the column existing. Two things need it and neither is a read filter:

- **Attribution.** A memory carries the account that created it and keeps it, so a shared thread shows who wrote each one (AC-10) and so delete can be author-only (AC-9a).
- **Account deletion.** `on delete set null`, never a cascade. OFF-3 makes this a MUST: account deletion never reaches into a shared thread. The memory stays and loses its name (AC-15).

*`content.account_id` is `on delete cascade` today (`0011_the_planner.sql:31`), which is the same decision made the other way and contradicts both OFF-3 and the privacy page. Nothing exercises it because account deletion is not built. Memories do it correctly rather than copying it.*

So the column stays and the rule around it is the invariant instead: **`account_id` is authorship. It is never an input to an access decision.** Reads resolve through `thread_members` on `subject_id`, always, and that is what `readableMemories` in the module below exists to make unavoidable.

**Change 2: no `standing` unique index.** 001 specifies `UNIQUE (subject_id) WHERE scope='thread' AND kind='standing' AND deleted_at IS NULL`, one standing blurb per thread. Nothing writes a standing memory, so the index is not created. *Create only what has a writer: the lesson `memories` and `people` already taught this repo once, from the other direction.*

**`kind = 'preference'`** for everything this feature writes. It is 001's existing kind for "How you like things", it is tinted accent in the kits, and it needs no new vocabulary. *It stretches slightly over "Ana handles the electrician", which is a fact about handling rather than a taste. Recorded rather than papered over. `standing` was the alternative and it is worse, because the kits already use the word for the summary blurb and redefining it would collide with `Standing`, `threadStanding` and `neutralStanding`.*

**Omitted from 001's column list, deliberately:**

- **`embedding vector`.** Ten short rows per thread are read by primary key on `subject_id`. Nothing searches them, so the column has no reader, and adding it drags pgvector into a migration that does not need it.
- **`memory_sources`.** 001's provenance table is `(memory_id, content_id)`, many sources per memory, which is a compaction shape. A v1 memory has exactly one source and it is a message rather than a content row, so it is `derived_from_message_id` on the row, mirroring `content.derived_from_message_id` which already exists for the same reason. The table arrives with compaction.

### Indexes

```sql
-- The thread page, and every tool result. Covers both.
create index memories_thread on memories (subject_id)
  where scope = 'thread' and deleted_at is null and superseded_at is null;

-- AC-5. A guarantee rather than a convention, which is the only kind that
-- survives a second writer. `add_memory` is called by a model, and a model
-- asked twice about the same thread writes the same sentence twice.
create unique index memories_thread_text on memories (subject_id, lower(text))
  where scope = 'thread' and deleted_at is null;

-- Account deletion (AC-15), and nothing else.
create index memories_account on memories (account_id) where deleted_at is null;

-- The purge sweep, same shape as every other soft-deleted table.
create index memories_purge on memories (purge_after) where purge_after is not null;
```

`superseded_at` is in the partial index predicate even though nothing sets it yet, because 001 is explicit that every current-memory query must filter it and the failure mode of forgetting is silent growth.

## Volume and access

| | |
| --- | --- |
| Records per account | 10 per thread, hard. 40 threads typical is 400; 300 threads heavy is 3,000. |
| Fan-out | 10 per thread, enforced. There is no heavy case, which is the point of the cap. |
| Growth | Bounded. An account that has existed for three years holds the same ten per thread as one that has existed for a week. |
| Read pattern | The thread page, once per open, with the thread. And the tool endpoint, once per filing tool call. |
| Write pattern | Rare and not bursty. A person types one occasionally; offload writes one when it notices a rule. |
| Sort and filter | `subject_id` with the two soft-delete predicates, ordered by `created_at`. Nothing else. |

**Pagination:** none. Ten rows is the whole set and the cap is what makes that permanently true.

**Normalisation:** no count column. `COUNT(*)` over at most ten rows behind a partial index is cheaper than keeping a counter honest.

## The module: `apps/core-api/src/threads/memories.ts`

Sits beside `access.ts` and reuses it, so authorization has one implementation rather than a second one that agrees today.

```ts
export const MAX_MEMORIES_PER_THREAD = 10;
export const MEMORY_TEXT_CHARS = 200;

/** Every memory on a thread the account can reach. Authorization is
 *  `requireMember` on the thread, never the memory's own account_id. */
export function readableMemories(tx: Executor, accountId: string, threadId: string)

/** One memory by id, resolved to authorization in a SINGLE join, exactly like
 *  `readableContent`. Every by-id route is built on this and none of them
 *  fetches then checks. See the note below: fetch-then-check is a timing
 *  oracle, not a style preference. */
export function readableMemory(tx: Executor, accountId: string, memoryId: string)

/** Insert under the cap, or fail. See the locking note. */
export async function addMemory(tx, { threadId, accountId, text, origin, fromMessageId? })

/** Edit the full text. Never moves `account_id`. Refuses when a model tries
 *  to overwrite a person (AC-6). */
export async function editMemory(tx, { memoryId, accountId, text, byModel })

/** Soft delete with purge_after. `requireAuthor`, not `requireMember`: OFF-3
 *  makes delete the author's, and mute is what every other member gets. */
export async function deleteMemory(tx, { memoryId, accountId })

/** Mute and unmute. Any member, thread-wide, reversible, and it does not
 *  change the count against the cap (AC-9b). */
export async function setMuted(tx, { memoryId, accountId, muted })
```

### By-id routes resolve authorization in one query

`editMemory`, `deleteMemory` and restore address a memory by its own id, and the obvious implementation is to read the row, then check `thread_members` on its `subject_id`. **That is a memory-id oracle.** A nonexistent id runs one query and returns; an id in somebody else's thread runs two and returns the same thing more slowly, so the two are distinguishable by timing and AC-12 is false.

So `readableMemory` is `memories` inner-joined to `thread_members` on `subject_id`, one statement, the same shape `access.ts` already uses for content (`readableContent`, `apps/core-api/src/threads/access.ts:63`). A missing row and an unreachable row are the same absent result on the same path.

### Never catch the unique violation

AC-5's duplicate is handled with `on conflict do nothing` followed by a select, the pattern `add_content` already uses for `tool_call_id` (`apps/core-api/src/routes/tools.ts:619`). **Never a caught `23505`.** Postgres puts the conflicting value in the error's `detail`: `Key (subject_id, lower(text))=(..., 'ana handles the electrician') already exists.` A caught unique violation carries memory text, and from there into a log line or a job error, which is an OFF-1 violation by the shortest possible route. The repo has already paid for this once, on `jobs.last_error`.

### The cap, and why a plain count is wrong

`select count(*)` then `insert` is check-then-act. Two adds racing on a thread at nine both count nine and both insert, and the thread holds eleven.

We own the transaction here, unlike the staff-linking guard that took a lock Better Auth had already released, so a lock works:

```sql
select id from threads where id = $1 for update;   -- serialises adds on this thread
select count(*) from memories where subject_id = $1 and scope = 'thread' and deleted_at is null;
```

The lock is on `threads`, not on `memories`, because there is no row to lock for the eleventh memory. Contention is a non-issue at this write rate, and the alternative, a `position` column with a unique index, needs renumbering on every delete for no benefit.

**Soft-deleted rows are excluded from the count (AC-14).** Otherwise "delete one, add another" fails for eight seconds and the person is told the thread is full while looking at nine memories.

### Authorship and the model

| Actor | `origin` | `account_id` | `derived_from_untrusted` |
| --- | --- | --- | --- |
| Person adds | `stated` | them | `false` |
| offload writes | `learned` | the account whose turn it was | `false` |
| Person edits either | `stated` | **unchanged** | unchanged |
| Any member mutes | unchanged | unchanged | unchanged |
| offload edits its own | `learned` | unchanged | unchanged |
| offload edits a `stated` one | refused (AC-6) | | |

`account_id` on a model-written memory is the account whose turn produced it, because the cascade needs an owner for every row. The screen shows it as offload's, from `origin`, not from the account id.

**`derived_from_untrusted` is `false` for everything this feature writes**, person-typed and offload-written alike. 001 defines the column as marking a memory whose source came from a connected app rather than from the person, and every source here is a person's own dump. It is stated rather than left to the default so the connector spec inherits an explicit rule: **a connector-sourced memory sets it true**, and that is the point at which the two-hop injection path 001 describes becomes live.

**Editing never moves `account_id`.** It is set once, on insert, and the only column an edit touches besides `text` and `updated_at` is `origin`. *An editor column was the alternative and it buys nothing here: the thing worth showing in a shared thread is who put the rule there, and the thing worth deleting on is who owns it, and both are the creator.*

## Routes

All under `requireMember` on the thread, all returning the one generic failure (AC-12).

| | |
| --- | --- |
| `POST /v1/threads/:id/memories` | `{ text }`. 400 on empty or over 200 characters. 409 at the cap, with the count, so the screen can say which control resolves it. Returns the memory. |
| `PATCH /v1/memories/:id` | `{ text }`. Returns `{ memory, previous }`. `previous` is read inside the transaction before the write, because `RETURNING` on an `UPDATE` gives the new value, which the rename endpoint already got wrong once. |
| `DELETE /v1/memories/:id` | **`requireAuthor`** (AC-9a). Soft delete, `purge_after = now() + 8 seconds`. Idempotent: a second call returns `{ deleted: false }` rather than raising. A non-author gets the same generic failure as a non-member, so the response does not teach who wrote it; the screen already knows, from the read. |
| `POST /v1/memories/:id/mute` | `{ muted }`. Any member (AC-9b). Reversible, so it is on the OFF-6 allowlist rather than under the eight-second toast. |
| `POST /v1/memories/:id/restore` | Undo. Reads through the `includeDeleted` path, same as content restore. |

Memories come back with `GET /v1/threads/:id` so the page costs no extra request.

## Tools

### `add_memory`

```
add_memory(thread_id, text)
```

Membership-checked server-side against the job's account (AC-11), text capped at `MEMORY_TEXT_CHARS`, refused at the cap with the single generic reason. Written as `learned`. Records `derived_from_message_id` from the job's message (AC-3).

**Deliberately no `forget_memory` and no `edit_memory` for the model.** offload never deletes (AC-7), and it may edit only its own untouched memories, which is a narrow enough case that the tool would exist mostly to be got wrong. It rewrites by adding, and AC-5's unique index makes a repeat a no-op.

### `add_content` and `create_thread` gain `memories`

Both results carry the target thread's memories as an array of strings. `create_thread` returns `[]`, always, since a thread cannot have memories before it exists; it is in the result anyway so the model sees one shape.

### `edit_content` already exists, and already does this

006 revived it from 004's cut list and `docs/tech/decisions.md:84` records the amendment. It is at `apps/core-api/src/routes/tools.ts:136`, gated on authorship at line 390, and content the model filed this turn carries `account_id` equal to the turn's account. So the self-correction loop works with no change to the tool and no new one.

*This spec's first draft claimed the tool was still cut and argued for reviving it, having read 004's feature spec and not the code. 004 is the stale document: it still lists `edit_content` as out of scope, and 006 amended `decisions.md` without amending it. That amendment is a task here.*

### The prompt bound (AC-17)

```
MEMORY_TEXT_CHARS (200) × MAX_MEMORIES_PER_THREAD (10) × MAX_TOOL_CALLS (8)
  = 16,000 characters, worst case, per turn
```

Every term is a constant. None of them moves as an account ages, which is the whole of OFF-8's requirement, and the assertion is a test rather than an aspiration: a fixture account with 200 threads produces the same bound as one with two.

Memory text enters on the **untrusted channel** with every other tool result (AC-20, and 004's AC-21). That it is also read as instruction is the open hole the feature spec names.

## The screen

`apps/web/src/components/panes/Thread.tsx`, a new section **after To do and before "Everything in here"**. *The feature spec's diagram and an earlier draft of this file disagreed about that, and the diagram was right: "Everything in here" has no cap and no pagination in `WThing.jsx`, so a section placed under it becomes undiscoverable on exactly the threads that have most to say. Ten rows belong next to the other bounded thing on the page.*

**There is no mock for this**, and the thing to borrow from is less obvious than it looked. `find-kit.sh` finds `WThing`, which has no memories section. The nearest chip rows are `WMemories` and `WPerson`'s "What offload knows" (`ui_kits/web_app/WMisc.jsx:200`), and **both are stale**: they pass `Chip variant="soft"`, a prop the governed contract does not declare, retired in `readme.md:352` because "the earlier soft tints sat too close to paper to read as colour at chip size". `WSection` is kit-local scaffolding rather than the governed `SectionHeader`, and it invents a toned count pill that `SectionHeader` has no prop for.

So this is built against the **component contracts**, with the kits as shape reference only. That direction is worth stating because it is the opposite of the usual failure: the kits were read whole, and the kits are behind.

- **`SectionHeader`** with `count`, heading **Memories**. Plain grey pill, which is all the contract has. No tone: a count of standing facts is not waiting on anybody, and blue means waiting on you.
- One **`Chip`** per memory at its default solid fill, no `variant`. `tone="accent"` with `icon="sparkles"` when offload wrote it, `tone="neutral"` when a person did (AC-4). Muted ones take `tone="outline"`.
- **The inferred marker carries text, not just a glyph.** `sparkles` alone fails the readme's own rule that a mark needs a text alternative, and `Chip` has no `aria-label`. The alternative goes in `children` as a visually hidden span, which the contract allows because `children` is a `ReactNode`.
- `onClick` opens the editor, `onRemove` deletes. Both are real props and `Chip.jsx` already stops propagation on the remove glyph, so they compose. **`onRemove` is rendered only for the author** (AC-9a); every other member gets mute from the editor.
- In a shared thread the label carries its author after the text, in a lighter weight, and carries nothing when the author's account is gone. A solo thread carries nothing at all.

**At the cap there is no disabled chip, because `Chip` has no disabled state.** The contract has no `disabled` prop and the component derives interactivity from `onClick` alone, so an add chip without a handler is indistinguishable from one with it. Rather than composing a fake disabled treatment outside the component or growing the contract for one screen, **the add chip is replaced by the cap line**: the affordance is gone and the sentence that replaces it names what to do. *Flagged for the design system anyway, because "a chip that is present and not available" will come up again.*

**`Chip` cannot hold a sentence and does not try to.** It is `white-space: nowrap`, fixed at 30px, with no `max-width` and no `text-overflow`; every label in every kit is under twenty characters and this one runs to `MEMORY_CHIP_CHARS` (60). The width and the ellipsis therefore belong to the truncation, not to `Chip`, and this needs looking at on a device with the larger text size on, where nothing wraps and it gets worse.

### Copy

| | |
| --- | --- |
| Section | `Memories` |
| Add control | `Add`, with `icon="plus"`. Not icon-only: `Standing`'s Share chip pairs glyph and word, and `Chip` has no label prop to hang an accessible name on. |
| At the cap | `This thread already holds ten. Delete one to add another.` |
| Editor | `Edit memory`, a `Sheet` with a multiline `TextField`, its `hint` counting down to 200, and `Cancel` / `Save`. *A commit point rather than the product's usual inline edit, because a 200 character field with a live limit needs somewhere to say no.* |
| Delete toast | `Memory deleted` · `Undo`. **Never the memory's text**: toasts are five words plus an action, and this text runs to 200 characters. |
| Muted | `Muted` on the chip, `Unmute` in the editor. |

**The chip label is a truncation, not a second field.** At a 200 character cap the full text is two lines at worst, so a model-written short label would save a line and a half and cost a job, a failure mode, and a second thing that can go stale. Under `MEMORY_CHIP_CHARS` (60) the chip shows the whole memory; over it, the text truncates on a word boundary. The editor always opens the full text (AC-8). *This is a call rather than a reading of the brief, which asked for a short description with the original behind it. Truncation is that, with nothing to keep in sync.*

**A thread with no memories still renders the section**, holding the add control alone. Hiding it would leave no way to create the first one. *The opposite call to the standing summary, which shows nothing when it has nothing; the difference is that a summary is offload's to write and a memory is yours.*

Client-side only, and web only.

## Edge cases

| | |
| --- | --- |
| Empty or whitespace-only text | Refused. Trimmed before the length check, so 200 spaces is empty rather than full. |
| Over 200 characters | Refused. Not truncated: silently storing something other than what was typed is worse than saying no. |
| Duplicate text on one thread | Returns the existing memory, creates nothing (AC-5). The unique index is on `lower(text)`, so case is not a way around it. |
| Editing into a duplicate | 409, the same shape as the cap and carrying no text. Not silently merged into the existing row, which would destroy one memory to satisfy an edit of another. |
| Thread deleted | Its memories are deleted in the same transaction (AC-16). `subject_id` is polymorphic and carries no foreign key, so nothing cascades and this is an obligation on the delete path rather than a property of the schema. |
| Account deleted, shared thread | The memory stays and `account_id` goes null (AC-15). The chip carries no name, which is distinguishable from yours because every live member's memory does carry one. |
| Account deleted, solo thread | The thread goes and AC-16 takes its memories with it. |
| A muted memory | Off the tool result, on the screen, still counted against ten. Muting is not a way to hold eleven. |
| Delete attempted by a non-author | The generic failure, same as a non-member (AC-9a). |
| Undo window and the cap | A soft-deleted memory does not count (AC-14). |
| A member leaves a thread | Their memories stay. They wrote them into the thread, and the thread is what they belong to. |

## Constitution check

| | |
| --- | --- |
| **OFF-1** | Memory text is dumped text. No event, log, trace or job error carries it (AC-21). The 409 at the cap carries a count and no text. |
| **OFF-3** | Reads are membership; **delete is authorship** (AC-9a), which is the principle's own wording, with mute as the co-owned action exactly as archive is for content. Account deletion never reaches a shared thread. `account_id` decides delete and never decides a read (AC-11). |
| **OFF-4** | Memory text reaches the model on the untrusted channel (AC-20). That it is then read as instruction is open and named. |
| **OFF-5** | Tool arguments are validated against a closed schema; the thread id from a model is re-validated against `thread_members` for the job's account, never trusted. |
| **OFF-6** | "Write or forget a memory" is already on the reversible allowlist in `docs/tech/decisions.md:84`. Editing joins it, reversible by writing `previous` back, and so do mute and unmute. "Forget" leaves it, because no tool implements it. |
| **OFF-8** | The prompt contribution is three constants multiplied, asserted by a test at 200 threads. |
| **SEC-2** | The account comes from the job the Core API minted, never from the tool call. |
| **DATA-1** | Soft delete with `purge_after` on the same eight-second clock as every other table under the undo window, and `memories` joins the purge sweep. |
