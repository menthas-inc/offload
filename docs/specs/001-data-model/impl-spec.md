# 001 Data model, implementation

Grounded in `docs/tech/stack.md`, `architecture.md`, `decisions.md` and `context-and-memory.md`. Postgres on Railway, pgvector, Kysely with hand-written SQL migrations, UUIDv7 keys.

## Conventions

- **Primary keys** are UUIDv7. Time-ordered so they cluster on insert, non-enumerable so an id leaks nothing.
- **`account_id` leads every index** on a content table, because every query is scoped by account or by a grant. This is the discipline that replaces superparent's tenant column.
- **Soft delete is `deleted_at`, plus `purge_after`** set to `deleted_at + 8 seconds` on the rows the undo window covers. A scheduled job hard-deletes past `purge_after`. Nothing is destroyed while the toast is up (OFF-6, AC-5).
- **Timestamps** are `timestamptz`, always UTC.
- **`attrs jsonb`** on `things` and `memories` holds what no screen queries yet. Promoting a field to a column is a normal migration and expected (unstructured-first).
- **No enum types.** Kinds and states are `text` with a `CHECK`, because adding a value to a Postgres enum is a migration that locks and adding one to a check constraint is not.

## Vocabulary mapping

The design system uses **person** for the entity and **connection** for the relationship, and both words are load-bearing, so the schema keeps the distinction rather than collapsing it:

- A **person** is a `people` row. It exists whether or not they use offload.
- A **connection** is a `people` row whose `linked_account_id` is set. That is the only kind of person a thread can be shared with, which is exactly the design's rule that sharing never lets anyone new into offload.

There is no `connections` table; a connection is a state of a person, not a separate thing.

## Tables

### Identity

**`accounts`**
`id` · `state` (`waitlist|invited|active|disabled`) · `display_name` · `email` · `email_verified` · `default_thread_id` (nullable until promotion) · `tier` (`beta`) · `consent_version`, `consented_at` · `created_at`, `updated_at`, `disabled_at`, `deleted_at`

A waitlist signup writes an account in state `waitlist` carrying name and email only, with no keys and no default thread. Promotion moves it to `invited` and creates its account key and default thread in the same transaction. `invited → active` flips when the authenticated person finishes first run, never on an admin action. The admin panel's Waitlist page is `state = 'waitlist'`; its People page is the other three.

**`account_identities`**
`id` · `account_id` · `provider` (`apple|google`) · `subject` · `email`, `email_verified` · `created_at`
Unique on `(provider, subject)`. A new subject links to the account owning its **verified** email. Apple relay addresses cannot be matched, which is documented in `decisions.md`.

**`staff`**
`account_id` · `role` (`support|owner`) · `created_at`
At least one owner, enforced in the delete path, and nobody may remove their own row.

### Keys

**`account_keys`**
`account_id` (pk) · `wrapped_dek` · `wrapped_by` (`db:v1`, later `aws-kms:<arn>`) · `version` · `created_at`, `rotated_at`

**`thread_keys`**
`(thread_id, account_id)` (pk) · `wrapped_tk` · `created_at`
One row per member per thread. Sharing inserts one. Account deletion deletes that account's rows and its `account_keys` row, leaving every other member's copy intact (AC-4).

The object key lives on `blobs.wrapped_object_key`. Four layers, four separately-rewrappable places (AC-11).

### Content

**`threads`**
`id` · `created_by_account_id` (informational) · `name` · `kind` (`now|always`) · `icon` · `is_default` · `thing_count` · `last_activity_at` · `created_at`, `updated_at`, `deleted_at`, `purge_after`

A thread has **no owner column**. It has members, and the creator is simply the first one. `created_by_account_id` records who started it because the UI wants to say so, and it carries no permission: an owner-versus-grantee distinction is a role, and the design's single permission rules roles out.

