-- A row somebody typed straight into a thread, before offload has read it.
--
-- The + on a section heading writes the row immediately, with whatever was
-- typed as its title, and queues offload to work out what it actually is. That
-- order is deliberate: **the row is saved before anything can go wrong with
-- it.** The worst mistake this product can make is losing what somebody wrote,
-- so the text is a row in the thread from the moment they hit enter, and the
-- tidying is an improvement on something already safe rather than the only
-- thing standing between them and their words.
--
-- `filing_at` is when that queue was joined, and null means offload is done
-- with it. It is a timestamp rather than a boolean so a client can stop showing
-- a spinner for a job that died without anybody having to sweep the table: a
-- row whose filing started an hour ago is not being worked on, and it is a
-- perfectly good row either way.

alter table content add column filing_at timestamptz;

-- Partial, because the interesting set is tiny and short-lived: the rows a
-- worker is holding right now. Everything else has a null here forever.
create index content_filing on content (filing_at) where filing_at is not null;

comment on column content.filing_at is
  'Typed straight into the thread and queued for offload to read. Null once it has.';
