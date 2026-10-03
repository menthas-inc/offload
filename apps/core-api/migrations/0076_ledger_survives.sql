-- 0076 A cost row outlives the account it was for.
--
-- 0018's reasoning, one table over. Deleting an account cascaded into the
-- ledger, so a month's total would change the day somebody left. The rows
-- stay, with nobody attached: `set null` rather than a tombstone account, for
-- the reasons 0018 gives, and `schema.ts` types the column so application
-- code can read a null and never write one.
--
-- `turn_sources` keeps its cascade: an address a person's turn read is theirs.
alter table llm_usage drop constraint llm_usage_account_id_fkey;
alter table llm_usage alter column account_id drop not null;
alter table llm_usage
  add constraint llm_usage_account_id_fkey
    foreign key (account_id) references accounts (id) on delete set null;

alter table lookups drop constraint lookups_account_id_fkey;
alter table lookups alter column account_id drop not null;
alter table lookups
  add constraint lookups_account_id_fkey
    foreign key (account_id) references accounts (id) on delete set null;

-- The panel's sums are by time across every account, and the platform's 24
-- hour spend is read on every dump.
create index llm_usage_created_idx on llm_usage (created_at);
create index lookups_created_idx on lookups (created_at);

-- Which job a ledger row was for, so a person's timeline can say what each of
-- their jobs cost: its models, its tokens, its spend. Nullable, because rows
-- written before this have none and a call made outside a job never will.
-- **No foreign key, on purpose**: the job table is purged at 30 days and the
-- ledger is never purged, so the id outlives the row it names, as an audit
-- entry's does. Nothing but that timeline reads it.
alter table llm_usage add column job_id uuid;
create index llm_usage_job_idx on llm_usage (job_id) where job_id is not null;
