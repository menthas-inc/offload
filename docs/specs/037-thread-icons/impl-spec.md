# 037 Thread icons, impl spec

Read with the feature spec. Grounding: `.claude/skills/offload-design/handoff/APPLY-2026-10-03-thread-marks.md` and `handoff/thread-marks-standalone.html`, whose CSS is the reference for every measurement.

## Volume and access

| Field | |
| --- | --- |
| Records per account | Threads: 40 typical, 300 heavy. No new table. |
| Fan-out | Three columns on `threads`. |
| Growth | None beyond threads themselves. |
| Read pattern | Every read that already joins `threads` for the name selects two more columns. No new query on any screen. |
| Write pattern | On create (one count over the creator's live threads, at most 300 rows, on the existing `created_by_account_id` path) and on Edit thread, by hand. |
| Sort and filter | None new. |

What reaches the model: the seventy glyph names, as one plain line in the description of one optional tool argument (an enum measured 2,111 tokens for the set, the line about 2,060). Static, bounded, no content (OFF-8). `TOOL_DEFINITION_BUDGET` is 2,100, the owner's decision of 2026-10-04, logged in `docs/tech/decisions.md`.

## Shared module

`packages/widgets/src/thread-icons.ts`:

- `THREAD_ICONS`: the seventy as `{ icon, words }[]`, in the handoff's order. `THREAD_ICON_NAMES`, and `DEFAULT_THREAD_ICON = "lasso"`.
- `isThreadIcon(name)`: one of the seventy or `lasso`.
- `pickThreadIcon(name): string | null`: the rule; null on no match. Tokens by `/[^\p{L}\p{N}]+/u`.
- `leastUsedHue(used: number[]): number`.
- `threadSeed(id)`: the last eight hex digits of the id as an integer (a uuid v7 leads with its timestamp, so the tail is the random part). `threadWash(seed)`: `{ x: seed % 100, y: (seed >>> 7) % 100, angle: (seed >>> 3) % 360 }`.
- `HUE_NAMES`: ten colour names for the screen reader, in `--label-N` order.
- `mixOklch(a, b, share)` and `threadIconColors(hueHex, theme)`: ground, ring and glyph as hex, for the phones, which have no `color-mix`. The web uses `color-mix` in CSS and a test holds the two to the same numbers.

## Data

Migration `0082_thread_icons.sql`:

- `threads.hue smallint not null default 1`, `threads.icon_set_by text not null default 'offload'`, with checks (`hue between 1 and 10`, `icon_set_by in ('offload','person')`). The defaults are for the deploy: an instance on the old code inserts a thread without them.
- The names are the handoff's, `hue` and `icon_set_by`. 025's labels say `colour` and `set_by` for the same ideas; labels are the older word and are left alone.
- Backfill in one statement from a `values` list of `(ord, icon, word)`: the icon is the lowest `ord` whose word equals a token of `lower(name)` split on `[^[:alnum:]]+`, with the plural rule; `lasso` otherwise. Hue: `((row_number() over (partition by created_by_account_id order by created_at, id) - 1) % 10) + 1` over threads that are no account's default; a default thread and a thread with no creator get 1.
- Then `icon not null default 'lasso'` with `check (icon ~ '^[a-z0-9-]{1,40}$')`: the clients turn the icon into a file's name, so the column holds the shape whatever wrote it.
- `test/thread-icons-migration.test.ts` reads the migration's `values` list and asserts it equals `THREAD_ICONS`, and runs the backfill statement against seeded rows, accented and Cyrillic names among them, asserting it picks what `pickThreadIcon` picks. An applied migration never changes: the day the module's list grows, those two tests have done their job and go with that change.

## Server

- `threads/icons.ts`: `markFor(trx, accountId, name, icon?)` returns `{ icon, hue, icon_set_by: "offload" }`: `icon` when it is one of the seventy, else `pickThreadIcon(name) ?? "lasso"`; hue from a count grouped by hue over the creator's live, non-default threads. Used by the three inserts (`routes/tools.ts`, `loose/suggestions.ts`, `admin/promote.ts`, the last fixed at `lasso`, hue 1).
- `editThread(accountId, threadId, { name?, icon?, hue?, iconSetBy? })` replaces `renameThread` in `routes/threads.ts`: `requireMember`, read then write in one transaction with the row locked, live threads only (`deleted_at is null`, else `NotYours`). A given icon or hue that differs from the row sets `icon_set_by = 'person'`; a name alone, while `offload`, re-picks by `pickThreadIcon` and keeps on null. An explicit `iconSetBy` is applied last and wins: it is what Undo sends back. Returns the row after and `previous: { name, icon, hue, iconSetBy }`.
- `PATCH /v1/threads/:id`: body `strictObject({ name?, icon?: enum, hue?: int 1..10, iconSetBy?: enum })`, at least one, and `iconSetBy` only with both `icon` and `hue`, so nobody hands a person's pick back to offload without changing what anybody sees; response `{ thread: { id, name, icon, hue, iconSetBy }, previous }`. The agent's `rename_thread` calls `editThread` with the name alone.
- `create_thread` in `routes/tools.ts`: `icon: z.string().max(40).nullish()`, not an enum (the agent sends an argument the model left out as null), so a name outside the list falls to the word list and the call is not refused (AC-2). The result gains nothing: the model does not need the icon back.
- Reads. One fragment, `threadIconColumns`, selects `threads.icon`, `threads.hue`. Flat shapes gain `threadIcon: string | null` and `threadHue: number | null`, null exactly when `threadName` is null; object shapes gain `icon` and `hue`:
  - `threadRow`, `threadBundle` (`hue`, `iconSetBy` on the bundle; `icon` no longer nullable)
  - `agendaRow`, `todayEvent`, the question `needsCard`
  - `foundResults` (per result), `touchedThreads` in all four places it is built
  - `suggestionSchema` move, `threadRef`
  - `contentDetail`
  - `PersonPage.shared`
- Not carried: the model's search results, invitations, proposals, push copy.
- **`GET /v1/threads` is the exception in shape.** Its rows keep `icon` and send `"lasso"` in it, with the thread's own as `threadIcon` and `threadHue`: a phone build from before 037 draws `icon` straight from this list and has no glyph for the seventy. Both clients map the two into the row at the fetch. Logged in `docs/tech/decisions.md` as a thing to remove.

## Review outcomes

After the build, three reviews of the diff. Taken: `iconSetBy` counts only when the pick moves, `editThread` runs inside the caller's transaction and checks membership there, the legacy list icon above, the wash's cache keyed by density and capped, the popover scrolling on a short window, 44px targets and a growing name field, Android's 64 bar under its 22px name. Checked on the web in a browser, on the iPhone 17 simulator and on a Pixel: the wash, the bar, Edit thread, Save and Undo against the database. The Pixel found the grid wrapping at five columns (a cell a fraction too wide), fixed by flooring the cell. Not taken: a scroll around the whole sheet for the largest text sizes, and carrying the look on the composer's pin instead of the session's remembered looks.

## Agent

`CreateThread` gains `icon: str | None`, described as *One of: ...* with the seventy on one line; a validator turns anything outside the list into None, so pydantic never refuses the call over it. `THREAD_ICON_NAMES` is a Python tuple in `harness/thread_icons.py`, and `tests/test_thread_icons.py` reads `packages/widgets/src/thread-icons.ts` and asserts the two lists are equal. The description of `create_thread` gains one sentence: *Give it the icon that fits what it is for.*

Evals: `principles/02-where-it-goes.json` gains two cases and `run.py` a `thread_icon` expectation read off the `create_thread` call (`{"one_of": [...]}`, or `{"known": true}` for any of the seventy or none). Run only with the owner's yes, the new cases alone.

## Clients

Both: the types in `lib/threads.ts`, `lib/today.ts`, `lib/dump.ts`, `lib/loose.ts`, `lib/people.ts` gain the fields. `editThread` replaces `renameThread`.

**Assets.** The 59 glyphs into `apps/web/public/icons/`; `pnpm icons` regenerates the phones' set. `oil-ground.png`, greyscaled once and resized to 512px, as `apps/web/public/prism/oil-ground.webp` and `apps/mobile/assets/prism/oil-ground.webp`.

**Web.** `components/ThreadIcon.tsx` with `ThreadIcon.module.css`: a span with `--hue: var(--label-N)`, `--x`, `--y`, `--angle`, `--size` inline; ground, ring and glyph colour by `color-mix(in oklch, ...)`, the dark values under the theme scope; the wash a `::before` with `mix-blend-mode: luminosity` and the handoff's filters; `isolation: isolate`. Props `icon`, `hue`, `seed`, `size`, `round?`. The glyph is drawn by `Icon`, so the name goes through `iconUrl` and nowhere else, and an icon that is not `isThreadIcon` draws `lasso`. `Crumb` in `shell/Panes.tsx` gains `thread?: { icon, hue, id }`. `components/panes/EditThread.tsx`: the popover, a dialog that holds focus, closes on Escape and returns focus; grid and hues as `role="radiogroup"` with roving arrow keys.

**Phones.** `components/ThreadIcon.tsx`: the ground, ring and glyph are plain views in the colours from `threadIconColors`; the wash is an RN `Image` over the ground whose source is a data URI rendered once by Skia offscreen (`Surface.MakeOffscreen`, the texture with a greyscale and contrast colour matrix, `BlendMode.Luminosity` over the ground, clipped, the ring drawn into it) and kept in a module map keyed by `seed:hue:size:theme:shape:PixelRatio`, rendered at the device's pixels. Only the glyph sits over it. Until the render lands, and wherever Skia is missing (jest), the ground alone draws. `lib/threadWash.ts` holds the render and the cache; the placement maths is the shared module's. `components/screens/EditThreadSheet.tsx` on `DragSheet`, as tall as its contents and lifting with the keyboard, the grid a nested scroll, replacing the local `EditSheet` in `Thread.tsx`; saves through `perform()` with `did: "Thread updated"`, `failed: "Couldn't save that"`.

## Edge cases

- Two people edit a shared thread at once: last write wins, each Undo restores what that person saw.
- A thread renamed by the agent mid-edit: Save sends what the sheet shows.
- An icon in the row that a build does not know (an older phone after the list grows): `ThreadIcon` draws `lasso`.
- A deleted thread's hue stops counting toward least used.

## Constitution check

- **OFF-1** no event, trace or log gains a name, an icon or a hue.
- **OFF-3** `editThread` is behind `requireMember`; every read is one that already checked membership for the name.
- **OFF-6** the pick is automatic and reversible in Edit thread at any time; Save has Undo.
- **OFF-7** design entry logged for the deviations: the model's pick, keep on no match, the id's tail as the seed, the places the handoff's table did not list (sidebar at 20, crumbs, the *In thread* chip, the suggestion chip at 16, the footer pill staying 30).
- **OFF-8** the enum is static.
- **QUAL-1** every task starts red.

## Amended 2026-10-07

`POST /v1/threads` `{ name, icon?, hue? }`; `icon_set_by` is the person's only when the icon sent differs from the one offload would pick. `EditThread` and `EditThreadSheet` take `heading` and `action`. See the feature spec's amendment of the same date.
