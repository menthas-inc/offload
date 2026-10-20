# Apply: Thread layouts

Drawn and decided with the product owner on 19 October 2026 in `explorations/thread-skins.html`, over `main`
as read that day (tree `1a4dc4c91ddd`): `apps/mobile/components/screens/Thread.tsx`, `EditThreadSheet.tsx`,
`apps/web/src/components/panes/Thread.tsx` and `EditThread.tsx`, `packages/widgets/src/index.ts` and `folds.ts`,
`apps/core-api/src/threads/labels.ts`, `threads/icons.ts`, `routes/threads.ts` (`editThread`, `completeContent`,
`POST /v1/threads`), `routes/tools.ts` (`create_thread`), `today/rows.ts`, `today/threads.ts`,
`jobs/handlers.ts` (`thread.nightly`), `prompts/nightly.md` and `prompts/plan_v2.md`.
Standalone copy: `handoff/thread-layouts-standalone.html`, with the iOS, Android and web switch.

**Ready to build.** Every product question is answered (section 1). A second pass for buildability made
eleven smaller calls the owner did not see one by one; they are marked **pass** in section 1, each with its
reason, and any of them can be pushed back on without touching the rest. The readme's **Thread layouts** is
the lasting statement; this file is the build order.

In the exploration the code word was *skin*. In the product and in code it is **layout**.

---

## 0. In one paragraph

A thread has a **layout**, one of six: `default`, `todo`, `events`, `gallery`, `project`, `timeline`.
Default is the thread page as built today, everything earned, unchanged. The other five arrange the same
rows differently for what the thread is for, and may make labels in the thread to do it. offload may name a
layout once, in the call that creates the thread; after that only a person changes it, in Edit thread.
Nothing the layout does not draw is out of reach: a row at the foot opens the rest. One function in
`@offload/widgets`, `layoutFor`, decides every layout's sections, and the three clients draw what it returns.

---

## 1. Decisions, and why

