-- 0005 Account issuer.
--
-- Better Auth 1.7 scopes an account identity by issuer as well as subject, and
-- every sign-in queries it. We upgraded from 1.6 to 1.7.2 mid-flight to settle
-- a zod peer range and never ran the schema change that came with it, so the
-- first real OAuth callback in production failed with
-- `column account_identities.issuer does not exist`.
--
-- Nothing caught it. The tests call the gate hooks directly and never complete
-- a provider round trip, so the only code path that touches this column is one
-- no test exercises. The guard against a repeat is not another migration: it is
-- the schema-drift test added alongside this, which asks Better Auth what
-- columns it expects and compares them to the ones that exist.
--
-- Backfilled from provider rather than left null. For a social provider the
-- issuer is the provider itself, so existing rows are already correct under the
-- new key and no identity changes hands.

alter table account_identities add column issuer text;

update account_identities set issuer = provider where issuer is null;

alter table account_identities alter column issuer set not null;

-- The lookup Better Auth performs on every sign-in, findAccountOwnerByKey.
-- Unique for the same reason (provider, subject) is: one issuer's subject is
-- one identity, and two rows claiming it is an authorization bug.
create unique index account_identities_issuer_subject_key
  on account_identities (issuer, subject);
