-- 035. What a cascade cannot do when an account is deleted.
--
-- The cost ledger carries no content, and it is our record of what offload
-- spent. Deleting an account used to take its rows with it; now the rows stay
-- and the account goes from them.
alter table llm_usage alter column account_id drop not null;
alter table llm_usage drop constraint llm_usage_account_id_fkey;
alter table llm_usage
  add constraint llm_usage_account_id_fkey foreign key (account_id) references accounts(id) on delete set null;

-- A calendar grant still to be revoked at Google after its account is gone.
-- The token is sealed with the connector vault's key and the row names no
-- account. It is still that person's grant to whoever holds the vault key,
-- which is why it does not wait long: a job revokes and deletes, and a row
-- older than seven days is deleted unrevoked, with an error logged.
create table pending_revocations (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google')),
  sealed_token bytea not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
