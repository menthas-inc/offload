# 001 Data model, tasks

Ordered. Each cites the acceptance criteria it satisfies. Migrations are hand-written SQL in the Core API, forward-only, one file per numbered step.

## Setup

- [ ] **T1** Provision Postgres from a pgvector-enabled Railway template, in the same project and region as the services. Enable PITR. Confirm `CREATE EXTENSION vector` succeeds before writing any migration. *(Blocks everything; the extension binary must be on the server.)*
- [ ] **T2** Migration runner and `migrations/` convention in the Core API, with a Kysely codegen step so types come from the schema rather than being hand-maintained.
- [ ] **T3** `seed` script skeleton. It has to produce realistic shape and volume, because with no database branching it is the only thing that tests a migration against something resembling real data. *(AC-10 depends on this being honest.)*

## Foundational schema

- [ ] **T4** `accounts`, `account_identities`, `staff`. Unique on `(provider, subject)`. State check constraint. *(AC-1)*
- [ ] **T5** `account_keys` with `wrapped_by`, and the `RootKeyProvider` interface with its `db:v1` implementation. *(AC-11)*
- [ ] **T6** `threads` and `thread_keys`. No `is_default` column: the default thread is `accounts.default_thread_id`, a plain FK, so one per account is structural. Promotion creates the account key and the default thread, named Miscellaneous, in one transaction. *(AC-2, AC-11)*
- [ ] **T7** `things`, with the promoted columns, `tags text[]`, `waiting_on_person_id` and `waiting_on`, `derived_from_message_id`, a denormalised `source_kind`, `attrs`, and `deleted_at` / `purge_after`. `thread_id` NOT NULL. *(AC-2, AC-5, AC-6, AC-12, AC-16)*
- [ ] **T8** `blobs` belonging to a message, plus `blob_keys` (one wrap per account or thread entitled to open the object) and `thing_blobs`. `encryption_scheme`, `purge_after`, `ON DELETE CASCADE` from `messages`. *(AC-5, AC-11, AC-16)*
- [ ] **T9** `people` and `thread_members`. Unique on `(thread_id, account_id)` and on `(owner_account_id, linked_account_id)` where linked is not null. Creator inserted as `accepted` with a null `invited_by`. *(AC-3)*
- [ ] **T10** `memories` and `memory_sources`, with `account_id` NULL for thread scope, `purge_after`, `derived_from_untrusted`, and the partial unique index giving one standing memory per thread. *(AC-7, AC-8, AC-14)*
- [ ] **T11** `conversations` and `messages`. A message is the dump: `kind`, `client_key` unique per account, `source_kind` including `share`, `turn_id`, the `state` the 👀 marker renders, and `deleted_at` / `purge_after`. *(AC-16)*
- [ ] **T11b** `notifications`, with the three kinds and per-row `read_at` and `dismissed_at`. Backs the Activity sheet and Today's "what moved without you". *(AC-13)*
- [ ] **T12** `jobs` with a scrubbed `last_error`, `llm_usage`, and `analytics_events` carrying the decided envelope as typed columns (`occurred_at`, `received_at`, `anonymous_id`, `subject_id`, `session_id`, `source`, `platform`, narrow `properties`), not a catch-all payload. `subject_id` comes from `accounts.analytics_subject_id` and no event ever carries a real account id. *(AC-9, AC-17)*

## Indexes and access

- [ ] **T13** Every index in the impl-spec's query table, each partial on `deleted_at IS NULL`. *(AC-10)*
- [ ] **T14** `things.embedding` and `memories.embedding` as `halfvec(1024)` for Voyage 4, an HNSW index on each, a GIN index on `things.tags`, and a `tsvector` GIN column for exact terms. Enable `hnsw.iterative_scan` and set `hnsw.max_scan_tuples`, because the filter is applied after the index scan and a per-account slice otherwise returns far fewer rows than the limit. *(AC-10)*
- [ ] **T15** Cursor pagination helper on `(created_at, id)`, used by things-in-a-thread, messages-in-a-conversation, and the conversations list. *(AC-10)*

## Behaviour the schema alone does not give

