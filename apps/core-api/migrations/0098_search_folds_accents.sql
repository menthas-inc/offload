-- 049. Search folds accents: *cafe* finds Café and *sao paulo* finds São Paulo.
--
-- One configuration for every search_text, `simple` with `unaccent` in front of
-- it, so the Search page and the model's own search read the same words. Each
-- expression below is the one 0027 and 0052 wrote, with only the configuration
-- renamed: `unaccent` maps letters with marks and nothing else, so every query
-- that matched before still matches.
--
-- SET EXPRESSION, not drop and add: Postgres 17 and 18 rewrite the column in
-- place and keep the views that select `*` and the GIN indexes on it, so the
-- view dance of 0028 and 0052 is not needed. Every query on search_text moves
-- to 'offload_search' in the same change, or an accented query stops matching.
--
-- `unaccent` is a trusted contrib extension, so the database owner creates it.
-- Railway's image (postgres-ssl:18, 18.6) ships it; checked 2026-10-30.

create extension if not exists unaccent;

create text search configuration offload_search (copy = simple);
alter text search configuration offload_search
  alter mapping for hword, hword_part, word with unaccent, simple;

alter table content alter column search_text set expression as (
  setweight(to_tsvector('offload_search', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('offload_search', coalesce(body, '')), 'B')
);

alter table notes alter column search_text set expression as (
  to_tsvector('offload_search', coalesce(text, ''))
);

alter table messages alter column search_text set expression as (
  to_tsvector('offload_search', coalesce(said(text, transcript), ''))
);
