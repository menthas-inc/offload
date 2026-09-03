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

## D. The record

- [x] **D1** Design system `decisions.md`: the group heading as new surface, and the widget contract defined once so the phones render the same thing *(**AC-10**)*.
- [x] **D2** `decisions.md`: `threads.attrs` and why it bends 001's rule.
