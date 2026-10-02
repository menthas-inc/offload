-- 032. When each member's nightly pass last applied in a thread. A pass is
-- booked only for what changed since, and reads only what landed since, so a
-- pass's own writes never book the next one and a missed night loses nothing.
alter table thread_members add column nightly_at timestamptz;
