# 001 Data model, implementation

Grounded in `docs/tech/stack.md`, `architecture.md`, `decisions.md` and `context-and-memory.md`. Postgres on Railway, pgvector, Kysely with hand-written SQL migrations, UUIDv7 keys.

## Conventions

- **Primary keys** are UUIDv7. Time-ordered so they cluster on insert, non-enumerable so an id leaks nothing.
- **`account_id` or `thread_id` leads every index** on a content table, whichever the query is actually scoped by: authorship for a personal view, membership for a thread view. This is the discipline that replaces superparent's tenant column. *An earlier draft said `account_id` always leads, which the query table below already contradicted.*
- **Soft delete is `deleted_at`, plus `purge_after`** set to `deleted_at + 8 seconds`, on **every** table the undo window covers: `things`, `threads`, `memories`, `blobs`, `conversations`. A scheduled job hard-deletes past `purge_after`. Nothing is destroyed while the toast is up (OFF-6, AC-5). *If a table has `deleted_at` it has `purge_after`; a soft delete with no scheduled hard delete is content that survives a deletion the person believes happened.*
- **Timestamps** are `timestamptz`, always UTC.
- **`attrs jsonb`** on `things` and `memories` holds what no screen queries yet. Promoting a field to a column is a normal migration and expected (unstructured-first).
- **Known `attrs` keys are documented rather than left to be discovered.** A key living in `attrs` is a decision that no screen queries it yet, not an absence of thinking. Current keys on `things`:
  - `time_estimate`, how long a task is expected to take. Deliberately unstructured for now: no unit, no format, whatever the model or the person produced. It exists because the product should be able to reason about how long something takes and about scheduling around it, and it is in `attrs` rather than a column because no designed screen filters or sorts by it yet. Promote it the moment one does.
- **No enum types.** Kinds and states are `text` with a `CHECK`, because adding a value to a Postgres enum is a migration that locks and adding one to a check constraint is not.

## Vocabulary mapping

The design system uses **person** for the entity and **connection** for the relationship, and both words are load-bearing, so the schema keeps the distinction rather than collapsing it:

- A **person** is a `people` row. It exists whether or not they use offload.
- A **connection** is a `people` row whose `linked_account_id` is set. That is the only kind of person a thread can be shared with, which is exactly the design's rule that sharing never lets anyone new into offload.

There is no `connections` table; a connection is a state of a person, not a separate thing.

## Tables

### Identity

**`accounts`**
`id` · `state` (`waitlist|invited|active|disabled`) · `display_name` · `email` · `email_verified` · `default_thread_id` (nullable until promotion) · `referred_by_account_id`, `referral_thread_id` (both nullable) · `analytics_subject_id` (nullable) · `tier` (`beta`) · `consent_version`, `consented_at` · `created_at`, `updated_at`, `disabled_at`, `deleted_at`

A waitlist signup writes an account in state `waitlist` carrying name and email only, with no keys and no default thread. Promotion moves it to `invited` and creates its account key and default thread in the same transaction. `invited → active` flips when the authenticated person finishes first run, never on an admin action. The admin panel's Waitlist page is `state = 'waitlist'`; its People page is the other three. `referred_by_account_id` and `referral_thread_id` are set when someone is added by a share to an address-book person with no account yet, which is how the Waitlist page tells people who came from a shared thread from people who signed up on their own.

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
`id` · `created_by_account_id` (informational) · `name` · `always_on` · `icon` · `thing_count` · `last_activity_at` · `created_at`, `updated_at`, `deleted_at`, `purge_after`

A thread has **no owner column**. It has members, and the creator is simply the first one. `created_by_account_id` records who started it because the UI wants to say so, and it carries no permission: an owner-versus-grantee distinction is a role, and the design's single permission rules roles out.

`always_on` is a flag, not a category: false means a thread that ends, true means one that never closes, which is the kits' "for now" and "always on". *It was an enum of two values, which is a flag wearing a costume.* The third group, "older threads", is **derived** from `last_activity_at`, not stored, because it is a function of time rather than a property of the thread. **There is no `is_default` column.** The default thread is named by `accounts.default_thread_id`, which is a plain foreign key, so one default per account is structural: an account is one row and one row holds one pointer. *An earlier draft put `is_default` on `threads` and claimed a partial unique index enforced one per account. It cannot: when the owner column was removed, `threads` lost every account column, so that index would have permitted exactly one default thread across the whole product.* The thread itself is created at promotion, named **Miscellaneous**, and is ordinary in every other respect: it opens, holds things, can be renamed and shared, and is special-cased in no query.

