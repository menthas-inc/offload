-- 021. Voice notes: a blob has a kind, a message has a transcript, and one
-- function says what a person said.
--
-- **A blob is a photo or a voice note, and every reader says which.** 020
-- wrote `blobs` for photos and every query that read a message's blobs read
-- them as its photos. Without a kind an audio blob is fetched by the worker
-- as a picture, marked unreadable, filed as "A photo" by the end-of-turn step
-- and wrapped for the thread. The default is `image` because every row that
-- exists today is one.
--
-- **The transcript is a field of the message, beside its typed words.** A
-- message can carry words, photos and one voice note, and the bubble draws
-- the words and the transcript apart, so the wire needs them apart. What
-- every reader of "what the person said" reads is `said(text, transcript)`:
-- the classifier, the filing turn, the tail, 018's judge, the search column
-- below and the embedding path. One definition, six readers, no rule of its
-- own for voice anywhere.
--
-- **The audio is never a row.** `content.type` still allows 'voice', which
-- 0033 kept; nothing writes it, and this migration does not remove it, since
-- a value nothing writes costs nothing and its removal would rewrite a
-- constraint another branch may be touching.

create function said(words text, transcript text) returns text
  immutable
  language sql
  as $$
    select nullif(concat_ws(E'\n\n', nullif(words, ''), nullif(transcript, '')), '')
  $$;

comment on function said(text, text) is
  '021. What the person said: the typed words, then the transcript, a blank line between, nulls and empties dropped. Every reader of a message''s words goes through this.';

alter table blobs
  add column kind text not null default 'image' check (kind in ('image', 'audio')),
  -- The device's own count, before the provider has measured anything.
  add column duration_ms integer check (duration_ms between 1 and 600000),
  -- The provider's, once it has. The ceiling prefers this one.
  add column measured_ms integer,
  -- Thirty two bars over the whole note, 0 to 255, resampled on the device at
  -- stop, so every surface and every reload draws the same waveform.
  add column waveform smallint[] check (array_length(waveform, 1) = 32),
  -- The transcript's id at the provider, from submission until the delete
  -- that follows the read has landed. A retry polls this rather than sending
  -- the audio a second time.
  add column provider_ref text;

-- A photo has dimensions and a voice note has none.
alter table blobs
  alter column width drop not null,
  alter column height drop not null,
  add constraint blobs_kind_shape_check check (
    (kind = 'image' and width is not null and height is not null)
    or (kind = 'audio' and width is null and height is null)
  );

-- The daily sweep: a reference still held an hour after submission is one a
-- dead worker, an undone turn or a parked job left behind.
create index blobs_provider_ref_idx on blobs (created_at) where provider_ref is not null;

comment on column blobs.kind is
  '021. image or audio. Every reader of a message''s blobs filters on it: a voice note is never a photo to the worker, the end-of-turn filing, the tail or the ceiling.';
comment on column blobs.provider_ref is
  '021. The transcript''s id at the transcription provider, held from submission until the delete after the read lands. Never logged.';

-- `readable_messages` is `select messages.*`, resolved once when the view was
-- created, so the two new columns are invisible through it until it is
-- recreated, and it holds `search_text`, which cannot be dropped underneath
-- it. The seventh time, 0051 being the sixth; `predicate.test.ts` catches it every time.
drop view if exists readable_messages;

alter table messages
  add column transcript text,
  add column transcribed_at timestamptz;

comment on column messages.transcript is
  '021. What the voice note was heard as, plaintext, written once by the worker through the internal route. Read only through said(text, transcript).';

-- The search column reads both halves. A generated column cannot be altered
-- in place, so it is dropped and regenerated, and its index with it.
drop index if exists messages_search_idx;
alter table messages drop column search_text;
alter table messages add column search_text tsvector
  generated always as (to_tsvector('simple', coalesce(said(text, transcript), ''))) stored;
create index messages_search_idx on messages using gin (search_text);

create view readable_messages as
select messages.*, messages.account_id as viewer_account_id
from messages
join conversations on conversations.id = messages.conversation_id
where conversations.account_id = messages.account_id;

-- The worker reads which kind a message's blobs are, how long a voice note
-- is and whether a retry can poll rather than upload. Never the waveform,
-- which is decoration the worker has no read for.
grant select (kind, duration_ms, measured_ms, provider_ref) on blobs to offload_agent;
