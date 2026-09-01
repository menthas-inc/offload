-- 0006 Account image.
--
-- Found by the schema-drift test added with 0005, immediately, before it had
-- run against anything real. Better Auth's user model declares an `image`
-- field and `accounts` had no such column, which is the same latent failure
-- `issuer` turned out to be: fine until the one request that selects it.
--
-- A separate migration rather than an edit to 0005, because 0005 is already
-- applied somewhere and migrations are append-only. Editing an applied file
-- means the next person's database and yours disagree while both claim to be
-- up to date.
--
-- Nullable and unused. Providers offer an avatar URL and offload does not show
-- one anywhere yet; the column exists so the library's queries resolve, not
-- because the product wants the data.

alter table accounts add column image text;