**`things`**
`id` · `account_id` (author) · `thread_id` **NOT NULL** · `derived_from_message_id` (nullable) · `type` (`note|link|image|screenshot|voice|file|task|event`) · `title` · `body` · `url` · `tags text[]` · `occurs_at`, `occurs_end_at` · `due_at`, `done_at` · `needs_attention` · `waiting_on_person_id` (nullable) · `waiting_on` (`you|them`, nullable) · `source` (`person|share|gmail|calendar|browser`, default `person`) · `source_ref` (nullable) · `attrs jsonb` · `embedding vector` · `sorted_at` · `created_at`, `updated_at`, `deleted_at`, `purge_after`

One table, `type` plus promoted columns. `occurs_at`, `due_at` and `done_at` are real columns because the agenda and the to-do lists filter and sort on them and JSONB cannot be indexed for that cheaply. `needs_attention` is set by the sorter and is the Today screen's whole query, so it is a column rather than a derivation. `source` and `source_ref` are the connector seam (AC-6): two columns now so a later connector spec never migrates the busiest table.

`waiting_on_person_id` and `waiting_on` are what let the product say who something is stuck on, and they are not optional extras: the kits' Today rows carry a person (`Ana needs an answer on the 14th to 17th`, `Reply to Tom about the Alfama flat`) and the person screen's whole middle section is "what they are waiting on", with a direction. Without them two designed screens cannot be built. *Modelled as two columns rather than a join table because a thing waits on at most one person in every screen drawn; promote to `thing_people` if that turns out to be false.*

`tags text[]` with a GIN index, because the thread widgets filter and count by tag, including tags offload derived rather than the person typed (`Food`, `Views`, `Receipts`). By this spec's own rule, `attrs` holds what no screen queries; these screens query it, so it is a column.

`source` here is a denormalised copy of the message's, kept because a thing's row shows where it came from (`Lisbon trip · from Safari`) and that is a hot read. The message is canonical. **The two must hold identical value sets**, or the copy is lossy: an earlier draft omitted `share` from this one, which would have mislabelled every dump that arrived through a share sheet, and `from Safari` is the most common source label in the kits.

### A dump is a message, and one dump can become many things

**A dump is a message in a composer session.** Not a thing, and not its own entity. You type, or speak, or share a photo in from Safari with the app closed, and it arrives as a message whose `type` is not necessarily text. offload ingests it, acts, and replies in the same composer, so the dump and the answer sit together in one history.

Everything offload extracts is a `thing` in a thread, pointing back at the message it came from:

```
one voice-note message          →  thing  kind = task  "Call the dentist"           → Dentist
"today I need to..."            →  thing  kind = task  "Finish the insurance form"  → Flat admin
                                →  thing  kind = task  "Return Sam's drill"         → Bookshelf build
                                →  offload's reply, in the same conversation
```

`derived_from_message_id` carries the two things that matter:

- **The undo unit.** Undoing a dump soft-deletes the message and every thing derived from it, in one transaction, under one `purge_after`. Without the grouping those things are independent rows and Undo has nothing to reverse together.
- **Provenance.** "Where did this come from" is a foreign key, and playing the original audio is one hop to the message that owns the blob.

**There is no record-thing.** *An earlier draft made the dump itself a thing, reasoning that the kits show a voice note as a row on Today. That was wrong. Today is a summary assembled from threads and calendars, not a feed of dumps, so that row is a thing in Bookshelf build that happens to have come from a voice note. A dump is visible in conversation history and nowhere else.*

**`blobs`**
`id` · `account_id` · `message_id` · `r2_key` · `content_type` · `byte_size` · `encryption_scheme` · `sha256` · `duration_ms`, `width`, `height` · `created_at`, `deleted_at`, `purge_after`

**`blob_keys`**
`(blob_id, scope, scope_id)` (pk) · `scope` (`account|thread`) · `wrapped_object_key` · `created_at`

**`thing_blobs`**
`(thing_id, blob_id)` (pk) · `created_at`

