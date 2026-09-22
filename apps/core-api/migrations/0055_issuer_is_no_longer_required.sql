-- 0055 The issuer column stops being required.
--
-- 0005 added `issuer` for Better Auth 1.7.0, which keyed an identity by issuer
-- and subject and wrote the column on every sign-in. 1.7.3 went back to
-- (provider, subject), the 1.6 shape, and stopped writing it, and 1.7.5's
-- schema check refuses a required column it will never fill:
-- `unexpected-required-column account_identities.issuer`, a 500 on the first
-- request that reads the session (security review 2026-09-22, M9).
--
-- Nullable rather than dropped: the rows carry their provider as issuer and
-- nothing is lost by leaving them; the index from 0005 keeps meaning what it
-- meant for the rows that have one, and the library's own uniqueness on
-- (provider, subject) from 0001 is what holds for the rows that do not.

alter table account_identities alter column issuer drop not null;