| # | Decision | Why | By |
|---|---|---|---|
| 1 | Six layouts: Default, Todo list, Events, Gallery, Project, Timeline. | Grouped by the three things that change a screen: what done means (gone, kept, nothing to finish), what a row is (words, a cover, a dated entry), and how rows are ordered (priority, label, day). Two uses that differ on none of those share a layout, which is why songs and films share Gallery, and packing shares Todo list. | owner |
| 2 | Events and Project organise by **labels**, not by a new row state. Events makes *Booked*, *Still deciding*, *Passed on*; Project makes *Now*, *Next*, *Later*. Each label is a section that folds from its heading. | No schema change on rows; the filter bar, the label sheet and the label tools already work; a person can rename or extend them. | owner |
| 3 | Switching **into** a layout makes the labels it uses that the thread lacks (matched by name, ignoring case). Switching **out** deletes the old layout's labels that are empty and that the new layout does not use; a label with rows under it stays. A renamed label is the person's and draws as a plain section. | A layout sets the thread up to work, and leaves nothing empty behind. Matching by name means no role column on `labels`. | owner |
| 4 | **Default is the page as built**, earned, and always one tap away in the picker. Every other layout has its own sections and decides how each is drawn. **List \| Map is unchanged**: any layout, once a thread has a point. | The page that ships today must not change for anyone who never picks. | owner |
| 5 | A row at the foot of every layout except Default and Timeline, **"N other things in here"**, opens the rows the layout does not draw. | Nothing is ever hidden by a layout. | owner |
| 6 | **Todo list: a ticked row leaves** at the tick, with the amber Undo line in its slot. A folded **"N got this week"** at the foot lists the last seven days of ticks, each untickable. Every other layout keeps `sinkDone`. | A shopping list is for getting through; the fold answers "did I already get eggs?". | owner |
| 7 | **Pictures come from links only.** A typed title draws a lettered tile. No search, no outside lookup. | Cost. | owner |
| 8 | **offload names a layout once, at creation, or none.** Unsure, or a name with nothing to go on: Default. Never again on its own; only a person changes it. No Automatic mode, no extra call. | No surprises, no new model work. | owner |
| 9 | **The nightly pass may suggest** a layout for a Default thread offload made, shown once as a line under the bar, Switch or dismiss. | `thread.nightly` already reads each active thread; one optional field costs nothing extra. | owner |
| 10 | **One function, `layoutFor`,** in `@offload/widgets`, returns every layout's sections, Default included. All six are built against it together. | Six layouts on three surfaces would otherwise be eighteen renderers. | owner |
| 11 | **Today:** Default and Project rows reach Today's To do as now; Events only dated rows; Todo list, Gallery and Timeline none. A row with a date or a reminder reaches Today in every layout. | Groceries are not today's work; nothing dated by hand goes missing. | owner |
| 12 | **Filing knows the layout:** the filing turn gets the target thread's layout and its layout labels, with a few lines per layout. Eval cases per layout. | Rows land in the shape the layout draws, and its labels get used. | owner |
| 13 | **One layout per thread, for everyone**, co-owned like the name. Other members see a one-time line, "Ana switched this to Events", with Undo. | A layout makes and deletes labels everyone sees, so it cannot be a member's. | owner |
| 14 | The setting is called **Layout**. | | owner |
| 15 | **`threads.layout` is a column, not `attrs`.** | Today's read filters on it, which is 0016's own test for leaving `attrs`. | pass |
| 16 | **Project's Done is `done_at`, not a label.** A ticked Project row leaves its section for a **Done** fold at the foot, keeping its label. | Ticking already exists and is the To do fold as built; a Done label beside a tick would be two ways to say one thing. | pass |
| 17 | **A switch that needs more labels than the thread has room for is refused**, whole, with a line. | Ten labels per thread (025). Making some of them would leave a layout half set up. | pass |
| 18 | **Label sections, in order:** the layout's own labels in its order, then the thread's other labels in their order, then **No label** last. A row with several labels draws once, in its first section. | Every label is a section, as the owner asked; a fixed order makes a row's place predictable. | pass |
| 19 | **Section folds are the device's, per thread**, like the label pick (`readPick`); *Passed on* starts folded. | Same rule as 2026-10-17's folds: what you put away is yours. | pass |
| 20 | **"N other things in here" opens as the archived pile does**: the list swaps to *Other things* with *Back to the list* at its foot. | The pattern exists on main, so it is one view mode more rather than a new screen. | pass |
| 21 | **The calendar rail draws in Default, Events and Project** only. | A rail over groceries or covers is noise; Timeline is a timeline already. Dated rows still draw in their sections. | pass |
| 22 | **Ticks that remove a row get an Undo line**: Todo list *Ticked off*, Gallery *Done*, both `slot`. Ticks elsewhere stay silent, as built. | The box is its own undo only while the row stays on screen. | pass |
| 23 | **The heads-up is an `UndoLine`** (`under`) at the top of the page, with its eight seconds, shown once per member per change. | No new component; it is an Undo of a change. | pass |
| 24 | **A Gallery typed title is a task**; Gallery draws `link` and `task` rows. | A task already has `done_at` and a title; a link row without a URL is not a link. | pass |
| 25 | **The suggestion is the thread's**: first suggestion wins, any member's dismiss ends it. | One line, one answer. | pass |

**Considered and not taken:** a new `stage` field on rows (A), a field per layout (B), no state (D);
features allowed or barred per layout; a fixed set of sections per layout; Automatic mode with re-reads at 5
and 15 rows; suggestions as Switches on every dump; posters from a film or music database; web search for
typed titles; per-member layouts; *Show as* and *Kind of thread*; Mixed, Checklist, Plan, Shelf and Log as
names; a separate Queue and Shelf.

---

## 2. Data

### Migration `00NN_thread_layouts.sql`