**A blob belongs to the message it arrived on**, because that is what a person handed over. The composer takes several attachments, so a message has many blobs. `encryption_scheme` records how each object was sealed, so the transfer path can change later without re-uploading: bytes currently go through the Core API, which encrypts with AES-GCM and streams ciphertext to R2.

**One object, one object key, wrapped once per place that may open it.** This is the same pattern as `thread_keys`, where one thread key exists and each member holds a wrapped copy, applied one level down:

```
one photo, one object in R2, one object key
   ├─ blob_keys(scope='account')  → readable as part of the dump, in conversation history
   ├─ blob_keys(scope='thread', Lisbon trip)  → readable by that thread's members
   └─ blob_keys(scope='thread', Flat admin)   → readable by that thread's members
```

No duplicated storage and no re-encryption. It also gives the deletion behaviour the product wants: dropping an account key makes the dump copy unreadable while the thread copies survive, so a photo you shared into a thread outlives your account and the conversation it arrived in does not.

**A thread wrap exists only where the media actually landed.** `thing_blobs` records which things carry which blob, and a thread wrap is created when a thing in that thread is linked to it. A voice note that decomposed into four tasks gets no thread wrap at all: the audio is not what landed in those threads, four tasks were. A photo that became a thing in two threads gets two.

**Authorization resolves through `thing_blobs` and `messages`, never through a denormalised column.** A blob is readable if you own its message, or if you are an accepted member of a thread holding a thing linked to it. *An earlier draft kept a denormalised `blobs.thread_id`, which a read check could have been written against and gone stale after a partial move.*

**Deletion:** a blob dies with its message. The purge job deletes the R2 object before the row, and `purge_after` sweeps anything a cascade missed, because an encrypted object surviving a deletion the person believes happened is the failure this guards. Removing a thing removes its `thing_blobs` row and, when no thing in that thread references the blob any more, that thread's wrap. **Undo reconstructs a dropped wrap** by re-wrapping the object key from a surviving scope, the account wrap or another thread's, which is why dropping it does not violate the eight-second guarantee: the ciphertext is untouched and the wrap is derivable. *If the last surviving wrap were ever dropped the object would be unrecoverable, so the purge job, not the delete path, is what removes the final one.*

### People and sharing

**`people`**
`id` · `owner_account_id` · `display_name` · `initials` · `linked_account_id` (nullable) · `created_at`, `updated_at`, `deleted_at`, `purge_after`

Each account keeps its own address book, so a person row is owned like everything else and there is no cross-account registry. `linked_account_id` set means this person is on offload and threads can be shared with them. Unset means offload knows about them but they are not a user, which is most people in anyone's life. Unique on `(owner_account_id, linked_account_id)` where linked is not null.

**`thread_members`**
`id` · `thread_id` · `account_id` · `invited_by` (nullable, null for the creator) · `state` (`pending|accepted|declined|expired`) · `created_at`, `responded_at`, `expires_at`

Unique on `(thread_id, account_id)`. The creator is inserted as `accepted` with a null `invited_by`, so membership is one concept rather than an owner plus a grants table. Default receiving behaviour is ask-first, so an invitation starts `pending` and expires after 30 days. "Not now" is `declined` and is not a decline in the UI sense: it sits at the top of My threads and never becomes an inbox, which is a client concern, not a schema one.

A `thread_keys` row is created on **accept**, not on invite, so a pending member holds no key and can read nothing.

### Derived

**`memories`**
`id` · `account_id` (**NULL when `scope = 'thread'`**) · `scope` (`account|thread|person`) · `subject_id` (nullable: a `thread_id` or a `person_id`) · `kind` (`going_on|person|preference|noticed|standing`) · `text` · `origin` (`stated|learned`) · `derived_from_untrusted` (bool) · `attrs jsonb` · `embedding vector` · `created_at`, `updated_at`, `superseded_at`, `deleted_at`, `purge_after`

`origin` exists because corrections beat inference: something a person said outranks something offload worked out, and compaction must never generalise away a `stated` memory. A partial unique index gives exactly one standing memory per thread (AC-8):
`UNIQUE (subject_id) WHERE scope = 'thread' AND kind = 'standing' AND deleted_at IS NULL`

`kind` is what the Memories tab tints a chip by, and it keeps that name because it is a category rather than a type of thing, and the values come from the groups the kits already draw: `going_on` is "Going on", `preference` is "How you like things", `noticed` is "Noticed", and person-scope memories render under "People". `standing` is the one-per-thread blurb.