`kind` distinguishes threads that end from threads that never close, which is the kits' "for now" and "always on". The third group, "older threads", is **derived** from `last_activity_at`, not stored, because it is a function of time rather than a property of the thread. One `is_default` thread per account, enforced by a partial unique index.

**`things`**
`id` · `account_id` (author) · `thread_id` **NOT NULL** · `kind` (`note|link|image|screenshot|voice|file|task|event`) · `title` · `body` · `url` · `occurs_at`, `occurs_end_at` · `due_at`, `done_at` · `needs_attention` · `source_kind` (`person|gmail|calendar|browser`, default `person`) · `source_ref` (nullable) · `attrs jsonb` · `embedding vector` · `sorted_at` · `created_at`, `updated_at`, `deleted_at`, `purge_after`

One table, kind plus promoted columns. `occurs_at`, `due_at` and `done_at` are real columns because the agenda and the to-do lists filter and sort on them and JSONB cannot be indexed for that cheaply. `needs_attention` is set by the sorter and is the Today screen's whole query, so it is a column rather than a derivation. `source_kind` and `source_ref` are the connector seam (AC-6): two columns now so a later connector spec never migrates the busiest table.

**`blobs`**
`id` · `account_id` · `thing_id` · `thread_id` (denormalised) · `r2_key` · `content_type` · `byte_size` · `wrapped_object_key` · `encryption_scheme` · `sha256` · `duration_ms`, `width`, `height` · `created_at`, `deleted_at`

Many blobs per thing, because the composer takes multiple attachments. `thread_id` is denormalised so a move can find and rewrap object keys without joining `things`. `encryption_scheme` records how each object was sealed, so the transfer path can change later without re-uploading anything: bytes currently go through the Core API, which encrypts with AES-GCM and streams ciphertext to R2.

### People and sharing

**`people`**
`id` · `owner_account_id` · `display_name` · `initials` · `linked_account_id` (nullable) · `created_at`, `updated_at`, `deleted_at`

Each account keeps its own address book, so a person row is owned like everything else and there is no cross-account registry. `linked_account_id` set means this person is on offload and threads can be shared with them. Unset means offload knows about them but they are not a user, which is most people in anyone's life. Unique on `(owner_account_id, linked_account_id)` where linked is not null.

**`thread_members`**
`id` · `thread_id` · `account_id` · `invited_by` (nullable, null for the creator) · `state` (`pending|accepted|declined|expired`) · `created_at`, `responded_at`, `expires_at`

Unique on `(thread_id, account_id)`. The creator is inserted as `accepted` with a null `invited_by`, so membership is one concept rather than an owner plus a grants table. Default receiving behaviour is ask-first, so an invitation starts `pending` and expires after 30 days. "Not now" is `declined` and is not a decline in the UI sense: it sits at the top of My threads and never becomes an inbox, which is a client concern, not a schema one.

A `thread_keys` row is created on **accept**, not on invite, so a pending member holds no key and can read nothing.

### Derived

**`memories`**
`id` · `account_id` · `scope` (`account|thread|person`) · `subject_id` (nullable: a `thread_id` or a `person_id`) · `kind` (the chip kind) · `text` · `origin` (`stated|learned`) · `attrs jsonb` · `embedding vector` · `created_at`, `updated_at`, `superseded_at`, `deleted_at`

`origin` exists because corrections beat inference: something a person said outranks something offload worked out, and compaction must never generalise away a `stated` memory. A partial unique index gives exactly one standing memory per thread (AC-8):
`UNIQUE (subject_id) WHERE scope = 'thread' AND kind = 'standing' AND deleted_at IS NULL`

**`memory_sources`**
`(memory_id, thing_id)` (pk) · `created_at`
Provenance (AC-7). Cheap because raw content is never purged, so a source is always resolvable.

### Conversation

**`conversations`**
`id` · `account_id` · `title` · `started_at`, `last_message_at` · `created_at`, `deleted_at`

**`messages`**
`id` · `conversation_id` · `account_id` · `role` (`person|offload`) · `turn_id` · `text` · `state` (`queued|seen|answered|failed`) · `attrs jsonb` · `created_at`