```sql
alter table threads
  add column layout text not null default 'default'
    check (layout in ('default','todo','events','gallery','project','timeline')),
  add column layout_set_by text not null default 'offload'
    check (layout_set_by in ('offload','person')),
  add column layout_changed_at timestamptz,
  add column layout_changed_by uuid references accounts(id) on delete set null,
  add column layout_suggestion text
    check (layout_suggestion in ('todo','events','gallery','project','timeline')),
  add column layout_suggestion_dismissed_at timestamptz;

alter table thread_members add column layout_seen_at timestamptz;
```

Every existing thread reads `default`, set by offload, which is exactly today.

### Volume and access

| Field | |
|---|---|
| Records per account | One value per thread: 40 typical, 300 heavy. No new rows. |
| Read pattern | Read whole with the thread bundle on the thread page; read as a predicate by Today's to-dos and Open in your threads, which already join `threads`. |
| Write pattern | A person's switch, rare. One write at creation. At most one suggestion per thread, ever. |
| Sort and filter | Today filters `threads.layout in (...)` on rows it has already narrowed by account and `done_at is null`. |

**Indexes:** none. Today's query leads on the account's content rows and joins `threads` by primary key; the
layout predicate rides the joined row. **Normalisation:** none.

### `@offload/widgets`, new `layouts.ts`

```ts
export const LAYOUTS = ["default","todo","events","gallery","project","timeline"] as const;
export type Layout = (typeof LAYOUTS)[number];
export const LAYOUT_NAMES: Record<Layout,string> =
  { default:"Default", todo:"Todo list", events:"Events", gallery:"Gallery", project:"Project", timeline:"Timeline" };
/** The labels a layout makes, in section order. Matched by name, ignoring case. */
export const LAYOUT_LABELS: Record<Layout, readonly string[]> =
  { default:[], todo:[], events:["Booked","Still deciding","Passed on"], gallery:[], project:["Now","Next","Later"], timeline:[] };
export const FOLDED_AT_FIRST_LABELS: Record<Layout, readonly string[]> = { ...none, events:["Passed on"] };
/** Which open rows reach Today's To do. A date or a reminder always does. */
export function reachesToday(layout: Layout, row: { dueAt?: string|null; occursAt?: string|null; isReminder?: boolean }): boolean;
export function labelsToMake(to: Layout, live: readonly {name:string}[]): string[];
export function labelsToDrop(from: Layout, to: Layout, live: readonly {id:string;name:string;count:number}[]): string[];
export function suggestionLine(layout: Layout): string;   // section 6.9
export function layoutFor<T,N>(input: LayoutInput<T,N>): LayoutPage<T,N>;   // section 3
```

`labelsToMake` and `labelsToDrop` are pure so the server and the tests share them.

---

## 3. `layoutFor`, the contract

```ts
interface LayoutInput<T extends Sortable & { labels: string[]; createdAt: string; title: string }, N> {
  layout: Layout;
  rows: readonly T[];            // live, unarchived, as the page already fetches them
  notes: readonly N[];
  labels: readonly { id: string; name: string }[];   // the thread's, in their order
  preference: ThreadPreference;  // widget order, hideDone, as today
  now: Date;
}
type Form = "row" | "check" | "big" | "card" | "draft" | "tile" | "entry";
type Section<T,N> =
  | { kind: "widget"; widget: Widget<T> }                       // Default only: To do, Files, as built
  | { kind: "notes"; notes: N[] }                               // Default only
  | { kind: "rest"; heading: "Everything else" | "Everything in here"; rows: T[] }   // Default only
  | { kind: "list"; key: string; heading: string | null; labelId: string | null; form: Form;
      rows: T[]; folds: boolean; foldedAtFirst: boolean; add: boolean }
  | { kind: "done"; key: "done" | "week"; heading: string; rows: T[] }   // always folds
  | { kind: "day"; key: string; day: string; rows: (T | N)[] }
  | { kind: "files"; rows: T[] };                                // folded at first, as main
interface LayoutPage<T,N> {
  rail: boolean;                 // AND-ed with the page's own railEarned
  sections: Section<T,N>[];
  others: { rows: T[]; notes: N[] };   // what the foot row opens; empty draws no row
}
```