*`noticed` and `origin = 'learned'` overlap and it is deliberate rather than redundant: `origin` governs compaction, where something a person stated outranks something offload worked out, while `kind` governs where a chip appears and how it is tinted. A `noticed` memory is always `learned`; a `learned` memory is not always `noticed`.*

**Thread-scope memories belong to the thread, not to an account.** A thread's standing blurb is read by every accepted member, so `account_id` is NULL for `scope = 'thread'` and access resolves through `thread_members` on `subject_id` (AC-1). *Left as a plain `account_id` this is a hole in both directions: filter by it and the blurb is invisible to every member but whoever generated it; drop the filter and anyone who can guess a `thread_id` reads another thread's blurb.*

**`superseded_at` means "no longer current", and every current-memory query must filter it.** Compaction sets it when a memory is replaced. A superseded row is an internal artifact, never shown, so the purge job removes it after a short window like anything else that exists for us rather than for the person; that is what stops history accumulating. *Filtering only `deleted_at`, as an earlier draft's queries did, would have let `memories` grow with account age, which is exactly the OFF-8 failure this spec names.*

**Only the thread scope has a database-level cap.** Account-scope and person-scope memories are bounded by compaction alone, which is a dependency on a job not yet specced rather than a property of this schema. The volume table's target is roughly 150 typical and 500 heavy; monitor it, because a steadily rising count is the signal that OFF-8 is being violated.

`derived_from_untrusted` is set when any source of a memory came from a connected app rather than from the person. It exists because OFF-8 puts memory text into stable per-account context, cached alongside the frozen system prompt and therefore read as trusted, while OFF-4 content is untrusted by definition. Without the flag there is a two-hop injection path: connector content, summarised by a model into a memory, later injected as trusted background. *`origin` does not cover this; it is about correction priority, not provenance trust.*

**`memory_sources`**
`(memory_id, thing_id)` (pk) · `created_at`
Provenance (AC-7). Cheap because raw content is never purged, so a source is always resolvable.

### Activity

**`notifications`**
`id` · `account_id` · `kind` (`person|due|offload`) · `thread_id` (nullable) · `thing_id` (nullable) · `person_id` (nullable) · `title` · `body` · `read_at`, `dismissed_at` · `created_at`

What offload interrupts someone for, and the rows the Activity sheet renders. Three kinds matching the kits: someone else did something, a deadline is approaching, or offload did something itself. Per-row `read_at` and `dismissed_at` rather than a single last-seen watermark, because the kits show individually dismissed rows sitting among unread ones.

The same table backs Today's "what moved without you", which is these rows filtered to `kind = 'offload'`.

*It carries rendered `title` and `body`, so it is user-facing content: kept indefinitely, and never an analytics source (OFF-1). The analytics outbox cannot serve this screen, and the reverse is equally true.*

### Conversation

**`conversations`**
`id` · `account_id` · `title` · `started_at`, `last_message_at` · `unread_at` (nullable) · `last_read_at` · `created_at`, `deleted_at`, `purge_after`

`unread_at` is set when offload replies and cleared when the person reads it. **On opening the app, if any conversation is unread, the composer opens showing it.** That is how a dump shared in while the app was closed reaches the person: they open offload and find their dump and offload's answer waiting, in a conversation they did not start. A boolean-ish nullable column rather than comparing two timestamps, so the "anything unread" check is one partial index.

**`messages`**
`id` · `conversation_id` · `account_id` · `role` (`person|offload`) · `type` (`text|link|image|screenshot|voice|file`) · `turn_id` · `text` · `state` (`queued|seen|answered|failed`) · `client_key` (nullable, unique per account) · `source` (`person|share|gmail|calendar|browser`) · `source_ref` (nullable) · `attrs jsonb` · `created_at`, `deleted_at`, `purge_after`

`state` is what the 👀 marker renders: `seen` means offload has the message and has not answered it. `turn_id` groups the messages belonging to one model turn, so an at-least-once delivery cannot double-render an answer.

*`messages.type` and `things.type` are close but not the same set on purpose. A message has no `task` or `event`, because you cannot dump a task, offload extracts one. And a dumped `text` message becomes a `note` thing: the word changes because the shape changes, from what you said to what it turned into. Written down because a near-miss between two enums is exactly what causes a mapping bug.*