`state` is what the 👀 marker renders: `seen` means offload has the message and has not answered it. `turn_id` groups the messages belonging to one model turn, so an at-least-once delivery cannot double-render an answer.

### Machinery

**`jobs`**
`id` · `kind` · `account_id` (nullable, scheduled jobs may be global) · `payload jsonb` · `priority smallint` · `run_after` · `attempts`, `max_attempts` · `state` (`queued|running|done|failed|dead`) · `locked_at`, `locked_by` · `idempotency_key` (unique) · `last_error` · `created_at`, `updated_at`

Drained with `SELECT ... FOR UPDATE SKIP LOCKED` ordered by `(priority, run_after)`. Interactive jobs take a lower `priority` number than scheduled ones, which is how scheduled work is stopped from starving interactive work. Enqueue happens in the same transaction as the write that caused it (AC-9).

**`llm_usage`**
`id` · `account_id` · `job_kind` · `category` (`interactive|scheduled`) · `model` · `input_tokens`, `output_tokens`, `cache_read_tokens` · `cost_micros` · `latency_ms` · `created_at`

**`analytics_events`**, an outbox
 `id` · `name` · `version` · `payload jsonb` · `emitted_at`, `shipped_at`
The one table retention applies to, along with logs and traces. Nothing here carries content (OFF-1).

## Volume and access

Estimates. Stating a number we later find wrong is useful; leaving it blank is not.

| Table | Per account, typical | Heavy | Growth |
| --- | --- | --- | --- |
| `threads` | 40 | 300 | 1 to 3 a week |
| `things` | 600 | 20,000 | 5 to 20 a day active |
| `blobs` | 300 | 12,000 | tracks things |
| `memories` | 150 | 500 | **bounded by compaction, does not grow with age** |
| `people` | 25 | 250 | slow |
| `thread_members` | 12 | 120 | slow |
| `conversations` | 200 | 3,000 | 1 to 5 a day |
| `messages` | 2,000 | 40,000 | 10 to 40 per conversation |
| `jobs` | transient | | roughly one per dump plus scheduled |

Fan-out worth naming: **things per thread** is 15 typical and 500 heavy, and the heavy case is real, since a "Read later" thread accumulates for years. That is the number that decides pagination.

`memories` is the row that must not grow with account age. If it does, OFF-8 is being violated and compaction is not working.

### Queries, and the index each needs

| Screen | Query | Index |
| --- | --- | --- |
| Today, priority | things needing you | `(account_id, created_at DESC) WHERE needs_attention AND deleted_at IS NULL` |
| Today, recent | latest things | `(account_id, created_at DESC) WHERE deleted_at IS NULL` |
| Agenda | things with a time in a range | `(account_id, occurs_at) WHERE occurs_at IS NOT NULL AND deleted_at IS NULL` |
| Thread to-dos | open tasks in a thread | `(thread_id, due_at) WHERE kind = 'task' AND done_at IS NULL AND deleted_at IS NULL` |
| A thread | its things, newest first | `(thread_id, created_at DESC) WHERE deleted_at IS NULL` |
| My threads | threads I am in | `thread_members(account_id, state, thread_id)` joined to `threads(last_activity_at DESC)` |
| Memories tab | account-scope memories | `(account_id, scope, updated_at DESC) WHERE deleted_at IS NULL` |
| A person | memories about them | `(account_id, scope, subject_id) WHERE scope = 'person'` |
| Conversations | grouped by period | `(account_id, last_message_at DESC)` |
| One conversation | its messages | `(conversation_id, created_at)` |
| Search, ⌘K | similarity, scoped | HNSW on `things.embedding` (`halfvec(1024)`), plus a `tsvector` GIN for exact terms |
| Queue drain | next runnable job | `(state, priority, run_after) WHERE state = 'queued'` |

