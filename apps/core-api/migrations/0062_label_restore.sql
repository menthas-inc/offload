-- 025, after review. A deleted label comes back only for the member who
-- deleted it, inside their Undo: the feature spec's rule, which the restore
-- route did not hold. Null for a label a sort's Undo took back, which nobody
-- restores by id.

alter table labels add column deleted_by uuid references accounts(id) on delete set null;