**A message from a person is a dump**, which is why `type` lives here, and why `client_key`, the outbox's idempotency key, is on this table rather than on `things`: a retry from a device that never heard the response must not create the dump twice. `source` records how it arrived, with `share` as its own value because a share sheet with the app closed is a common and distinct path.

⚠️ **`gmail`, `calendar` and `browser` on this table need OFF-4 resolved before a connector ships.** `messages` is kept indefinitely with its full text, which is right for something a person handed over, and wrong for something pulled from a mailbox nobody vetted: OFF-4 requires connected-app content to be derived and discarded, keeping only a source reference. Nothing here distinguishes a person forwarding an email from an automated pull, and both would land in the same keep-forever row. *The connector spec must either give connector-sourced messages a discard path, or reserve those values for person-initiated shares. Flagged now because the seam columns exist now, and the risk is that the connector spec reuses this path and quietly never implements discard.*

⚠️ **Which conversation a dump joins is deliberately open**: a new one each time, one long-running one, or the most recent. A product decision, it does not change this schema, and it is recorded in `decisions.md`.

### Machinery

**`jobs`**
`id` · `kind` · `account_id` (nullable, scheduled jobs may be global) · `payload jsonb` · `priority smallint` · `run_after` · `attempts`, `max_attempts` · `state` (`queued|running|done|failed|dead`) · `locked_at`, `locked_by` · `idempotency_key` (unique) · `last_error` · `created_at`, `updated_at`

`kind` is an **open set** matching `^[a-z][a-z0-9_]*$`, not a CHECK constraint, so adding a job is a registry line rather than a migration. **`llm_usage.job_kind` draws from the same set and must match it**, because the admin panel's Costs page groups spend by the job being paid for; if the two drift that page silently misgroups.

`last_error` is truncated and scrubbed of payload content before it is written, because an exception message that embeds the dumped text is a way content reaches a log or an error reporter (OFF-1).

Drained with `SELECT ... FOR UPDATE SKIP LOCKED` ordered by `(priority, run_after)`. Interactive jobs take a lower `priority` number than scheduled ones, which is how scheduled work is stopped from starving interactive work. Enqueue happens in the same transaction as the write that caused it (AC-9).

**`llm_usage`**
`id` · `account_id` · `job_kind` · `category` (`interactive|scheduled`) · `model` · `input_tokens`, `output_tokens`, `cache_read_tokens` · `cost_micros` · `latency_ms` · `created_at`

**`analytics_events`**, an outbox
`id` · `name` · `version` · `occurred_at` (device) · `received_at` (server) · `anonymous_id` · `subject_id` (nullable) · `session_id` (nullable) · `source` · `platform` · `properties jsonb` · `shipped_at`

`session_id` is nullable and null is meaningful: a share-sheet dump with the app closed, a connector pull or a scheduled job has no foreground period and gets no session, so `sessions per day` keeps meaning what it sounds like. Sessions are an analytics construct minted client-side; nothing here stores one.

**`subject_id`, never `account_id`.** It is `accounts.analytics_subject_id`, a random pseudonym with no relationship to anything else, and it is what reaches R2. Erasure destroys the mapping by nulling that column, after which every event already written is permanently unattributable without touching a single file. *With a real account id on the wire, one erasure request means rewriting every archive file that mentions the person, and then doing it again for the next request. Analytics files are immutable and the archive only grows.*

The flat typed envelope `decisions.md` specifies, with the dimensions as real columns rather than buried in a blob. *An earlier draft had a single `payload jsonb`, which reintroduced exactly the catch-all that decision rejected: unqueryable once a warehouse exists, impossible to select and purge one account's rows, and it forces the OFF-1 deny-list check to reach inside an opaque blob instead of checking typed columns.*

`properties` stays narrow: structured references only, never a title, a transcript or a dumped URL. This is the one table retention applies to, along with logs and traces (OFF-1).

## Volume and access

Estimates. Stating a number we later find wrong is useful; leaving it blank is not.

| Table | Per account, typical | Heavy | Growth |
| --- | --- | --- | --- |
| `threads` | 40 | 300 | 1 to 3 a week |
| `things` | 600 | 20,000 | 5 to 20 a day active, and a dump may produce several |
| `blobs` | 300 | 12,000 | tracks dumps, not things |
| `memories` | 150 | 500 | **bounded by compaction, does not grow with age** |
| `people` | 25 | 250 | slow |
| `thread_members` | 12 | 120 | slow |
| `notifications` | 400 | 6,000 | 1 to 5 a day |
| `conversations` | 200 | 3,000 | 1 to 5 a day |
| `messages` | 2,000 | 40,000 | every dump is one, plus offload's reply |
| `jobs` | transient | | roughly one per dump plus scheduled |

