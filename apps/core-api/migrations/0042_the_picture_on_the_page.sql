-- The picture a page publishes about itself.
--
-- **The address, never the bytes.** What is stored is a URL, and the client
-- loads it from the site when the row is drawn. That is a real consequence and
-- it is disclosed: the site sees the reader's IP and when they looked, every
-- time, and in a shared thread that is every member. The alternative shapes
-- were proxying it through the Core API and keeping a copy in R2; the product
-- owner chose this one on 14 September knowing what it costs.
--
-- **https only.** An http image on an https page is blocked as mixed content
-- anyway, so the check refuses a value that could only ever fail to draw, and
-- it refuses the schemes that are not images at all.
alter table content
  add column image_url text check (image_url is null or image_url ~ '^https://');

comment on column content.image_url is
  'A picture the page publishes about itself, as an address. Loaded by the client from the site, never stored here: section 9 of the privacy policy says so, including that the site learns who looked.';

-- And the view that is made of this table, which does not follow it. Fifth time.
drop view if exists readable_content;

create view readable_content as
select content.*, thread_members.account_id as viewer_account_id
from content
join thread_members on thread_members.thread_id = content.thread_id
where thread_members.state = 'accepted';