**A test pins Default:** for any input, `layoutFor({layout:"default"})` gives the same widgets, notes and rest
as `widgetsFor` plus the page's own split today. Default must not move a pixel.

### Per layout

| | Draws | Sections, in order | Row form | Done | Rail | Others |
|---|---|---|---|---|---|---|
| **default** | everything | as built: rail, widgets, notes, rest | as built | `sinkDone` | earned | none |
| **todo** | `task` | one untitled list with `add: true`; then **N got this week** | `big` | leaves; `week` fold: `done_at` within 7 days, newest first | no | everything not a task, notes |
| **events** | all but `image`, `screenshot`, `file` | label sections (decision 18), then **No label** | under *Booked*: `card`; under *Still deciding*: `draft`; else `row` | `sinkDone` inside a section | earned | files, notes |
| **gallery** | `link`, `task` | one untitled grid; then **Done** | `tile` | leaves; `done` fold, newest first, no limit | no | everything else, notes |
| **project** | `task` | label sections, then **No label**; then **Done**; then **Files** | `check`, with the handle | leaves its section for `done` | earned | links, events, places, notes |
| **timeline** | every row and note | one `day` per calendar day of `occursAt ?? createdAt` in the account's zone, newest first | `entry` | none | no | none |

- *Booked* and *Still deciding* forms follow the **name**, so a renamed one draws `row`.
- A label section with no rows is not drawn, except the layout's own labels, which draw their heading with
  "Nothing here yet" so the setup is visible.
- Repeating series collapse as `splitRepeating` does now, in every list.
- Pagination is unchanged: the page fetches 30 and the cursor reads more; sections are computed over what
  is held, and a section's count shows only once the cursor is exhausted, as Everything else's does.

---

## 4. Writes

### 4.1 The switch, `PATCH /v1/threads/:id`

`editThread` gains `layout?: Layout`, in the same body as name, icon and hue, so Edit thread's Save is still
one request with one Undo. In its transaction, after the existing lock:

1. `live = labelsOfThread(id)`; `make = labelsToMake(to, live)`; `drop = labelsToDrop(from, to, live)` (a
   label of the old layout, by name, with `count === 0`, not used by the new one).
2. If `live.length - drop.length + make.length > LABEL_LIMIT`, refuse **409 `layout_labels_full`** with
   `{ needed, free }`. Nothing is written.
3. `deleteLabel` each of `drop`, then `createLabel` each of `make`, both as the person (`via: "person"`).
4. Set `layout`, `layout_set_by = 'person'`, `layout_changed_at = now()`, `layout_changed_by`, and clear
   `layout_suggestion`.
5. Return, beside the existing `previous`: `layout: { previous: { layout, layoutSetBy }, made: id[], dropped: id[] }`.

**Undo** sends `PATCH` with `layout: previous.layout`, `layoutSetBy: previous.layoutSetBy` and
`undoLabels: { remove: made, restore: dropped }`: `restoreLabel` each dropped (the deleter, inside 025's
thirty seconds, which covers the eight), and `deleteLabel` each made **only while its count is still 0**.
`layoutSetBy` on the body is accepted only alongside `undoLabels`, the way `iconSetBy` is only with icon and
hue. A refused Undo is the line's Retry, as everywhere.

### 4.2 At creation

- `create_thread` (`routes/tools.ts`) gains `layout: z.enum(LAYOUTS).nullish()`. The insert sets it, with
  `layout_set_by = 'offload'`, and makes `LAYOUT_LABELS[layout]` through `createLabel` as offload. A new
  thread has no labels, so offload's limit of six is never met.
- `POST /v1/threads` (New thread) gains `layout`, defaulting to `default`, set by the person.
- `loose/suggestions.ts`: the nightly `groups` entry may carry `layout`; making the thread passes it on.
- `admin/promote.ts`: `default`.