Fan-out worth naming: **things per thread** is 15 typical and 500 heavy, and the heavy case is real, since a "Read later" thread accumulates for years. That is the number that decides pagination.

`memories` is the row that must not grow with account age. If it does, OFF-8 is being violated and compaction is not working.

### One authorizer, not just one writer

The Core API is the only **writer**, which `decisions.md` settles. It is not the only **reader**: the agent plane reads through SQLAlchemy for retrieval and prompt assembly. So the account-or-accepted-membership rule would have to be reimplemented in a second language, and a fix in one would not reach the other. That is a read path escaping the membership check, which is the failure OFF-3 exists to prevent.

**The predicate is defined once, in SQL, as a view both planes read.** Not a helper in each language:

```sql
-- readable_things(viewer_account_id): a thing is readable if you authored it,
-- or if you are an accepted member of the thread it is in.
SELECT t.* FROM things t
JOIN thread_members m ON m.thread_id = t.thread_id
WHERE m.account_id = :viewer AND m.state = 'accepted' AND t.deleted_at IS NULL;
```

Every read of `things`, `blobs` and `memories` goes through the equivalent view. **Authoring alone is not the predicate**: filtering on `things.account_id = :viewer` would hide things other members authored in a shared thread, which is the mistake that makes an implementer loosen the filter instead of narrowing it.

### Queries, and the index each needs

| Screen | Query | Index |
| --- | --- | --- |
| Today, priority | things needing you | `(account_id, created_at DESC) WHERE needs_attention AND deleted_at IS NULL` |
| Today, recent | latest things | `(account_id, created_at DESC) WHERE deleted_at IS NULL` |
| Agenda | things with a time in a range | `(account_id, occurs_at) WHERE occurs_at IS NOT NULL AND deleted_at IS NULL` |
| Thread to-dos | open tasks in a thread | `(thread_id, due_at) WHERE type = 'task' AND done_at IS NULL AND deleted_at IS NULL` |
| A thread | its things, newest first | `(thread_id, created_at DESC) WHERE deleted_at IS NULL` |
| Undo a dump | the message's derived things | `things(derived_from_message_id) WHERE deleted_at IS NULL` |
| Conversation history | a dump and its reply | `messages(conversation_id, created_at) WHERE deleted_at IS NULL` |
| Open a blob | its wraps | `blob_keys(blob_id, scope, scope_id)`, and `thing_blobs(blob_id)` for the membership check |
| My threads | threads I am in | `thread_members(account_id, state, thread_id)` joined to `threads(last_activity_at DESC)` |
| Memories tab | account-scope memories | `(account_id, scope, updated_at DESC) WHERE superseded_at IS NULL AND deleted_at IS NULL` |
| A person | memories about them | `(account_id, scope, subject_id) WHERE scope = 'person' AND superseded_at IS NULL AND deleted_at IS NULL` |
| A person | what they are waiting on | `(waiting_on_person_id, due_at) WHERE deleted_at IS NULL` |
| A thread | its standing blurb | `(subject_id) WHERE scope = 'thread' AND superseded_at IS NULL AND deleted_at IS NULL`, read through `thread_members`, never through `account_id` |
| Activity sheet | undismissed, newest first | `notifications(account_id, created_at DESC) WHERE dismissed_at IS NULL` |
| Today, what moved | offload's own actions | `notifications(account_id, created_at DESC) WHERE kind = 'offload' AND dismissed_at IS NULL` |
| Thread widgets | things by tag | GIN on `things(tags)`, with `(thread_id)` leading the scope |
| Conversations | grouped by period | `(account_id, last_message_at DESC)` |
| One conversation | its messages | `(conversation_id, created_at)` |
| Search, ⌘K | similarity, over readable things | HNSW on `things.embedding` (`halfvec(1024)`), plus a `tsvector` GIN for exact terms. **Scope is the `readable_things` predicate above, not `account_id`** |
| Queue drain | next runnable job | `(state, priority, run_after) WHERE state = 'queued'` |