- [ ] **T16** The `readable_things` SQL view, plus its equivalents for `blobs` and `memories`, defined once so the Core API and the agent plane share one predicate rather than reimplementing it in two languages. Blob authorization resolves through `thing_blobs` and `messages`: readable if you own the message, or are an accepted member of a thread holding a thing linked to it. Thread-scope memories resolve through `thread_members` on `subject_id`, never through `account_id`. Delete authorization checks `things.account_id` per row; edit is open to any accepted member. *(AC-1, AC-3, AC-15)*
- [ ] **T17** Enqueue-in-transaction helper, so no caller can write a row and enqueue its job separately. *(AC-9)*
- [ ] **T18** Queue drain with `FOR UPDATE SKIP LOCKED` ordered by `(priority, run_after)`, plus visibility timeout, attempts with backoff, and a dead state. *(AC-9)*
- [ ] **T19** Soft-delete and purge job: hard-delete rows past `purge_after` across `things`, `threads`, `memories`, `blobs` and `conversations`, deleting the R2 object before the blob row. Also sweeps memories past `superseded_at`. *(AC-5, AC-14)*
- [ ] **T19b** Analytics shipper and purge: write `analytics_events` to R2 as NDJSON or Parquet on an hourly or daily cadence, then delete shipped rows after a few days of grace so a broken shipper can be re-run. R2 is the durable copy and is kept indefinitely for now. A separate window covers the log and trace sinks. *(The short clock promised in `decisions.md` needs a job or it silently never happens.)*
- [ ] **T20a** Dump fan-out: the sort job's output schema returns zero or more things for one message, each with its own thread, kind and dates, written in one transaction with `derived_from_message_id` set and `source_kind` copied. Blobs get a `blob_keys` thread wrap only where a thing actually carries the media. *(AC-16)*
- [ ] **T20b** Undo-a-dump: soft-delete the record and everything derived from it under one `purge_after`, and restore the set together. *(AC-5, AC-16)*
- [ ] **T20** Move-a-thing operation: update `thread_id`, rewrap the object keys, adjust both `thing_count`s, in one transaction, with its inverse for Undo. *(AC-5, AC-11)*
- [ ] **T21** Account deletion and leaving. Delete, by name: `account_identities`, `account_keys`, `thread_members`, `thread_keys`, `people` and their person-scope memories, account-scope memories, `conversations`, `messages` and `notifications`, `staff`, every thing in a thread the account was alone in, and every account-scoped `blob_keys` row. Leave things in shared threads. A blob is destroyed only when nothing references it, message gone and no living `thing_blobs` row; until then only its account wrap goes and `blobs.account_id` is nulled. When a thread loses its last member, delete the thread and everything in it. Destroy `analytics_subject_id` as an explicit named step, not a cascade, so a soft delete cannot leave it intact. Block deletion of the last staff owner. *(AC-4, AC-17)*
- [ ] **T22** Counter maintenance for `threads.thing_count` and `last_activity_at`, in the same transaction as the write that changes them.

## Tests

- [ ] **T23** A grantee can add a thing to a shared thread and cannot delete one they did not author. *(AC-3)*
- [ ] **T24** Deleting an account leaves its things in a shared thread readable by the remaining member, and its account key gone. When that member also leaves, the thread and its things are gone. *(AC-4)*
- [ ] **T25** A delete is invisible immediately and the row still exists until `purge_after`. *(AC-5)*
- [ ] **T26** A thing cannot be inserted without a thread. *(AC-2)*
- [ ] **T27** A second standing memory for a thread is rejected by the database. *(AC-8)*
- [ ] **T28** A write and its job either both commit or neither does. *(AC-9)*
- [ ] **T29** `EXPLAIN` assertions that each query in the impl-spec table uses its stated index against seeded heavy-case volume. *(AC-10)*
- [ ] **T31** Authorization tests, not just index tests: a second account's things never appear in search results, in a thread listing, in a blob fetch or in memory recall, from **both** planes. *(AC-1, AC-15)*
- [ ] **T32** A thread's standing memory is readable by every accepted member and by nobody else. *(AC-1)*
- [ ] **T33** An invitation accepted after the inviter has left still gets a working key. *(AC-11)*
- [ ] **T34** Moving a thing into a thread the mover is not a member of is rejected. *(AC-3)*
- [ ] **T35** After account deletion, none of the tables named in T21 still holds a row for that account. *(AC-4)*
- [ ] **T36** A superseded memory does not appear in any current-memory query, and is gone after the purge window. *(AC-14)*
- [ ] **T37** No orphaned blob row or R2 object survives its thing's purge. *(AC-5)*
- [ ] **T38** One dump producing three things across three threads: all three exist, all point at the message, the message owns the blob, and Undo removes the message and all three together. *(AC-16)*
- [ ] **T39** Deleting a derived thing on its own leaves the message and its siblings intact. *(AC-16)*
- [ ] **T40** A photo dumped into two threads has three wraps (account plus two threads), one R2 object, and stays readable in both threads after the dumper's account is deleted while its conversation copy does not. *(AC-11, AC-16)*
- [ ] **T41** A dump arriving while the app is closed leaves its conversation unread, and opening the app shows it in the composer. *(AC-16)*
- [ ] **T42** A blob whose message is deleted but which a living thing still links to is not destroyed; when that last thing goes, the object and its wraps do. *(AC-4, AC-5)*
- [ ] **T43** No emitted event contains a real account id, and after erasure the mapping is gone while previously written events remain readable and unattributable. *(AC-17)*
- [ ] **T30** Moving a thing between threads keeps its blobs readable, and Undo restores both thread and keys. *(AC-11)*
