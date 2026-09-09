-- 013: the index, which does not exist yet in any form.
--
-- No vector extension, no tsvector column, no embedding column, and no code has
-- ever called an embedding API. 0001 enables pgcrypto and that has been the
-- only extension there has ever been.
--
-- The embedding column was deferred twice on purpose, by 006 and again by 008,
-- both times with the same correct reason: nothing read it. Answering is the
-- reader, so answering builds it.

-- Verified on 2026-08-31 that Railway's managed Postgres carries pgvector
-- 0.8.6, on an empty database rather than assumed, because the cost of being
-- wrong is a data migration. `create extension` cannot install the binary, only
-- enable it, which is why the provisioning decision came first.
create extension if not exists vector;

-- Chunks live in their own tables rather than as a column on the row.
--
-- decisions.md settled this: store raw chunks separately from vectors so a
-- provider or a model change is a re-embed and not a data loss. It is cheap for
-- us because content is never purged.
create table content_chunks (
  id           uuid primary key default uuid_v7(),
  content_id   uuid not null references content (id) on delete cascade,
  -- Denormalised from content. pgvector applies the membership filter AFTER the
  -- index scan, so this column is read on the hot path of every search and a
  -- join back to content there is what makes an iterative scan slow.
  thread_id    uuid not null references threads (id) on delete cascade,
  ord          int  not null,
  -- The raw chunk, kept. A provider change re-embeds from here.
  text         text not null,
  embedding    halfvec(1024),
  -- Which model produced the vector, so a re-embed can find what is stale
  -- rather than rebuilding everything.
  model        text,
  embedded_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (content_id, ord)
);

-- The same shape against memories, denormalising subject_id instead, because a
-- thread memory's membership resolves through subject_id and never through
-- account_id.
--
-- A memory is one or two sentences and will always be one chunk. It gets a
-- table anyway rather than a column, so the corpora search through one query
-- shape instead of several that drift apart.
create table memory_chunks (
  id           uuid primary key default uuid_v7(),
  memory_id    uuid not null references memories (id) on delete cascade,
  subject_id   uuid,
  ord          int  not null,
  text         text not null,
  embedding    halfvec(1024),
  model        text,
  embedded_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (memory_id, ord)
);

-- And conversations, denormalising account_id because that is the whole of a
-- conversation's predicate.
--
-- `role` is carried so a result can say whether the person or offload said it.
-- Half of a conversation is offload's own output, and a past reply that was
-- wrong is otherwise indistinguishable from something a person stated.
create table message_chunks (
  id           uuid primary key default uuid_v7(),
  message_id   uuid not null references messages (id) on delete cascade,
  account_id   uuid not null references accounts (id) on delete cascade,
  role         text not null check (role in ('person', 'offload')),
  ord          int  not null,
  text         text not null,
  embedding    halfvec(1024),
  model        text,
  embedded_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (message_id, ord)
);

-- The backlog, which is a normal state and not an error: a row whose embed
-- failed or has not run yet is still findable by text, and is missed only by
-- meaning.
create index content_chunks_pending_idx on content_chunks (created_at) where embedded_at is null;
create index memory_chunks_pending_idx  on memory_chunks  (created_at) where embedded_at is null;
create index message_chunks_pending_idx on message_chunks (created_at) where embedded_at is null;

-- HNSW, cosine, on the half-precision vectors. Partial, because an unembedded
-- chunk has nothing to index and the backlog should not carry weight in the
-- graph.
create index content_chunks_hnsw on content_chunks using hnsw (embedding halfvec_cosine_ops) where embedding is not null;
create index memory_chunks_hnsw  on memory_chunks  using hnsw (embedding halfvec_cosine_ops) where embedding is not null;
create index message_chunks_hnsw on message_chunks using hnsw (embedding halfvec_cosine_ops) where embedding is not null;

-- The text half sits on the source rows, not the chunks, because an exact term
-- should match a title once rather than once per chunk of its body.
--
-- `simple`, not `english`. A stemmer is a language choice and this product has
-- people dumping in more than one; `simple` costs recall on English plurals and
-- loses nothing on anything else, while the vector half carries meaning
-- regardless. Revisit when there is a real query it gets wrong, not before.
--
-- The regconfig is passed explicitly because to_tsvector(text) is only STABLE,
-- which a generated column will refuse. to_tsvector(regconfig, text) is
-- IMMUTABLE.
alter table content add column search_text tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(body, '')), 'B')
  ) stored;

alter table memories add column search_text tsvector
  generated always as (to_tsvector('simple', coalesce(text, ''))) stored;

alter table messages add column search_text tsvector
  generated always as (to_tsvector('simple', coalesce(text, ''))) stored;

create index content_search_idx  on content  using gin (search_text);
create index memories_search_idx on memories using gin (search_text);
create index messages_search_idx on messages using gin (search_text);

-- The one index the agenda read is missing.
--
-- `occurs` already has content_thread_dated_idx from 0016, whose own comment
-- says it is for "the timeline, and later the agenda", and `created` has
-- content_thread_idx from 0011. Both are thread-leading, which is what a read
-- through readable_content wants. 001's impl-spec listed the agenda as
-- (account_id, occurs_at); that index was a plan and was never built.
create index content_thread_due_idx
  on content (thread_id, due_at)
  where due_at is not null and deleted_at is null and archived_at is null;

-- Which rows an answer showed, so a reply resolves them at read time instead of
-- carrying a copy.
--
-- A join table rather than jsonb on messages: a real foreign key means a
-- hard-deleted row cannot leave a dangling id behind, and `ord` keeps the order
-- the model chose rather than whatever the resolving query returns.
create table message_content (
  message_id  uuid not null references messages (id) on delete cascade,
  content_id  uuid not null references content (id) on delete cascade,
  ord         int  not null,
  primary key (message_id, content_id)
);

create index message_content_message_idx on message_content (message_id, ord);
