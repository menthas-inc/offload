-- 048. Live updates: every write a screen can see says so on `offload_change`.
--
-- In the database, not in the code, because the code is two languages and
-- several processes: the Core API's routes, the agent plane, the nightly pass,
-- a calendar sync. A trigger is the one place every one of them goes through,
-- and a table that has one cannot be written without the screens hearing.
--
-- **Kinds and ids, never words.** A payload is `kind:id` or, for a removal,
-- `removed:thread:account`. Nothing here reads a title, a name or a note's
-- text, so nothing a person wrote can reach the notify queue or the statement
-- log (OFF-1). The hub in `live/hub.ts` resolves `thread` to the accepted
-- members watching; every other kind names its account.
--
-- `pg_notify` inside the writing transaction, so a rolled back write says
-- nothing and a committed one is heard at commit, as the answer channel does.

-- Columns a write can change that nobody can see: the agent plane writes a
-- note's embedding after the note itself, and that is not a change to show.
create function live_quiet(row_ jsonb) returns jsonb language sql immutable as $$
  select row_ - array['embedding', 'embedding_model', 'embedded_at']
$$;

-- The generic one: tg_argv[0] is the kind, the rest are the columns holding
-- the id it is keyed to. A row moved between threads says both.
create function live_notify() returns trigger language plpgsql as $$
declare
  kind text := tg_argv[0];
  fresh jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  stale jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  said text[] := '{}';
  value text;
begin
  if tg_op = 'UPDATE' and live_quiet(fresh) = live_quiet(stale) then
    return null;
  end if;
  for i in 1 .. tg_nargs - 1 loop
    foreach value in array array[fresh ->> tg_argv[i], stale ->> tg_argv[i]] loop
      if value is not null and not value = any (said) then
        said := said || value;
        perform pg_notify('offload_change', kind || ':' || value);
      end if;
    end loop;
  end loop;
  return null;
end
$$;

-- A note is a thread's when its scope is thread, and a memory otherwise:
-- `0033` renamed memories to notes. An account memory is about its subject,
-- whoever wrote it, so its subject's Memories tab is the one that hears; a
-- person memory belongs to the account that holds it.
create function live_note_key(scope text, subject_id uuid, account_id uuid) returns text
language sql immutable as $$
  select case scope
    when 'thread' then 'thread:' || subject_id
    when 'account' then 'memories:' || coalesce(subject_id, account_id)
    when 'person' then 'memories:' || account_id
  end
$$;

create function live_notify_notes() returns trigger language plpgsql as $$
declare
  key text;
begin
  if tg_op = 'UPDATE' and live_quiet(to_jsonb(new)) = live_quiet(to_jsonb(old)) then
    return null;
  end if;
  foreach key in array array[
    case when tg_op <> 'DELETE' then live_note_key(new.scope, new.subject_id, new.account_id) end,
    case when tg_op <> 'INSERT' then live_note_key(old.scope, old.subject_id, old.account_id) end
  ] loop
    if key is not null then perform pg_notify('offload_change', key); end if;
  end loop;
  return null;
end
$$;

-- Membership is the one table addressed to a person as well as to a thread.
-- The thread hears that its member list changed. Somebody who stops being an
-- accepted member hears `removed`, to them alone: by the time the hub delivers
-- it they are not a member, which is the point. An invitee hears `invitation`,
-- with no thread id, until they accept and become a member like the rest.
create function live_notify_members() returns trigger language plpgsql as $$
begin
  perform pg_notify('offload_change', 'thread:' || coalesce(new.thread_id, old.thread_id));
  if tg_op <> 'INSERT' and old.state = 'accepted' and (tg_op = 'DELETE' or new.state <> 'accepted') then
    perform pg_notify('offload_change', 'removed:' || old.thread_id || ':' || old.account_id);
  end if;
  if (tg_op <> 'DELETE' and new.state = 'pending') or (tg_op <> 'INSERT' and old.state = 'pending') then
    perform pg_notify('offload_change', 'invitation:' || coalesce(new.account_id, old.account_id));
  end if;
  return null;
