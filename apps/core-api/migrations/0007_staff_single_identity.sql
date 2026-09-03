-- 0007 One identity per staff account, enforced by the database.
--
-- decideLink() refuses to attach a second provider identity to a staff account,
-- because anyone who can get a provider to assert a staff member's address
-- would otherwise inherit the admin panel with one button. That check took a
-- `SELECT ... FOR UPDATE` and a comment saying the lock stopped two callbacks
-- landing together from both reading "no identity yet".
--
-- It does not. The SELECT runs as its own statement, not inside a transaction
-- this code owns: Better Auth calls the account.create.before hook and then,
-- separately, calls adapter.create() to do the INSERT, with no transaction
-- around either. In Postgres a row lock taken by a bare SELECT ... FOR UPDATE
-- is released when that statement's implicit transaction ends, which is before
-- decideLink even returns. The window the comment describes is open.
--
-- The application cannot close it, because it does not own the transaction
-- boundary the INSERT happens in. The database can. This trigger runs inside
-- the same atomic INSERT that would create the second identity, so there is no
-- gap between the check and the act.
--
-- The application check stays. It is what turns this into a clean refusal the
-- gate can explain, rather than an exception surfacing from the driver, and
-- belt and braces is the right posture for the one guard standing in front of
-- the admin panel.

CREATE OR REPLACE FUNCTION refuse_second_staff_identity() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM staff WHERE account_id = NEW.account_id)
     AND EXISTS (
       SELECT 1 FROM account_identities
       WHERE account_id = NEW.account_id
         AND id <> NEW.id
     )
  THEN
    RAISE EXCEPTION 'staff account % may not gain a second identity', NEW.account_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- AFTER, not BEFORE. Two concurrent inserts both need to see the other's row to
-- decide, and a BEFORE trigger fires while the competing row is still invisible
-- to this transaction. Firing after the insert means the loser sees the winner
-- and raises, which rolls its own statement back.
DROP TRIGGER IF EXISTS staff_single_identity ON account_identities;
CREATE CONSTRAINT TRIGGER staff_single_identity
  AFTER INSERT ON account_identities
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION refuse_second_staff_identity();
