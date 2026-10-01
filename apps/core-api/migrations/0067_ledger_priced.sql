-- The ledger prices every model call itself (security review M6, finished).
-- A cache write costs a quarter more than plain input, so it is counted apart
-- from the input it is not part of: Anthropic's input count excludes both
-- cache counts.
alter table llm_usage add column cache_write_tokens integer not null default 0;

-- The daily budget sums an account's spend (0008's index serves that) and its
-- web search fees over the last day, before every turn.
create index lookups_account_day_idx on lookups (account_id, created_at);

-- And counts its turns: dumps and typed rows started in the last day.
create index jobs_turns_idx on jobs (account_id, created_at) where kind in ('dump.answer', 'thread.quick_add');
