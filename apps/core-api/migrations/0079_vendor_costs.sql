-- 0079 What each company charged, by month.
--
-- `billed` is what the company's own billing interface returned; `fixed` is a
-- subscription an owner typed on Limits. A metered figure is the ledger's and
-- is computed, not stored. `final` is false for the month in progress.
create table vendor_costs (
  vendor text not null,
  month date not null,
  source text not null check (source in ('billed', 'fixed')),
  amount_micros bigint not null,
  final boolean not null default false,
  read_at timestamptz not null default now(),
  primary key (vendor, month, source)
);
