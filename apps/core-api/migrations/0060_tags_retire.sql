-- 025. Labels replace tags and grouping.
--
-- `content.tags` held `dimension:value` strings the model wrote from 006 on,
-- and 007 let a widget sub-group by one dimension named in `threads.attrs`.
-- Nobody could see, set or correct either, and a thread is grouped by labels a
-- person can now. Nothing a person typed is lost: only the model ever wrote a
-- tag. No label is made from them here, because a migration that invented
-- labels would be offload acting with no record and no Undo; the nightly sort
-- labels a thread that holds more than one subject, in Activity, with Undo.

-- `readable_content` is `select content.*`, so it names every column and has
-- to be dropped around the change and recreated as 0057 wrote it.
drop view if exists readable_content;

alter table content drop column tags;

create view readable_content as
select content.*, thread_members.account_id as viewer_account_id
from content
join thread_members on thread_members.thread_id = content.thread_id
where thread_members.state = 'accepted';

update threads set attrs = attrs - 'groupBy' where attrs ? 'groupBy';

-- 018's tag question goes with its field. Every one is deleted, open or
-- answered: an open one has nothing left to apply to, and an answered one's
-- chips would draw an option the product can no longer produce. Alpha, invite
-- only, and a tag question was rare.
delete from questions where field = 'tag';

do $$
declare
  existing text[];
begin
  select array_agg(v) into existing
    from (
      select unnest(regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g')) as v
        from pg_constraint c
       where c.conname = 'questions_field_check' and c.conrelid = 'questions'::regclass
    ) values_in_check
   where v <> 'tag';
  execute 'alter table questions drop constraint if exists questions_field_check';
  execute format(
    'alter table questions add constraint questions_field_check check (field in (%s))',
    (select string_agg(quote_literal(v), ', ') from unnest(existing) as v)
  );
end $$;
