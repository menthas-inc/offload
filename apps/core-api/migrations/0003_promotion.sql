-- 0003 Promotion.
--
-- Two corrections that promotion forced into the open.
--
-- The analytics pseudonym had no default, so it was assigned by whichever code
-- path happened to create the account, and one of them (the auth session hook)
-- was using "is it still null?" as its once-only lock for first_sign_in. Those
-- two uses fight: the moment promotion also assigns a pseudonym, first_sign_in
-- stops firing for everyone. The pseudonym now has a default and is simply
-- always there, and first sign-in gets a column of its own to claim.
--
-- gen_random_uuid rather than uuid_v7 for that default, deliberately. Every
-- other id here is v7 because time ordering makes inserts cluster. A pseudonym
-- must not be time ordered: the warehouse never holds account creation time,
-- and a v7 subject id would put it there in the clear, in every event, forever.

alter table accounts
  alter column analytics_subject_id set default gen_random_uuid();

update accounts
  set analytics_subject_id = gen_random_uuid()
  where analytics_subject_id is null;

alter table accounts
  alter column analytics_subject_id set not null;

-- Claimed once, ever, by the first session an account is issued. Not derivable
-- from the sessions table: "is this the only session?" is true again as soon as
-- the first one expires and a second device signs in.
alter table accounts
  add column first_signed_in_at timestamptz;

-- The same claim the waitlist email uses, for the same reason: the queue's
-- idempotency key stops a second enqueue, not a second send after a retry that
-- failed between the mailer call and the acknowledgement.
alter table accounts
  add column invite_email_sent_at timestamptz;