end
$$;

-- A label on a row, or a file on one, is a change to the row's thread. A
-- lookup that finds nothing is a cascade from the row itself, which has said
-- so already.
create function live_notify_via_content() returns trigger language plpgsql as $$
declare
  thread uuid;
begin
  select thread_id into thread from content where id = coalesce(new.content_id, old.content_id);
  if thread is not null then perform pg_notify('offload_change', 'thread:' || thread); end if;
  return null;
end
$$;

create function live_notify_via_note() returns trigger language plpgsql as $$
declare
  key text;
begin
  select live_note_key(scope, subject_id, account_id) into key
    from notes where id = coalesce(new.note_id, old.note_id);
  if key is not null then perform pg_notify('offload_change', key); end if;
  return null;
end
$$;

-- A thread deleted by its last member keeps their membership, for the restore
-- window, so the membership trigger never says `removed`. Say it here, to
-- every member still in it, so their other open devices leave it as leaving
-- would.
create function live_notify_thread_deleted() returns trigger language plpgsql as $$
declare
  member uuid;
begin
  for member in select account_id from thread_members where thread_id = new.id and state = 'accepted' loop
    perform pg_notify('offload_change', 'removed:' || new.id || ':' || member);
  end loop;
  return null;
end
$$;

-- What the thread page, My threads and Not in a thread draw.
create trigger live_threads after insert or update or delete on threads
  for each row execute function live_notify('thread', 'id');
create trigger live_threads_deleted after update of deleted_at on threads
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function live_notify_thread_deleted();
create trigger live_content after insert or update or delete on content
  for each row execute function live_notify('thread', 'thread_id');
create trigger live_notes after insert or update or delete on notes
  for each row execute function live_notify_notes();
create trigger live_labels after insert or update or delete on labels
  for each row execute function live_notify('thread', 'thread_id');
create trigger live_content_labels after insert or update or delete on content_labels
  for each row execute function live_notify_via_content();
create trigger live_content_blobs after insert or update or delete on content_blobs
  for each row execute function live_notify_via_content();
create trigger live_note_labels after insert or update or delete on note_labels
  for each row execute function live_notify_via_note();
create trigger live_thread_members after insert or update or delete on thread_members
  for each row execute function live_notify_members();
create trigger live_pending_shares after insert or update or delete on pending_shares
  for each row execute function live_notify('thread', 'thread_id');
create trigger live_thread_calendars after insert or update or delete on thread_calendars
  for each row execute function live_notify('thread', 'thread_id');

-- The conversation: a dump appearing. Its answer's progress is the message
-- stream's on the web and the poll's on the phones, so updates say nothing.
create trigger live_messages after insert on messages
  for each row execute function live_notify('conversation', 'account_id');
create trigger live_questions_conversation after insert or update or delete on questions
  for each row execute function live_notify('conversation', 'account_id');
create trigger live_questions_today after insert or update or delete on questions
  for each row execute function live_notify('today', 'account_id');

-- People, Activity, and what Today draws beyond threads.
create trigger live_connections after insert or update or delete on connections
  for each row execute function live_notify('people', 'account_a', 'account_b');
create trigger live_connection_requests after insert or update or delete on connection_requests
  for each row execute function live_notify('people', 'from_account_id', 'to_account_id');
create trigger live_activity after insert or update or delete on activity
  for each row execute function live_notify('activity', 'account_id');
create trigger live_reminder_dismissals after insert or update or delete on reminder_dismissals
  for each row execute function live_notify('today', 'account_id');
create trigger live_reminder_labels after insert or update or delete on reminder_labels
  for each row execute function live_notify('today', 'account_id');
create trigger live_today_put_offs after insert or update or delete on today_put_offs
  for each row execute function live_notify('today', 'account_id');
create trigger live_connector_events after insert or update or delete on connector_events
  for each row execute function live_notify('today', 'account_id');
create trigger live_connector_connections after insert or update or delete on connector_connections
  for each row execute function live_notify('today', 'account_id');
