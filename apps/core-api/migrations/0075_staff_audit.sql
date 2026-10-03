-- 0075 What staff did, kept where nobody can tidy it.
--
-- One row per staff write. **No foreign keys, on purpose**: an entry outlives
-- the staff member who made it and the account it is about, and names both by
-- id. No address and no free text, so there is nothing here that is content
-- (OFF-1): a kind from the application's closed set, ids, and for a setting
-- its key with the old and new values.
create table staff_audit (
  id uuid primary key default uuid_v7(),
  at timestamptz not null default now(),
  staff_account_id uuid not null,
  kind text not null,
  target_account_id uuid,
  setting_key text,
  old_value jsonb,
  new_value jsonb,
  job_id uuid,
  -- The UTC day, for the one kind that is recorded once a day.
  day date generated always as ((at at time zone 'UTC')::date) stored
);

create index staff_audit_at_idx on staff_audit (at desc);
create index staff_audit_target_idx on staff_audit (target_account_id, at desc);
create index staff_audit_staff_idx on staff_audit (staff_account_id, at desc);

-- Opening a person's page is recorded once per staff member, person and day,
-- so a page left open and reloaded is one entry.
create unique index staff_audit_viewed_key
  on staff_audit (staff_account_id, target_account_id, day)
  where kind = 'person.viewed';

-- The application cannot be the last word on its own audit trail, so the
-- database is: no update, and no delete inside two years. The daily purge is
-- the one job that removes an entry, and only past that age.
create function refuse_staff_audit_change() returns trigger as $$
begin
  if tg_op = 'DELETE' and old.at < now() - interval '2 years' then
    return old;
  end if;
  raise exception 'staff_audit entries cannot be changed or removed'
    using errcode = 'check_violation';
end;
$$ language plpgsql;

create trigger staff_audit_immutable
  before update or delete on staff_audit
  for each row execute function refuse_staff_audit_change();

-- The mirror of 0007. That trigger stops a staff account gaining a second
-- identity; this one stops an account that already has two becoming staff.
-- The route checks first and says why; this is what holds when two requests
-- race, since the application does not own both transactions.
create function refuse_staff_with_two_identities() returns trigger as $$
begin
  if (select count(*) from account_identities where account_id = new.account_id) > 1 then
    raise exception 'account % has more than one identity and may not be staff', new.account_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger staff_one_identity
  before insert on staff
  for each row execute function refuse_staff_with_two_identities();
