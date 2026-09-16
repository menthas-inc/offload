# 007 Widgets and grouping, tasks

## A. Schema and the tool

- [x] **A1** `0016_thread_attrs.sql`: `threads.attrs jsonb`, and the three indexes 006 deferred.
  *Test:* migration up on a fresh database; each index is used by the query it exists for.
- [x] **A2** `schema.ts` and `001-data-model` amended.
- [x] **A3** `set_thread_preference` on the tool endpoint, membership-checked, validated against the closed set of widget kinds *(**AC-7a**)*.
  *Test:* a non-member is refused with the one reason; an unknown widget kind is refused; a dimension nothing carries is accepted.
- [x] **A4** `PATCH /v1/threads/:id/preference` for the screen, returning `previous` *(**AC-7a**)*.
- [x] **A5** `decisions.md`: tick, reprioritise and `set_thread_preference` on the OFF-6 allowlist, **before A3 or C3 ship** *(**AC-7**)*.

## B. Deriving

- [x] **B1** `widgetsFor(rows)`: which widgets a page earns, in the default order *(**AC-1**)*.
  *Test:* a thread with no tasks earns no to-do list; one with a place earns a map; an empty thread earns nothing.
- [x] **B2** Preference order overrides the derived one, and an unknown kind in it is ignored *(**AC-3**)*.
- [x] **B3** `groupBy(rows, dimension)`: buckets, untagged last, ordered by highest priority *(**AC-4**, **AC-5**)*.
  *Test:* a row with no tag in the dimension is in exactly one group and that group is last; a dimension nothing carries yields one group.
- [x] **B4** `dimensionsIn(rows)` is the enumeration, over the page and not the database *(**AC-6**)*.
- [x] **B5** Every widget's rows come from the same page the list uses *(**AC-2**)*.
  *Test:* a row archived from a widget is gone from "Everything in here" in the same render.

## C. The screen

- [x] **C1** The four widgets, from `M3ThreadWidgets.jsx`, never drawn empty *(**AC-1**)*.
- [x] **C2** Group headings, built from the kit's `Chip tone="accent"` vocabulary *(**AC-4**)*.
- [x] **C3** Tick, un-tick and reprioritise, any member, reversible *(**AC-7**, **AC-8**)*.
  *Test:* reprioritising sets `priority_pinned`; the planner then does not overwrite it.
- [x] **C4** The bundle still makes a fixed number of queries with four widgets on screen *(**AC-9**)*
  *Test:* counted at the pool, not reasoned about from the code. A thread earning all four widgets costs exactly what a thread earning none does..
- [x] **C5** `dead-css`, `dead-classes` and `pnpm lint` clean.
- [x] **C6** The To do fold is the member's, `thread_members.hide_done`, written by `PATCH /v1/threads/:id/preference` from web and the phones and composed into `preference` by the server; the count and chevron are one control *(**AC-7b**)*.
  *Test:* `setPreference` with `hideDone` lands on the membership and never in `attrs`; `readPreference` ignores a `hideDone` in `attrs`.

## D. The record

- [x] **D1** Design system `decisions.md`: the group heading as new surface, and the widget contract defined once so the phones render the same thing *(**AC-10**)*.
- [x] **D2** `decisions.md`: `threads.attrs` and why it bends 001's rule.

## E. Dragging a row, 2026-09-16

- [x] **E1** `reorderPlan` and `respread` in `@offload/widgets`: midpoint, re-spread when adjacent, the ends of the scale, never a tie *(**AC-7c**)*.
  *Test:* `apps/web/test/widgets.test.ts`, one case per rule, and the hundred-row limit.
- [x] **E2** Web: `grip-vertical` first in `RowTools`, HTML5 drag with the row as the drag image, arrow keys on the focused handle, the drop line, and the optimistic write with one Undo for every number written *(**AC-7c**)*.
- [x] **E3** Phones: the handle beside the pencil in `ContentRowView`, a pan after a hold, the row lifted and following the finger, the list measuring its rows, and the same optimistic write and Undo *(**AC-7c**)*.
- [x] **E4** `grip-vertical` vendored into the icon set, `public/icons` and the phones' generated set; `dead-icons` clean.
- [ ] **E5** *Not done from this session: needs a device.* Hold the handle on each phone and check the row lifts without the action sheet opening or the scroll view taking the touch, and that a two-line title lands where it was dropped.
- [x] **E6** Design system `decisions.md`: the handle and the drop line as new surface, with **Design system impact** filled in.
