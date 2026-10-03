-- 0078 An account marked for deletion.
--
-- An owner's delete locks the account at once and destroys it 24 hours later.
-- `delete_after` is the mark and the time; cancelling clears it. Who asked is
-- an id with no foreign key, like an audit entry: it has to read the same
-- after that owner's own account is gone.
alter table accounts add column delete_after timestamptz;
alter table accounts add column delete_requested_by uuid;
