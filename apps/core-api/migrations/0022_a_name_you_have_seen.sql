-- What the provider called you, held apart from what you are called.
--
-- Apple and Google both hand over a name. It is nearly always the right one,
-- and it is not ours to publish: `display_name` is what everybody in a shared
-- thread sees next to your content, and a name that arrives from Google and
-- goes straight there is a name you have never seen appearing beside your work
-- for people you know. Usually that is fine. For somebody whose provider
-- account carries a legal name, an old name, or a name in a script they do not
-- use with these particular people, it is not, and they are the people least
-- able to shrug it off.
--
-- So the provider's answer lands here instead. **Nothing reads this column but
-- the account it belongs to**, and only to fill in the field where they confirm
-- or change it. The moment they do, it is `display_name` and it is theirs.
--
-- Nullable forever. Apple sends no name at all when somebody declines to share
-- one, which is a normal outcome and not an error.

alter table accounts add column provider_name text;

comment on column accounts.provider_name is
  'What Apple or Google last called this account, shown only to the account holder to prefill the name they confirm. Never shown to another member.';