Every predicate above appears in a partial index rather than a full one, because `deleted_at IS NULL` is true for almost every row and the index should not carry the tombstones.

**One caveat on the vector index, which is the only query here whose scoping is not a plain column.** pgvector applies the filter *after* the HNSW scan, so a query restricted to one account's slice of a shared index can return far fewer rows than the limit asks for: at the default `ef_search` of 40 and an account holding 10% of rows, roughly four survive. pgvector 0.8.0 added `hnsw.iterative_scan` for exactly this, which keeps expanding the search until the limit is met, bounded by `hnsw.max_scan_tuples`. Not a problem at alpha, where one account is most of the table, and a real one as accounts multiply. Turn iterative scan on from the start and tune rather than discovering it as "search got worse".

### What follows

- **Pagination is server-side and cursor-based** on `things` in a thread, `messages` in a conversation, and the full conversations list, since each has a heavy case in the thousands. The cursor is `(created_at, id)`, which UUIDv7 makes monotonic. Threads, memories and people are client-side: their heavy cases are in the hundreds and they are read whole.
- **Denormalised on purpose:** `threads.thing_count`, so a thread list never runs a `COUNT(*)` per row; `threads.last_activity_at`, which drives both ordering and the derived "older" group; and `things.source`, a copy of the message's so a row can show where it came from without a join. All three are maintained in the same transaction as the write that changes them.
- **Partitioning: none yet.** `messages`, `jobs` and `analytics_events` are the candidates. At 40,000 messages for a heavy account they are nowhere near needing it. Revisit when a table passes tens of millions of rows, not before.
- **The shared-thread read is an ordinary indexed lookup**, because membership replaced ownership. `My threads` is one join from `thread_members` where `account_id = ?` and `state = 'accepted'`. *An earlier draft gave threads an owner column, which made this a `UNION ALL` of owned and granted; dropping the owner removed the union along with the role it implied.*

## Constitution check

- **OFF-1** Content is durable. `analytics_events` carries structured references only, never a title, a transcript or a dumped URL, and its dimensions are typed columns so the check does not have to read inside a blob. `notifications` carries rendered content and is therefore never an analytics source. `jobs.last_error` is scrubbed.
- **OFF-2** Blob encryption only. No content column is encrypted, and the docs claim nothing more. One object key per object, wrapped once per place entitled to open it: the account for the dump, each thread whose things carry it.
- **OFF-3** A thing resolves to its author; a thread resolves to its member set. Every read goes through the `readable_things` predicate, defined once in SQL so both planes share it rather than reimplementing it. Delete authorization checks `things.account_id`, per row, by author; edit is open to any member. Account deletion drops the tables enumerated in the edge cases, leaving other members' copies, so shared threads survive until the last member leaves.
- **OFF-4** `source` and `source_ref` exist so connector content can point at a source without a body ever being stored.
- **OFF-5** Not applicable to the schema, applies to the callers.
- **OFF-6** `deleted_at` plus `purge_after`, and a move is an update to `thread_id` plus a rewrap, so both are reversible inside the window.
- **OFF-8** `memories` is bounded by compaction and is the row to watch; only the thread scope has a database-level cap, so the other two are a monitoring obligation. `superseded_at` is filtered by every current-memory query and swept by the purge job, without which the table grows with account age. `derived_from_untrusted` keeps connector-derived memories from being laundered into trusted context.
- **DEV-1** No `sources` table, no connector state, no tool registry, no plans. Two columns stand in for the connector seam and nothing else is built ahead of its spec.

## Edge cases