Every predicate above appears in a partial index rather than a full one, because `deleted_at IS NULL` is true for almost every row and the index should not carry the tombstones.

### What follows

- **Pagination is server-side and cursor-based** on `things` in a thread, `messages` in a conversation, and the full conversations list, since each has a heavy case in the thousands. The cursor is `(created_at, id)`, which UUIDv7 makes monotonic. Threads, memories and people are client-side: their heavy cases are in the hundreds and they are read whole.
- **Denormalised on purpose:** `threads.thing_count`, so a thread list never runs a `COUNT(*)` per row; `threads.last_activity_at`, which drives both ordering and the derived "older" group; `blobs.thread_id`, so a move can rewrap keys without a join. All three are maintained in the same transaction as the write that changes them.
- **Partitioning: none yet.** `messages`, `jobs` and `analytics_events` are the candidates. At 40,000 messages for a heavy account they are nowhere near needing it. Revisit when a table passes tens of millions of rows, not before.
- **The shared-thread read is an ordinary indexed lookup**, because membership replaced ownership. `My threads` is one join from `thread_members` where `account_id = ?` and `state = 'accepted'`. *An earlier draft gave threads an owner column, which made this a `UNION ALL` of owned and granted; dropping the owner removed the union along with the role it implied.*

## Constitution check

- **OFF-1** Content is durable; `analytics_events` carries structured references only, never a title, a transcript or a dumped URL.
- **OFF-2** Blob encryption only. No content column is encrypted, and the docs claim nothing more.
- **OFF-3** Every content table carries `account_id`, and it leads every index. A thing resolves to its author; a thread resolves to its member set. Reads are scoped by an accepted membership. Delete authorization checks `things.account_id`, per row, by author. Account deletion drops `account_keys` and that account's `thread_members` and `thread_keys` rows, leaving other members' copies, so shared threads survive until the last member leaves.
- **OFF-4** `source_kind` and `source_ref` exist so connector content can point at a source without a body ever being stored.
- **OFF-5** Not applicable to the schema, applies to the callers.
- **OFF-6** `deleted_at` plus `purge_after`, and a move is an update to `thread_id` plus a rewrap, so both are reversible inside the window.
- **OFF-8** `memories` is bounded by compaction and is the row to watch. Nothing else is fed to a prompt whole.
- **DEV-1** No `sources` table, no connector state, no tool registry, no plans. Two columns stand in for the connector seam and nothing else is built ahead of its spec.

## Edge cases

- **A thing moves threads:** update `thread_id`, rewrap `blobs.wrapped_object_key` from the old thread key to the new one, update both `thing_count`s, all in one transaction. Undo is the same operation reversed.
- **An invitation is accepted:** flip `thread_members.state` to `accepted` and insert a `thread_keys` row for the new member, unwrapping the thread key with the inviter's account key. Leaving or being removed deletes both rows.
- **A member deletes their account on a shared thread:** their `thread_members` and `thread_keys` rows go, their things stay, and everyone else is untouched. There is no ownership to transfer because there is no owner.
- **The last member leaves a thread:** the thread and everything in it is deleted, because nothing can reach it any more. This is the only path that destroys another person's things, and it is correct: by then nobody is left who could read them.
- **Delete on a shared thread means leave.** Removing a thread you share removes your membership and your key and leaves every other member's view intact. Destroying it outright would delete things you did not author, which the single permission forbids.
- **A person becomes a connection:** an unlinked `people` row gains a `linked_account_id`. Person-scoped memories follow automatically because they point at the person, not the account.
- **A waitlist account is deleted before promotion:** no keys, no default thread, no content, so it is a plain row delete.
- **Two devices dump the same thing from an outbox retry:** the client-supplied idempotency key on the write path deduplicates, the same mechanism `jobs.idempotency_key` uses. *Note for any future content-level dedup: it must not use a vector distance threshold. Dense embeddings place a statement and its negation close together, so two things that contradict each other look like duplicates. Use an exact check or a model reading both.*