### 4.3 Moving rows

- **Booked it** on an Events draft is one `setRowLabels`: *Still deciding* off when present, *Booked* on,
  with the row's existing `rowLabelledCopy` line (`under`). When the thread has no *Booked*, the pill is
  not drawn.
- **Between Project sections**: the row sheet's labels, as built. The handle drags only within a section;
  a drop is the existing priority write.
- **Ticks**: `completeContent` as built (it does not check `type`, so a Gallery link can be done). In Todo
  list and Gallery the `perform` gains `did` and `place: { form: "slot" }`: *Ticked off*, *Done*.

### 4.4 The suggestion and the heads-up

- `prompts/nightly.md` gains an optional `layout` in the answer, given only when the input says the thread
  is Default and offload's (section 7.2). `routes/internal.ts` writes `layout_suggestion` only while
  `layout = 'default'`, `layout_set_by = 'offload'`, `layout_suggestion is null` and
  `layout_suggestion_dismissed_at is null`. One write, ever.
- `POST /v1/threads/:id/layout-suggestion/dismiss` sets `layout_suggestion_dismissed_at`.
- Switch from the line is the 4.1 `PATCH`.
- `POST /v1/threads/:id/layout-seen` sets `thread_members.layout_seen_at = now()` for the caller, sent once
  the line has drawn.

---

## 5. Reads

- **The thread bundle** gains `layout`, `layoutSetBy`, `layoutSuggestion` (null unless it should draw) and
  `layoutChange: { by: { accountId, displayName }, layout, at } | null`, non-null when
  `layout_changed_by` is not the viewer and the viewer's `layout_seen_at` is null or older than
  `layout_changed_at`.
- **Today** (`today/rows.ts`) and **Open in your threads** (`today/threads.ts`) add, beside `done_at is null`:
  ```sql
  and ( threads.layout in ('default','project')
     or content.due_at is not null or content.occurs_at is not null or content.is_reminder )
  ```
  `reachesToday` is the same rule in TypeScript for the clients' optimistic rows; a test pins the two
  together.
- The month and day reads are untouched: everything they count is dated.

---

## 6. Screens

Measured from the exploration; both phones and the web. Bar, filter bar, standing, the archived row and the
plate are unchanged. Order on the page: bar, the heads-up or the suggestion line, the filter bar, standing,
Edit thread's own Undo line, the rail when `rail` and earned, `sections`, the others row, the archived row.

### 6.1 Label section heading (Events, Project)

10px dot in the label's colour, the name 17 semibold, the count 13 tertiary, an 18px chevron at the
trailing edge. The whole heading is one button (`aria-expanded`). Folded, the heading is a 44px pill on
`--surface-fill`, radius `--radius-lg` (16 on Android), name 15 medium.

### 6.2 Todo list

- Rows in one card, min 58, centred, title 17/22 medium, checkbox 24 radius 7. **The whole row is the tick
  target**; the title is not a separate tap. Long press opens the row sheet, as now.
- First row **Add an item**: `plus` 20, `--text-tertiary`, `--text-body-role`. Opens the section's quick add
  with `startsAs("todo")`.
- A tick: the row's slot becomes `UndoLine slot` *Ticked off*, then closes.
- **N got this week**: the fold row, min 44, `--surface-fill`, radius `--radius-lg`, `check` 16, chevron.
  Open, it lists those rows as `check` rows, ticked, newest first; unticking puts one back on the list.

### 6.3 Events

- *Booked* rows: a card each, `--surface-raised`, hairline and `--shadow-1`, radius `--radius-lg`, padding
  14, gap 8 between cards. A 36px kind tile on `--surface-fill` with the row's own glyph; title 15.5
  semibold; then the when (`whenLabel`) and the body's first line, 13 secondary; trailing *Booked*, 12
  medium `--moss-700` with a 13px `check`.
- *Still deciding* rows: one card, **1px dashed `--ink-300`**, no fill; each row leads with
  `circle-dashed` in `--text-tertiary`; trailing pill **Booked it**, 30 high, hairline-strong ring.