- **A thing moves threads:** check the mover is an accepted member of the **destination** thread, then update `thread_id`, adjust its blobs' `blob_keys` wraps as above, and update both `thing_count`s, all in one transaction. Undo is the same operation reversed. *Without the destination check, a move is a way to write into a thread you are not in.*
- **An invitation is accepted:** flip `thread_members.state` to `accepted` and insert a `thread_keys` row for the new member, unwrapping the thread key from **any current accepted member's copy**, not the inviter's. *An invitation pends for up to 30 days, and the inviter may leave or delete their account in that window, taking their `thread_keys` row with them. If no accepted member remains, the thread has been deleted and the pending invitation is deleted with it.* Leaving or being removed deletes both rows.
- **A member deletes their account on a shared thread:** their `thread_members` and `thread_keys` rows go, their things stay, and everyone else is untouched. There is no ownership to transfer because there is no owner.
- **Erasure destroys `accounts.analytics_subject_id` as an explicit step.** Not a cascade and not a side effect: `accounts` carries `deleted_at`, so a soft delete would leave the mapping intact and shred nothing. It is its own named action, taken when the person asks.
- **Account deletion must name every table it touches**, or content survives a deletion the person believes happened (AC-4). The full set: `account_identities`, `account_keys`, `thread_members`, `thread_keys`, `people` and their person-scope `memories`, account-scope `memories`, `conversations`, `messages` and `notifications`, `staff`, every `thing` in a thread the account was alone in, and every `blob_keys` row scoped to that account. Things in shared threads stay, by OFF-3.
- **A blob outlives its message when a thread still uses it.** Blobs belong to messages, but deleting the message does not necessarily delete the object: a photo dumped and filed into a shared thread is still that thread's. **A blob is destroyed when nothing references it any more**, meaning its message is gone and no `thing_blobs` row from a living thing points at it. Until then the object and its thread wraps stay, and only the account wrap goes. `blobs.account_id` is set null when the dumper's account is deleted, since it recorded who handed it over and they no longer exist. *Getting this wrong in either direction is bad: destroy too eagerly and a shared thread loses its photos, too lazily and deleted media survives.*

**There is deliberately no `ON DELETE CASCADE` from `messages` to `blobs`.** A cascade destroys the object the instant the message row goes, which is exactly the too-eager failure: account deletion hard-deletes messages, and a photo the person had filed into a shared thread would vanish from that thread. `blobs.message_id` is `ON DELETE SET NULL`, and the purge job does the refcount check. *An earlier draft of T8 specified a cascade while this paragraph specified refcounting, which is a contradiction that would have been resolved by whoever wrote the migration.*
- **The last staff owner cannot delete their own account.** `staff` requires at least one owner, and that invariant lives on the staff-management endpoint, which account deletion does not go through. Block the deletion until ownership is transferred, or the admin panel is orphaned and a `staff` row points at a deleted account.
- **The last member leaves a thread:** the thread and everything in it is deleted, because nothing can reach it any more. Name the cleanup rather than implying it: the `thread_keys` rows, every `blob_keys` row scoped to that thread, and every `thing_blobs` row for its things, all go. *Left implicit, a stale wrap or link keeps a blob's refcount above zero forever, so an object nobody can open is also an object nothing will ever delete.* This is the only path that destroys another person's things, and it is correct: by then nobody is left who could read them.
- **Delete on a shared thread means leave.** Removing a thread you share removes your membership and your key and leaves every other member's view intact. Destroying it outright would delete things you did not author, which the single permission forbids.
- **A person becomes a connection:** an unlinked `people` row gains a `linked_account_id`. Person-scoped memories follow automatically because they point at the person, not the account.
- **A waitlist account is deleted before promotion:** no keys, no default thread, no content, so it is a plain row delete.
- **There is no way to remove another member from a thread**, only to leave one yourself. That is deliberate for now. If it is ever added, it must not become a role: any member removing any member is consistent with the single permission, a privileged remover is not.
- **A member may edit a thing they did not author.** Only deletion is restricted to the author. That follows from co-ownership and is stated here affirmatively so it is not implemented inconsistently by guesswork.
- **Undoing a dump that became several things:** soft-delete the message and every thing whose `derived_from_message_id` is that message, in one transaction, under one `purge_after`. Undo restores the whole set. *A derived thing may be deleted on its own; deleting the dump takes everything derived from it.*
- **A derived thing is moved or edited independently.** Expected, and it does not touch the message it came from. The dump stays in conversation history; the things go wherever they belong.
- **A thing carrying media moves threads:** create a `blob_keys` wrap for the destination thread, and drop the origin thread's wrap if no other thing there still references the blob. The object itself is never touched. *This replaces the old rewrap-in-place, which assumed a blob lived in exactly one thread.*
- **Two devices dump the same thing from an outbox retry:** `messages.client_key`, unique per account, deduplicates on the write path, the same mechanism `jobs.idempotency_key` uses. *Note for any future content-level dedup: it must not use a vector distance threshold. Dense embeddings place a statement and its negation close together, so two things that contradict each other look like duplicates. Use an exact check or a model reading both.*
