-- 0083 The map's one pass remembers that it ran.
--
-- 030 kept the backfill to one run with a job key, and jobs.purge removes a
-- finished job after thirty days, after which every boot would run it again:
-- forget every remembered miss and look each one up at Google. The pass now
-- writes a row here when it finishes and reads it before it starts. A row the
-- settings registry has no entry for is never read or shown (0074).
--
-- Where the pass has already run, the job row still says so, for a few weeks
-- more. Read once, here, so the mark exists before that row goes.
insert into app_settings (key, value)
select 'ran.maps_backfill', 'true'::jsonb
where exists (select 1 from jobs where idempotency_key = 'maps.backfill:030' and state = 'done')
on conflict (key) do nothing;