- Other sections: the row as built.

### 6.4 Gallery

- Grid `repeat(auto-fill, minmax(150px, 1fr))`, gap 16 by 12; two across at 390. Web `minmax(160px,1fr)`,
  page max-width 960.
- Tile: the cover square, radius 8, the link's picture as the row already carries it. Top right, a 22px
  circle `rgb(0 0 0 / .45)` with the row's kind glyph in white. Under it: title 14 semibold, then the
  domain or the body's first line 12.5 secondary, and a 22px ring with a 1.5px `--icon-on-well` stroke
  at the trailing end, which ticks.
- **Lettered tile** for a row with no picture: `color-mix(in oklch, <thread hue> 18%, var(--surface-raised))`,
  hairline; the title's first two letters 40 semibold in the thread hue, top left at 14 by 12; the kind
  glyph 12 in `--text-secondary` at the foot.
- Tap opens the link (a task opens its sheet); long press opens the row sheet. A tick: `UndoLine slot`
  *Done* in the tile's place, at the tile's size.
- **Done N** fold under the grid.

### 6.5 Project

Label sections of To do rows, exactly as the To do widget draws them now (handle, checkbox, date chip,
labels). Then **Done N** (the To do fold as built), then **Files N**, folded at first (`folds.ts`).

### 6.6 Timeline

A 48px gutter: weekday 13 semibold, date 12 tertiary under it, right aligned. The entry: title 15.5/1.35
medium; body 15/1.5 in `--font-quiet`, secondary; labels; a photo full width, 120 high, radius 12. A hairline
under each day. Gap 16.

### 6.7 The others row

Min 52, hairline on top, full width. **"N other things in here"** 14.5 medium secondary; trailing, the kinds
present, 13 tertiary ("Notes, links, files", from what is in `others`); `chevron-right` 16. Opens the
*Other things* view (decision 20): heading *Other things*, Default's rows and notes, *Back to the list* at
the foot. Not drawn when `others` is empty.

### 6.8 Edit thread and New thread

After **Colour**: the label **Layout** (13 medium secondary, as Icon and Colour), then six `LayoutTile`s at
md in a `radiogroup`, gap 10, scrolling sideways on the phones and wrapping in the web popover. Under it,
when `layoutSetBy === "offload"` and the layout is not Default: one line on `--surface-fill`, radius 12,
padding 10 by 12, `sparkles` 14 tertiary and *offload picked {Name} when it made this thread.* 13/1.45
secondary. `threadChange` gains `layout`. New thread shows the row with Default selected.

**Refused (409):** the sheet stays open and a line under the tiles reads *This thread has {n} labels, and
{Name} needs {needed} more. Delete {needed - free} first.* in `--text-danger`.

**Saved:** the existing `UndoLine under` at `thread:<id>`; with a layout change its words are
*Showing as {Name}*.

### 6.9 The suggestion line

Under the bar on the phones, under the pane head on the web, gutter inset. Min 44, `--surface-accent-soft`,
`--moss-700`, radius 12 (16 Android), padding 0 6 0 12. `sparkles` 15; *Looks like {phrase}* 13.5, one line; **Switch**, medium, underlined; an `x` in a 32px target.
The line names the layout in Switch's accessible label ("Switch to {Name}").
Phrases: todo *a list to get through*, events *a trip or an event*, gallery *things to get round to*,
project *a project*, timeline *a diary*. Switch is 4.1 and its own Undo line; `x` dismisses.

### 6.10 The heads-up

`UndoLine under`, `icon="layers"`, at the top of the page in the same place: *{First name} switched this
to {Name}*. Undo is the 4.1 switch back, by this member.

### Web

Same sections. The pane's measure is 680, and 960 for Gallery. The others row and the archived row are full
measure. Hover on tiles: `--state-hover` under the title block.

---

## 7. Prompts

