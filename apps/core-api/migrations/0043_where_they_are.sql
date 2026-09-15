-- Where somebody is, because offload had no idea.
--
-- Asked "when is the next bank holiday" on 15 September, it answered Monday 12
-- October 2026, which is Columbus Day, citing three American sources. Nothing
-- was broken: the lookup ran, the bound held, the chips were honest about where
-- the answer came from. **A search takes its assumptions from nowhere**, and
-- reaching the web turned a gap nobody noticed into a confidently wrong answer.
--
-- **Two letters, and theirs to set.** Not inferred from an IP, which is wrong for
-- anybody travelling and is a new thing to collect without asking; not from the
-- phone's locale, same; not from a connected calendar, which most accounts do
-- not have. A setting they can see and change is the only version of this that
-- is both accurate and honest about where it came from.
alter table accounts
  add column country text check (country is null or country ~ '^[A-Z]{2}$');

comment on column accounts.country is
  'ISO 3166-1 alpha-2, set by the person in Settings. Null until they do, and offload then says it does not know rather than assuming. Reaches the model on a turn that looks something up, which the privacy policy names.';

-- The agent reads it on every turn that may reach the web, so it needs the
-- column and only the column: 0010 narrowed this role away from `grant select on
-- accounts` and every column added since has had to say its own name.
grant select (country) on accounts to offload_agent;
