-- 040. Where each kind's cloud sits on the map, laid out nightly with the
-- memories: every memory of the account together, by t-SNE, and each kind at
-- the average of its own. Kinds that talk about the same things sit near each
-- other. Normalised (centred on zero, spread about one); each client stretches
-- them to its own canvas and keeps the clouds apart.
--
-- Derived from the account's own memories and nothing else: it goes with the
-- account, carries no words, and is rebuilt every night.
create table memory_kind_places (
  account_id uuid not null references accounts(id) on delete cascade,
  kind text not null check (kind in ('people', 'things', 'about', 'rules', 'patterns')),
  x real not null,
  y real not null,
  placed_at timestamptz not null default now(),
  primary key (account_id, kind)
);
