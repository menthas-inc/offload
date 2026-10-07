-- 041. A PDF is a blob of a third kind. It has pages, not dimensions, and a
-- fourth rendition, the clean copy, which is the only form of it any route
-- serves.

alter table blobs drop constraint blobs_kind_check;
alter table blobs add constraint blobs_kind_check check (kind in ('image', 'audio', 'pdf'));

alter table blobs
  -- From pdf.js at upload, confirmed from the clean copy. A PDF over a
  -- thousand pages is refused before a row exists.
  add column pages integer constraint blobs_pages_check check (pages between 1 and 1000),
  -- When the clean copy was sealed. Null until then, and for good when the
  -- worker could not make one, which unreadable_at says.
  add column clean_at timestamptz;

alter table blobs drop constraint blobs_kind_shape_check;
alter table blobs add constraint blobs_kind_shape_check check (
  (kind = 'image' and width is not null and height is not null and pages is null)
  or (kind = 'audio' and width is null and height is null and pages is null)
  or (kind = 'pdf' and width is null and height is null and pages is not null)
);

grant select (pages, clean_at) on blobs to offload_agent;

comment on column blobs.clean_at is
  '041. When the clean copy of a PDF was sealed: rewritten whole, with metadata, scripts, actions, forms and attachments removed. The original is never served.';
comment on column blobs.kind is
  '021, 041. image, audio or pdf. Every reader of a message''s blobs filters on it: a voice note is never a photo, and a PDF is never either.';
