# 015 The timeline, implementation spec

> How. The read is the interesting part; the drawing is a rail and a list.

## Shape

No migration. One shared module for the arithmetic, one component per surface, one setting, and the removal of a widget.

**Everything it draws is already fetched.** The thread page reads a page of content and the thread's notes in the same request it already makes. 007's rule holds: not one query per widget, and now not one query per week either.

## The read

The rail spans the thread's dated things, which live in two stores after 014:

| | |
| --- | --- |
| `content` | `occurs_at`, `occurs_end_at`, `due_at`. **`occurs_end_at` was not on any row the page fetched**, which this spec asserted and the route did not do: written since 0011, selected by nothing, absent from `RawRow`, `toRow`, both wire schemas and both clients' types. A two day event drew as a point. Added to all seven places, with a round-trip test, because the arithmetic was right and the field never arrived. |
| `notes` | the same three columns, added by 0033. Already in the thread bundle. |

**One shape for both.** `packages/widgets` gains `datedFor`, which takes content rows and notes and returns one list of `{ id, kind, from, to, done }`. The clients draw that and never branch on which store a thing came from (AC-6).

**The page's own bound is the timeline's bound.** The content page is 30 rows, cursor-paginated; the notes are the active set. A thread whose dated things run past the first page draws the dates it has and gains the rest as the page grows, which is the same behaviour every widget already has and is why this needs no query of its own.

*The alternative was a dated read per thread, `(thread_id, occurs_at)`, which `content_thread_dated_idx` from 0016 already covers and whose comment says it is "for the timeline". It is not needed while the rail draws what the page holds. When the rail gets a range control that reaches past the page, that index is what it reads.*

## Volume and access

| | |
| --- | --- |
| Records per account | Unchanged. This adds no rows. |
| Fan-out | Dated things per thread: 5 typical, 200 heavy on a trip with a full calendar behind it. Weeks drawn: 6 typical, 52 heavy before collapsing, 8 after. |
| Growth | None of its own. |
| Read pattern | The thread page, once per open, from rows it already has. Selecting a day is a filter in memory. |
| Write pattern | None. The timeline writes nothing; the row controls inside a day write what they already wrote. |
| Sort and filter | By day, over an array the page holds. No new index and no new query. |

**Pagination:** none, and the week collapse is what keeps the DOM bounded rather than a page size. A year-long span draws at most a handful of week rows plus one line per collapsed run.

## The arithmetic, in `packages/widgets`

Shared because three surfaces draw the same rail and two of them are a phone.

```ts
export type WeekStart = "monday" | "sunday";

/** One thing with a date, whichever store it came from. */
export interface Dated {
  id: string;
  kind: "task" | "event" | "note" | "other";
  /** Local dates, `YYYY-MM-DD`, inclusive. `to` equals `from` for a point. */
  from: string;
  to: string;
  done: boolean;
}

/** The rail: whole weeks, and the runs that are not worth drawing. */
export type RailRow =
  | { row: "week"; days: Day[] }
  | { row: "gap"; weeks: number; from: string; to: string };

export interface Day {
  iso: string;
  dom: number;
  dow: string;
  today: boolean;
  past: boolean;
  /** One per thing on the day, in `Dated.kind` order, capped for drawing. */
  dots: { kind: Dated["kind"]; done: boolean }[];
}

export function datedFor(rows: ContentRow[], notes: Note[]): Dated[];
export function railFor(dated: Dated[], today: string, weekStart: WeekStart): RailRow[];
export function thingsOn(dated: Dated[], iso: string): string[];
```

**Dates are local, and that is the whole reason they are strings.** `occurs_at` is a timestamp; the day a person sees it on is the day in their own zone. Every comparison here is on `YYYY-MM-DD` produced from the local date, so a 23:00 event is on the day it looks like and not on the next one in UTC. *This is the bug that would ship silently: it is right for most of the day, in most of the world.*

**A span fills every day between its ends** (AC-7), which is one loop from `from` to `to`, and is why `Dated` carries a range rather than a point.

