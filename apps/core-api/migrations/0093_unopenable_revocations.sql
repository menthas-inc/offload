-- 0093 A grant offload can no longer open is kept, not dropped (sweep S27).
--
-- After a CONNECTOR_VAULT_KEY rotation a sealed token fails its tag, so a
-- disconnect or an account delete could not hand the grant back to Google and
-- kept nothing to say so: the grant stayed live in the person's Google
-- settings and no one knew. Now the row is written as it was sealed, under its
-- connection's id, and marked here. The hourly pass leaves a marked row alone,
-- the Health page counts them for a revoke by whoever still holds the old key,
-- and the seven days in 0080 still end it. Same columns as before otherwise:
-- a time, and nothing that names anybody.

alter table pending_revocations add column unopenable_at timestamptz;
