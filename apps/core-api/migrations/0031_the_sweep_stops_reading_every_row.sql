-- Three partial indexes so the sweep is a lookup rather than a full scan.
--
-- **The sweep runs every sixty seconds forever, not once.** Its own comment
-- says "the first sweep finds all of it and the hundredth finds nothing", which
-- is true of what it returns and not of what it costs: each of the three
-- queries is an anti-join against the chunk tables plus an `order by ... desc
-- limit 200` over the whole live table, and once caught up it still reads every
-- row to discover there is nothing to do. That is a cost that grows with the
-- product forever, on a fixed one-minute timer, to answer "nothing".
--
-- Each index matches one query's predicate and its sort, so the planner can walk
-- the index backwards and stop at the limit.
--
-- `messages` sorts by `created_at` rather than `updated_at`, because that query
-- does, and it carries `state` since only settled messages are ever swept.
create index if not exists content_sweep_idx
  on content (updated_at desc)
  where deleted_at is null;

create index if not exists memories_sweep_idx
  on memories (updated_at desc)
  where deleted_at is null and superseded_at is null;

create index if not exists messages_sweep_idx
  on messages (created_at desc)
  where deleted_at is null and text is not null and state in ('seen', 'answered');
