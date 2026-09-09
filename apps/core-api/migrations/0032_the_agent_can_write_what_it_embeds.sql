-- The grants 013 needed and did not add.
--
-- **Found by deploying, and only because the worker logs its failures now.**
-- Every embed job failed with `permission denied for table content_chunks`.
-- The role is deliberately narrow, so a new table it touches is a new grant,
-- and 013 added three tables and no grants at all. Locally the tests connect as
-- the owner, so nothing failed and nothing could have.
--
-- **Writing these from the agent plane is the existing decision, not a new
-- one.** `queue.py` says it in a comment: an embed job "writes nothing the Core
-- API owns". A chunk is a derived index of a row, rebuilt from that row by the
-- sweep whenever it goes missing or stale, so the one-writer rule that protects
-- authored content has nothing to protect here. The Core API enqueues; the
-- worker embeds and stores.
--
-- The blast radius is worth stating because this is the role 0010 exists to
-- keep narrow: the agent gains write access to three tables that hold a derived
-- copy of rows it can already read, and nothing else. It still cannot write
-- content, memories, messages, keys or sessions, and a corrupted chunk table is
-- repaired by deleting the rows and letting the sweep refill them.
grant select, insert, update, delete on content_chunks to offload_agent;
grant select, insert, update, delete on memory_chunks  to offload_agent;
grant select, insert, update, delete on message_chunks to offload_agent;

-- Reading a memory to chunk it. `content` was granted by 0011 and `messages` by
-- 0009; `memories` never was, because nothing in the agent plane had read one
-- until the sweep started embedding them.
grant select on memories to offload_agent;

-- 0009's discipline, restated for the tables this migration adds. If somebody
-- later grants broadly by habit, these stay where they are.
revoke all on sessions            from offload_agent;
revoke all on account_identities  from offload_agent;
revoke all on account_keys        from offload_agent;
revoke all on thread_keys         from offload_agent;
revoke all on staff               from offload_agent;
