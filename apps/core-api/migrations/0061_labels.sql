-- 025. Labels: named, coloured groups inside one thread.
--
-- A label is the thread's, not its creator's: every accepted member reads and
-- writes it under 022's predicate, and nothing here restates that. What the
-- database holds a label to is the part a check in code cannot win a race on:
-- a name unique per thread ignoring case, a colour unique per thread, both
-- among live labels only, so a deleted label frees its name and its colour for
-- the thirty days it is kept for Undo and for offload's refusal to re-create
-- it.

create table labels (
  id                   uuid primary key default gen_random_uuid(),
  thread_id            uuid not null references threads(id) on delete cascade,
  name                 text not null check (char_length(name) between 1 and 24),
  colour               smallint not null check (colour between 1 and 10),
  set_by               text not null check (set_by in ('person', 'offload')),
  -- OFF-3: who wrote the name. Null for offload, and after the author deletes
  -- their account, when a label in a shared thread stays as their content does.
  created_by           uuid references accounts(id) on delete set null,
  -- The sort that created it; null for a person.
  run_id               uuid,
  -- A person renamed or recoloured it, after which offload never touches it.
  touched_by_person_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  deleted_by_person    boolean not null default false,
  purge_after          timestamptz
);

create index labels_thread_idx on labels (thread_id, created_at) where deleted_at is null;
create unique index labels_thread_name_idx on labels (thread_id, lower(name)) where deleted_at is null;
-- Not deferrable: a partial unique index cannot be. A swap of two colours
-- steps the first label out of the index for the length of the transaction by
-- marking it deleted, see `recolourLabel`.
create unique index labels_thread_colour_idx on labels (thread_id, colour) where deleted_at is null;
create index labels_purge_idx on labels (purge_after) where purge_after is not null;

-- One row per (row, label), ever. A person taking a label off keeps the row as
-- a tombstone (`removed_by = 'person'`), which is what offload reads before it
-- would put the label back.
create table content_labels (
  content_id     uuid not null references content(id) on delete cascade,
  label_id       uuid not null references labels(id) on delete cascade,
  set_by         text not null check (set_by in ('person', 'offload')),
  run_id         uuid,
  removed_at     timestamptz,
  removed_by     text check (removed_by in ('person', 'offload')),
  removed_run_id uuid,
  created_at     timestamptz not null default now(),
  primary key (content_id, label_id)
);
create index content_labels_label_idx on content_labels (label_id, content_id) where removed_at is null;

create table note_labels (
  note_id        uuid not null references notes(id) on delete cascade,
  label_id       uuid not null references labels(id) on delete cascade,
  set_by         text not null check (set_by in ('person', 'offload')),
  run_id         uuid,
  removed_at     timestamptz,
  removed_by     text check (removed_by in ('person', 'offload')),
  removed_run_id uuid,
  created_at     timestamptz not null default now(),
  primary key (note_id, label_id)
);
create index note_labels_label_idx on note_labels (label_id, note_id) where removed_at is null;

-- A sort: one nightly pass over a thread, or one turn that labelled anything.
-- What it set carries its id, which is how a live turn's Undo and an Activity
-- row's Undo take back exactly that and nothing a person has touched since.
create table label_runs (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references threads(id) on delete cascade,
  kind       text not null check (kind in ('nightly', 'live')),
  set_by     text not null check (set_by in ('person', 'offload')),
  turn_id    uuid,
  undone_at  timestamptz,
  created_at timestamptz not null default now()
);
create index label_runs_thread_idx on label_runs (thread_id, created_at);
create index label_runs_turn_idx on label_runs (turn_id) where turn_id is not null;

alter table labels add constraint labels_run_fk foreign key (run_id) references label_runs(id) on delete set null;
alter table content_labels add constraint content_labels_run_fk foreign key (run_id) references label_runs(id) on delete set null;
alter table content_labels add constraint content_labels_removed_run_fk foreign key (removed_run_id) references label_runs(id) on delete set null;
alter table note_labels add constraint note_labels_run_fk foreign key (run_id) references label_runs(id) on delete set null;
alter table note_labels add constraint note_labels_removed_run_fk foreign key (removed_run_id) references label_runs(id) on delete set null;

-- The nightly sort runs on a thread whose rows changed since it last ran.
alter table threads add column labels_sorted_at timestamptz;

-- 024's Activity gains its first action: a row recording a sort carries the
-- sort, so its Undo can find what to take back, and one mark for every member's
-- copy once somebody has.
alter table activity add column label_run_id uuid references label_runs(id) on delete set null;
alter table activity add column undone_at timestamptz;
alter table activity drop constraint activity_kind_check;
alter table activity add constraint activity_kind_check
  check (kind in ('digest', 'request', 'share', 'shared_activity', 'expired', 'moved', 'acted', 'labelled'));
create index activity_label_run_idx on activity (label_run_id) where label_run_id is not null;

-- The worker reads a thread's labels and writes nothing: its plan goes to the
-- Core API, which is the one writer.
grant select (id, thread_id, name, colour, set_by, touched_by_person_at, deleted_at, deleted_by_person, created_at)
  on labels to offload_agent;
grant select (content_id, label_id, set_by, removed_at, removed_by) on content_labels to offload_agent;
grant select (labels_sorted_at) on threads to offload_agent;