**A run of three or more empty weeks becomes a gap row** (AC-5). Two is drawn, because two empty weeks says something and fifty says nothing.

**`MAX_DOTS = 4` per day**, with a fifth drawn as a count. Nothing is hidden: the day's accessible name and the day view both carry the truth, and eleven dots in a 40px cell is a smudge rather than information.

## The setting

Week start joins theme and text size in the device-local appearance store: `offload:week-start` on web, the same key through the phones' store, defaulting to `monday`. **Device-local, like the two beside it**, and stated here because the other reading is defensible: it is arguably an account preference and would then need a column, an endpoint and a sync. Not worth it for a value somebody sets once, and the pattern beside it is already local.

## The components

| | |
| --- | --- |
| Web | `apps/web/src/components/panes/Timeline.tsx`, rendered by `Thread.tsx` above `Widgets`. |
| Phones | `apps/mobile/components/shell/Timeline.tsx`, rendered by `screens/Thread.tsx` in the same place. |

The day's contents reuse what already draws a row: `ContentRowView` and its `RowHandlers` on web, the mobile `ContentRow` on the phones, and the note row from 014's section (AC-12, AC-13). **Nothing about a row is reimplemented here**, which is the same rule that made the widgets share `handlers` with the list below them.

### Colour

Four tokens, semantic aliases only:

| | |
| --- | --- |
| task | `--surface-attention` (blue-600), already "waiting on you" |
| event | `--text-primary` (ink), a fact of the day |
| note | `--amber-600`, which the kits already use for what offload has noticed |
| other | `--text-tertiary` |

A done dot is the same colour with no fill: a ring. **New surface**, since no kit draws a multi-dot day cell, so it lands in the design system's `decisions.md` with **Design system impact** filled in.

## Removing the widget

- `WIDGET_KINDS` loses `timeline`, and `EARNS` loses its predicate. A thread preference naming it is ignored, which `widgetsFor` already does for a kind a thread does not earn.
- `splitRepeating`, `cadenceOf`, `cadenceLabel` and the `Series` type lose their only callers and go, with their tests. The behaviour they existed for is preserved by the rail drawing a cell per day.
- `STARTS_AS.timeline` in `quickAdd` loses its section and goes with it.
- The web and mobile `Widgets.tsx` lose their timeline branch, their `Repeating` subsection and the `clock` lead icon.

## Edge cases

| | |
| --- | --- |
| Nothing dated on the thread | No rail (AC-1, as reversed 2026-09-15). `railFor` still answers this week for an empty set, which the day picker in the composer relies on; the thread page simply does not mount it. |
| One thing, two years out | Whole weeks to it, with the empty run between collapsed to one line. |
| A thing whose end is before its start | Drawn as a point on its start. A bad range is somebody else's bug and this is not the place to raise it. |
| A day with eleven things | Four dots and a count, and the day view has all eleven. |
| A task with both a due date and an occurrence | Two entries, on both days. It is on the calendar twice because it is two facts. **Changed 2026-10-05:** on a day both fall on, the row is one line and one dot, drawn as the occurrence. |
| An archived row | Not on the rail. It is out of the active list, which is what archive means. |
| A muted note | On the rail. Muting stops it reaching the model, not the screen. |
| The week-start setting changes | The rail redraws from the same array, no fetch (AC-16). |
| A thread open past midnight | `today` is computed on render, so the first render after midnight moves it. Nothing polls. |

## Constitution check

| | |
| --- | --- |
| **OFF-1** | Draws content that is already on screen. No new event, log or trace, and no text leaves the client. |
| **OFF-3** | Reads nothing new. Every row it draws came through the thread bundle, which resolves through membership. |
| **OFF-6** | Writes nothing. The controls inside a day are the existing ones with their existing Undo. |
| **OFF-7** | The multi-dot day cell and the gap row are new surface; both are logged with **Design system impact**. |
| **OFF-8** | Adds nothing to a prompt. |
| **DEV-1** | No query, no table, no index, no fetch. It is arithmetic over rows the page already had. |
