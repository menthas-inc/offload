-- 026. An email forwarded to over@to.offload.club is a dump. 'gmail' stays
-- reserved for reading an inbox through the API, which this does not do.
alter table messages drop constraint messages_source_check;
alter table messages add constraint messages_source_check
  check (source in ('person', 'share', 'mail', 'gmail', 'calendar', 'browser'));

-- The rate caps count an account's accepted mail by the hour and the day.
create index messages_mail_idx on messages (account_id, created_at desc) where source = 'mail';

-- A DKIM signature is accepted once, ever. The hash of the signing domain and
-- the signature value, never the message: this table holds no content and no
-- account.
create table mail_signatures (
  hash        bytea primary key,
  seen_at     timestamptz not null default now()
);

-- Activity gains the email's rows.
alter table activity drop constraint activity_kind_check;
alter table activity add constraint activity_kind_check
  check (kind in ('digest', 'request', 'share', 'shared_activity', 'expired', 'moved', 'acted', 'labelled', 'mail'));
alter table activity
  -- Which of the five an email row is. Null for every other kind.
  add column mail_outcome text check (mail_outcome in ('filed', 'asked', 'nothing', 'refused', 'over_limit')),
  -- The turn Undo reverses, and the email the row opens. All four ids are
  -- null for 'refused' and 'over_limit', which carry nothing from any email.
  add column turn_id uuid,
  add column message_id uuid references messages (id) on delete cascade,
  add constraint activity_mail_shape_check check (
    (kind = 'mail') = (mail_outcome is not null)
    and (
      mail_outcome is null
      or mail_outcome not in ('refused', 'over_limit')
      or (turn_id is null and message_id is null and thread_id is null and content_id is null)
    )
  );
create index activity_mail_capped_idx on activity (account_id, occurred_at desc)
  where kind = 'mail' and mail_outcome in ('refused', 'over_limit');
