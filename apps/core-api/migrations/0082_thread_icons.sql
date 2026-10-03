-- 0082 Every thread has an icon and a colour (037).
--
-- `icon` has been on the table since 0001 and held nothing but the default
-- thread's lasso. It becomes one of seventy glyphs or lasso, `hue` is one of
-- the ten label hues, and `icon_set_by` says whose pick it is: offload's may
-- be picked again on a rename, a person's never is.
--
-- The defaults are for the deploy: an instance still running the old code
-- inserts a thread without these columns while this migration is live.
alter table threads
  add column hue smallint not null default 1 check (hue between 1 and 10),
  add column icon_set_by text not null default 'offload' check (icon_set_by in ('offload', 'person'));

-- The word list is `THREAD_ICONS` in @offload/widgets, copied: a migration
-- cannot import a module. `thread-icons-migration.test.ts` holds the two
-- equal. The pick is `pickThreadIcon`'s: the name lower-cased and split on
-- anything that is not a letter or a digit, the first glyph in order with a
-- word among the tokens, a plural s tolerated both ways, lasso otherwise.
--
-- Hues go round a creator's threads in the order they were made, so the first
-- ten get ten colours. A default thread is never drawn and is not counted.
-- backfill:begin
with words (ord, icon, word) as (
  values
    (1, 'luggage', 'trip'), (1, 'luggage', 'travel'), (1, 'luggage', 'holiday'), (1, 'luggage', 'vacation'), (1, 'luggage', 'packing'),
    (2, 'plane', 'flight'), (2, 'plane', 'flights'), (2, 'plane', 'airport'),
    (3, 'car', 'car'), (3, 'car', 'service'), (3, 'car', 'mot'), (3, 'car', 'garage'),
    (4, 'bike', 'bike'), (4, 'bike', 'cycling'), (4, 'bike', 'ride'),
    (5, 'tent', 'camping'), (5, 'tent', 'festival'),
    (6, 'map', 'route'), (6, 'map', 'itinerary'), (6, 'map', 'city'),
    (7, 'globe', 'abroad'), (7, 'globe', 'visa'), (7, 'globe', 'world'),
    (8, 'house', 'flat'), (8, 'house', 'home'), (8, 'house', 'house'), (8, 'house', 'apartment'), (8, 'house', 'rent'),
    (9, 'sofa', 'furniture'), (9, 'sofa', 'living'), (9, 'sofa', 'move'), (9, 'sofa', 'moving'),
    (10, 'key', 'keys'), (10, 'key', 'landlord'), (10, 'key', 'lease'),
    (11, 'wrench', 'repair'), (11, 'wrench', 'fix'), (11, 'wrench', 'plumber'),
    (12, 'hammer', 'build'), (12, 'hammer', 'diy'), (12, 'hammer', 'shelf'), (12, 'hammer', 'bookshelf'),
    (13, 'paintbrush', 'paint'), (13, 'paintbrush', 'decorate'),
    (14, 'sprout', 'garden'), (14, 'sprout', 'balcony'), (14, 'sprout', 'plants'),
    (15, 'flower-2', 'flowers'), (15, 'flower-2', 'wedding'),
    (16, 'tree-pine', 'christmas'), (16, 'tree-pine', 'hike'), (16, 'tree-pine', 'forest'),
    (17, 'stethoscope', 'dentist'), (17, 'stethoscope', 'doctor'), (17, 'stethoscope', 'health'), (17, 'stethoscope', 'insurance'), (17, 'stethoscope', 'clinic'),
    (18, 'pill', 'meds'), (18, 'pill', 'pharmacy'), (18, 'pill', 'prescription'),
    (19, 'heart-pulse', 'fitness'), (19, 'heart-pulse', 'heart'),
    (20, 'dumbbell', 'gym'), (20, 'dumbbell', 'workout'),
    (21, 'footprints', 'run'), (21, 'footprints', 'running'), (21, 'footprints', 'marathon'), (21, 'footprints', 'walk'),
    (22, 'apple', 'diet'), (22, 'apple', 'groceries'),
    (23, 'utensils', 'dinner'), (23, 'utensils', 'recipes'), (23, 'utensils', 'restaurant'), (23, 'utensils', 'food'),
    (24, 'coffee', 'coffee'), (24, 'coffee', 'cafe'),
    (25, 'wine', 'wine'), (25, 'wine', 'drinks'), (25, 'wine', 'bar'),
    (26, 'cake', 'birthday'), (26, 'cake', 'cake'), (26, 'cake', 'party'),
    (27, 'gift', 'gift'), (27, 'gift', 'gifts'), (27, 'gift', 'present'), (27, 'gift', 'presents'),
    (28, 'party-popper', 'celebration'), (28, 'party-popper', 'party'),
    (29, 'baby', 'baby'), (29, 'baby', 'kids'), (29, 'baby', 'nursery'),
    (30, 'dog', 'dog'), (30, 'dog', 'puppy'), (30, 'dog', 'vet'),
    (31, 'cat', 'cat'),
    (32, 'graduation-cap', 'school'), (32, 'graduation-cap', 'course'), (32, 'graduation-cap', 'study'), (32, 'graduation-cap', 'university'),
    (33, 'book-open', 'books'), (33, 'book-open', 'reading'), (33, 'book-open', 'read'),
    (34, 'briefcase', 'work'), (34, 'briefcase', 'job'), (34, 'briefcase', 'office'),
    (35, 'laptop', 'computer'), (35, 'laptop', 'tech'),
    (36, 'receipt', 'taxes'), (36, 'receipt', 'tax'), (36, 'receipt', 'receipts'), (36, 'receipt', 'expenses'),
    (37, 'piggy-bank', 'savings'), (37, 'piggy-bank', 'budget'),
    (38, 'wallet', 'money'), (38, 'wallet', 'spending'),
    (39, 'landmark', 'bank'), (39, 'landmark', 'mortgage'), (39, 'landmark', 'council'),
    (40, 'shopping-cart', 'shopping'), (40, 'shopping-cart', 'buy'),
    (41, 'shirt', 'clothes'), (41, 'shirt', 'wardrobe'),
    (42, 'music', 'music'), (42, 'music', 'concert'), (42, 'music', 'band'),
    (43, 'camera', 'photos'), (43, 'camera', 'photography'),
    (44, 'gamepad-2', 'games'), (44, 'gamepad-2', 'gaming'),
    (45, 'film', 'movies'), (45, 'film', 'films'), (45, 'film', 'watch'),
    (46, 'palette', 'art'), (46, 'palette', 'design'),
    (47, 'newspaper', 'later'), (47, 'newspaper', 'articles'), (47, 'newspaper', 'news'),
    (48, 'mountain', 'ski'), (48, 'mountain', 'climbing'), (48, 'mountain', 'mountains'),
    (49, 'waves', 'beach'), (49, 'waves', 'surf'), (49, 'waves', 'swim'),
    (50, 'sparkles', 'ideas'),
    (51, 'train-front', 'train'), (51, 'train-front', 'rail'),
    (52, 'ship', 'ferry'), (52, 'ship', 'cruise'), (52, 'ship', 'boat'),
    (53, 'hotel', 'hotel'), (53, 'hotel', 'stay'),
    (54, 'bed', 'bedroom'), (54, 'bed', 'sleep'),
    (55, 'lamp', 'lighting'), (55, 'lamp', 'lamps'),
    (56, 'fish', 'fishing'), (56, 'fish', 'aquarium'),
    (57, 'bird', 'birds'), (57, 'bird', 'birding'),
    (58, 'leaf', 'compost'), (58, 'leaf', 'nature'),
    (59, 'sun', 'summer'),
    (60, 'snowflake', 'winter'),
    (61, 'umbrella', 'rain'),
    (62, 'heart', 'dating'), (62, 'heart', 'love'),
    (63, 'users', 'family'), (63, 'users', 'friends'), (63, 'users', 'club'),
    (64, 'mic', 'podcast'), (64, 'mic', 'talk'),
    (65, 'pen-tool', 'writing'), (65, 'pen-tool', 'blog'), (65, 'pen-tool', 'novel'),
    (66, 'code', 'code'), (66, 'code', 'dev'), (66, 'code', 'app'),
    (67, 'rocket', 'launch'), (67, 'rocket', 'startup'), (67, 'rocket', 'project'),
    (68, 'trophy', 'league'), (68, 'trophy', 'competition'),
    (69, 'ticket', 'tickets'), (69, 'ticket', 'show'), (69, 'ticket', 'event'),
    (70, 'calendar-heart', 'anniversary')
),
tokens as (
  select t.id, token
  from threads t, regexp_split_to_table(lower(t.name), '[^[:alnum:]]+') as token
  where token <> ''
),
picked as (
  select distinct on (k.id) k.id, w.icon
  from tokens k
  join words w
    on k.token = w.word
    or k.token = w.word || 's'
    or (right(w.word, 1) = 's' and k.token = left(w.word, -1))
  order by k.id, w.ord
),
numbered as (
  select t.id,
    ((row_number() over (partition by t.created_by_account_id order by t.created_at, t.id) - 1) % 10) + 1 as hue
  from threads t
  where t.created_by_account_id is not null
    and not exists (select 1 from accounts a where a.default_thread_id = t.id)
)
update threads t
set icon = coalesce(p.icon, 'lasso'),
    hue = coalesce(n.hue, 1),
    icon_set_by = 'offload'
from threads s
left join picked p on p.id = s.id
left join numbered n on n.id = s.id
where s.id = t.id;
-- backfill:end

-- The clients turn the icon into the name of a file. The route takes only the
-- list and the tool falls back to the word list; the column holds the shape
-- of a name, not the list, so whatever a second writer stores it cannot be a
-- path or close a url().
alter table threads
  alter column icon set default 'lasso',
  alter column icon set not null,
  add constraint threads_icon_shape check (icon ~ '^[a-z0-9-]{1,40}$');
