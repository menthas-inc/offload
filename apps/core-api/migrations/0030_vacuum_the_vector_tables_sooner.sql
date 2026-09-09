-- The chunk tables get vacuumed sooner than the default.
--
-- **The default is 20% of the table dead before autovacuum runs**
-- (`autovacuum_vacuum_scale_factor = 0.2`, plus a threshold of 50 rows). For an
-- ordinary table that is a fine trade: dead tuples cost a little scan time and
-- vacuuming costs IO.
--
-- An HNSW index is not an ordinary case. Deleted rows stay in the graph until a
-- vacuum removes them, and pgvector's own documentation says so plainly: "There
-- may be even less results due to dead tuples or filtering conditions in the
-- query." So dead tuples here do not merely cost time, they cost **results**,
-- and the symptom is search quietly returning fewer rows rather than an error
-- anybody would report. A 20% dead ratio is enough to be felt.
--
-- 2% and 200 rows instead. These tables are append-mostly and small per account,
-- so the extra vacuums are cheap, and the failure they prevent is the one this
-- feature is least able to notice.
--
-- **Not a scheduled VACUUM job.** Autovacuum already exists, already knows how
-- to yield under load, and needs nobody to remember it. A cron that vacuums is
-- a second mechanism doing the first one's work, and pgvector warns that
-- vacuuming an HNSW index is slow enough to want a reindex first, which is not
-- something to run on a timer against a live table.
alter table content_chunks set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 200
);

alter table memory_chunks set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 200
);

alter table message_chunks set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 200
);