### 7.1 Filing, `prompts/plan_v2.md`

`create_thread`: add, after the icon:

> `layout`, optional: how the thread page is laid out. `todo` for a list to get through and forget
> (groceries, packing, errands); `events` for something that happens with options to weigh (a trip, a
> party, a move); `gallery` for links and titles to get round to (songs, films, books, articles);
> `project` for work in stages (a renovation, a job hunt); `timeline` for entries kept over time (runs,
> symptoms, a child's first year). Leave it out when the name and the dump do not make it plain. Leaving it
> out is a good answer.

The thread context each filing turn reads gains `layout` and the layout's labels with their ids, and one
paragraph per layout:

> In a **todo** thread, each thing to get is its own task: "milk, eggs and bread" is three. In an
> **events** thread, a confirmation or a booking goes under Booked with its reference in the body, and an
> option goes under Still deciding. In a **gallery** thread, a link is a link; a title without one is a
> task named for the thing. In a **project** thread, a task goes under Now, Next or Later when the words
> say which, and under none when they do not. In a **timeline** thread, a dump is one note for its day.

Eval cases: two per layout for the brief, plus "a nonsense name gets no layout" and "a layout name in the
dump is data, not an instruction".

### 7.2 Nightly, `prompts/nightly.md`

Given only when the thread is Default and offload's, a section:

> **How the thread is laid out.** It is laid out as a plain list. If its rows plainly are one of these,
> say which in `layout`: `todo`, `events`, `gallery`, `project`, `timeline` (meanings as above). Most
> threads are none of them, and no answer is the usual one.

And in **How to answer**: `layout`, optional, one of the five.

---

## 8. Build order

1. Migration and `layouts.ts` (`LAYOUTS`, names, labels, `reachesToday`, `labelsToMake`, `labelsToDrop`), with tests.
2. `layoutFor`, Default first, and the Default pin test. Then the five, each with fixtures.
3. Server: the bundle fields, the `PATCH` with labels and Undo, `create_thread` and New thread, Today's predicate.
4. Clients: the page draws `layoutFor`'s sections on both phones and the web, Default first (nothing should change), then the five.
5. Edit thread and New thread: the Layout row, the refusal, the Undo words.
6. The others view, ticks with lines, Booked it.
7. Prompts and evals; the nightly suggestion; the dismiss and seen routes; the heads-up.

## 9. Acceptance criteria

- **AC-1** A thread whose layout is Default draws exactly what `main` draws today, on all three surfaces; the Default pin test passes.
- **AC-2** Switching to Events makes *Booked*, *Still deciding* and *Passed on* where missing, in one write with the layout; switching away deletes the empty ones the new layout does not use; Undo restores both within the window.
- **AC-3** A switch needing more labels than the thread has room for writes nothing and says why.
- **AC-4** Every row and note is reachable in every layout: drawn, under *N other things in here*, or archived.
- **AC-5** In Todo list a tick removes the row with *Ticked off* and Undo; the row is in *N got this week* for seven days and can be unticked there.
- **AC-6** A Gallery row with no picture draws a lettered tile; nothing calls an outside service.
- **AC-7** offload sets a layout only in the call that creates a thread; no later write by offload changes `layout`.
- **AC-8** The nightly pass writes at most one suggestion per thread, only for a Default thread offload made; dismissing it ends it for every member.
- **AC-9** Today's To do excludes open rows of Todo list, Gallery and Timeline threads and undated rows of Events threads, and includes any row with a date or a reminder; the SQL and `reachesToday` agree on a shared fixture.
- **AC-10** In a shared thread, another member opening it after a switch sees *{Name} switched this to {Layout}* once, with Undo.
- **AC-11** List | Map draws in every layout once the thread has a point.

## 10. Not in this

Covers from a lookup; a layout per member; layouts for the default thread (Not in a thread) or Today; a
seventh layout; the old Checklist "Usually" chips; aisles as default labels in Todo list. Any of these can
come later on top of `layoutFor` without changing it.
