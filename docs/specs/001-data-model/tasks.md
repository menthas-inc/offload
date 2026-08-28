# 001 Data model, tasks

Ordered. Each cites the acceptance criteria it satisfies. Migrations are hand-written SQL in the Core API, forward-only, one file per numbered step.

## Setup

- [ ] **T1** Provision Postgres from a pgvector-enabled Railway template, in the same project and region as the services. Enable PITR. Confirm `CREATE EXTENSION vector` succeeds before writing any migration. *(Blocks everything; the extension binary must be on the server.)*
- [ ] **T2** Migration runner and `migrations/` convention in the Core API, with a Kysely codegen step so types come from the schema rather than being hand-maintained.
- [ ] **T3** `seed` script skeleton. It has to produce realistic shape and volume, because with no database branching it is the only thing that tests a migration against something resembling real data. *(AC-10 depends on this being honest.)*

## Foundational schema

- [ ] **T4** `accounts`, `account_identities`, `staff`. Unique on `(provider, subject)`. State check constraint. *(AC-1)*
- [ ] **T5** `account_keys` with `wrapped_by`, and the `RootKeyProvider` interface with its `db:v1` implementation. *(AC-11)*
- [ ] **T6** `threads` and `thread_keys`. Partial unique index for one default thread per account. Promotion creates account key and default thread in one transaction. *(AC-2, AC-11)*
- [ ] **T7** `things`, with the promoted columns, `source_kind` and `source_ref`, `attrs`, and `deleted_at` / `purge_after`. `thread_id` NOT NULL. *(AC-2, AC-5, AC-6)*
- [ ] **T8** `blobs`, with `wrapped_object_key` and the denormalised `thread_id`. *(AC-11)*
- [ ] **T9** `people` and `thread_members`. Unique on `(thread_id, account_id)` and on `(owner_account_id, linked_account_id)` where linked is not null. Creator inserted as `accepted` with a null `invited_by`. *(AC-3)*
- [ ] **T10** `memories` and `memory_sources`, including the partial unique index giving one standing memory per thread. *(AC-7, AC-8)*
- [ ] **T11** `conversations` and `messages`, with `turn_id` and the message `state` the 👀 marker renders.
- [ ] **T12** `jobs`, `llm_usage`, `analytics_events`. *(AC-9)*

## Indexes and access

- [ ] **T13** Every index in the impl-spec's query table, each partial on `deleted_at IS NULL`. *(AC-10)*
- [ ] **T14** HNSW index on `things.embedding` and a `tsvector` GIN column for exact terms. Confirm the chosen embedding width sits under pgvector's 2,000-dimension index ceiling. *(Depends on open item B3, the embedding provider.)*
- [ ] **T15** Cursor pagination helper on `(created_at, id)`, used by things-in-a-thread, messages-in-a-conversation, and the conversations list. *(AC-10)*

## Behaviour the schema alone does not give

- [ ] **T16** Authorization helpers: readable threads are one indexed lookup on `thread_members` where state is accepted. Delete authorization checks `things.account_id` per row. *(AC-1, AC-3)*
- [ ] **T17** Enqueue-in-transaction helper, so no caller can write a row and enqueue its job separately. *(AC-9)*
- [ ] **T18** Queue drain with `FOR UPDATE SKIP LOCKED` ordered by `(priority, run_after)`, plus visibility timeout, attempts with backoff, and a dead state. *(AC-9)*
- [ ] **T19** Soft-delete and purge job: hard-delete rows past `purge_after`, cascading to blobs in R2. *(AC-5)*
- [ ] **T20** Move-a-thing operation: update `thread_id`, rewrap the object keys, adjust both `thing_count`s, in one transaction, with its inverse for Undo. *(AC-5, AC-11)*
- [ ] **T21** Account deletion and leaving: drop the account's `thread_members` and `thread_keys` rows, delete content in threads it was alone in, leave things in shared threads. When a thread loses its last member, delete the thread and everything in it. *(AC-4)*
- [ ] **T22** Counter maintenance for `threads.thing_count` and `last_activity_at`, in the same transaction as the write that changes them.

## Tests

- [ ] **T23** A grantee can add a thing to a shared thread and cannot delete one they did not author. *(AC-3)*
- [ ] **T24** Deleting an account leaves its things in a shared thread readable by the remaining member, and its account key gone. When that member also leaves, the thread and its things are gone. *(AC-4)*
- [ ] **T25** A delete is invisible immediately and the row still exists until `purge_after`. *(AC-5)*
- [ ] **T26** A thing cannot be inserted without a thread. *(AC-2)*
- [ ] **T27** A second standing memory for a thread is rejected by the database. *(AC-8)*
- [ ] **T28** A write and its job either both commit or neither does. *(AC-9)*
- [ ] **T29** `EXPLAIN` assertions that each query in the impl-spec table uses its stated index against seeded heavy-case volume. *(AC-10)*
- [ ] **T30** Moving a thing between threads keeps its blobs readable, and Undo restores both thread and keys. *(AC-11)*
