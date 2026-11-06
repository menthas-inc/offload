# 007 Widgets and grouping, implementation spec

> How. The what and the why are in `feature-spec.md`.

## Shape

Almost entirely client work, plus one column and one tool.

```
threads.attrs jsonb          the two preferences
thread_members.hide_done     the To do fold, per member, since 2026-09-15 (0044); composed into `preference` by the server
POST /internal/v1/tool-call  gains set_thread_preference
apps/web  the widgets, the grouping, tick and reprioritise
```

## Data model

```sql
alter table threads add column attrs jsonb not null default '{}'::jsonb;
```

**`attrs` rather than columns, and this is the one place 001's rule bends.** 001 says `attrs` holds what no screen queries, and a screen queries these. The rule is a proxy for the real test, which is whether a value ever appears in a `WHERE` clause: these are read whole with the thread they belong to, on the one query that already fetches it, and nothing filters or sorts by them. A column per preference would be two columns today and one per widget kind forever.

Shape, validated on write and tolerated on read:

```jsonc
{
  // Which tag dimension each widget groups by. Absent means one flat list.
  "groupBy": { "todo": "city", "files": "kind" },
  // Widget kinds, in the order they appear. Absent means derived from content.
  "widgets": ["map", "todo", "timeline", "files"]
}
```

**Tolerated on read** matters more than it sounds. A preference naming a widget that no longer exists, or a dimension nothing is tagged with any more, must render as though it were absent rather than as an error. A thread whose contents changed under a preference is the normal case, not an edge one.

### Indexes

The three 006 deliberately did not add, now that something reads them:

```sql
create index content_thread_priority_idx
  on content (thread_id, priority desc, created_at desc)
  where deleted_at is null and archived_at is null;

create index content_thread_open_tasks_idx
  on content (thread_id, priority desc)
  where type = 'task' and done_at is null
    and deleted_at is null and archived_at is null;

create index content_thread_dated_idx
  on content (thread_id, occurs_at)
  where occurs_at is not null and deleted_at is null and archived_at is null;
```

*006 left these out on the grounds that nothing read them and 007 might want a different column order. It did not; they are as drafted. Recorded because the discipline was right even though the guess turned out fine.*

## Volume and access

| | Typical | Heavy |
| --- | --- | --- |
| content per thread | 15 | 500 |
| widgets a thread earns | 1 to 2 | 4 |
| distinct dimensions in one thread | 0 to 1 | 3 |

**The page still makes a fixed number of queries and this feature must not change that.** One query per widget is the shape 005's AC-2 forbids, and four widgets is where it would start to look reasonable.

So: **one content page, bucketed in memory.** The thread page already fetches a page ordered by priority then recency; widgets are `filter` calls over rows already in hand, and groups are a second `filter` over those. 001's heavy case is 500 rows in one thread, and the page shows 30. A widget wanting its full list opens its own paginated view, which is a navigation rather than part of the bundle.

Enumerating a thread's dimensions is a scan over the fetched page, not a query. A GIN on `text[]` indexes whole elements and not the prefix before a colon, so an indexed answer would need a different structure and nothing wants one.

## Widgets are earned

Derived from the page, in one pass:

| Widget | Earns it | Renders |
| --- | --- | --- |
| `todo` | any `task`, done or not | checkboxes, priority order, finished ones sunk to the bottom |
| `map` | any row with a `place_id` | pins on a plain surface, then a list |
| `timeline` | any row with `occurs_at` | dated rows, oldest first |
| `files` | any `image`, `screenshot`, `file` or `link` | a grid |

**Never drawn empty and never configured into existence.** A thread that loses its last dated row loses its timeline, and that is the widget system working rather than state going missing.

**A heading counts what is live**, `liveCount` in `@offload/widgets`: open tasks for To do, every row for the rest, since 2026-09-16. It was the widget's whole row count, and the phones and web each read it straight off `rows.length`, which is how one rule became two numbers. The filter chips are not headings and still count every row they select.

Default order when the thread has no preference: by how much of the thread each widget accounts for, descending, so a trip full of places leads with the map without anyone choosing. Ties break in the table's order above, so the same thread always draws the same way.

## Grouping

One mechanism, applied inside a widget:

1. Take the widget's rows.
2. If the thread names a dimension for that widget, bucket by the value of that dimension.
3. Rows with no tag in that dimension go in one unnamed group, **last**. Nothing is invisible for not being tagged.
4. Groups are ordered by their highest-priority row, so the group that matters leads.

A group heading is new surface. The design system has `SectionHeader`, 21px over a rule and too heavy for a sub-group, and `Chip`, which the kit already uses with `tone="accent"` and a sparkles icon for anything offload derived. **The heading is built from that vocabulary**, and it is an OFF-7 entry.

## `set_thread_preference`

The ninth tool, arriving with the column it writes.

```
{ "tool": "set_thread_preference", "jobId": uuid, "toolCallId": string,
  "threadId": uuid,
  "groupBy": { "todo": "city" } | null,
  "widgets": ["map","todo"] | null }
```

- Membership-checked per call, like every thread-targeting tool.
- Validated against the closed sets of widget kinds and against `MAX_TAGS`-shaped dimension names. A dimension nothing is tagged with is **accepted**, because somebody saying "group this by city" before anything has a city is a reasonable thing to say and the answer is that it starts working when something does.
- Reversible, and on the OFF-6 allowlist **before it ships**. Changing how a thread is arranged is a structural change somebody has to be able to take back.
- `previous` is returned, so Undo is the same call with the old value.

## Tick and reprioritise

Both open to any member, both on 005's co-owned side, both reversible.

- Ticking writes `done_at`, and a ticked row stays in the list struck through rather than vanishing, so Undo has something to point at.
- Reprioritising sets `priority` and **`priority_pinned` to true**, which is what stops the planner overwriting it. The flag is set by a person's action, never by the model.

## Dragging a row

*2026-09-16.* Reprioritising with a handle instead of a number. No new endpoint, no new column: `POST /v1/content/:id/priority` is what a drop calls, once per row it changes.

**What actually orders the list, found while building this.** `GET /v1/threads/:id/content` orders by `content.id desc`, which is recency, and `content_thread_priority_idx` from 0016 has no reader. The priority order lives in `sinkDone` in `@offload/widgets`: done last, then priority descending, then the page's own order, which is newest first. So the To do list is priority then recency in memory, and "Everything in here" is recency alone. This spec's earlier sentence that the page "already fetches a page ordered by priority then recency" described the index, not the query. Left as it is: the page is thirty rows, and the widget sorts them.

**The arithmetic is shared.** `reorderPlan(rows, from, to)` in `packages/widgets/src/reorder.ts`, imported by the web, both phones and the server's test. It takes the visible list top first and returns the rows in their new order plus the writes: one `{ id, priority, previous }` when a midpoint exists, every changed row when the list had to be re-spread. `previous` is what Undo writes back. `respread` gives `n` rows `floor(100 * (n - i) / (n + 1))`, so three rows come out 75, 50, 25 and a hundred come out 100 down to 1.

**Per surface:**

| | Handle | Gesture | Feedback |
| --- | --- | --- | --- |
| web | `grip-vertical` at the row's leading edge, left of the checkbox, always drawn, no container (moved there from the tools the same day) | HTML5 drag from the handle, the whole row as the drag image; arrow keys on the focused handle move one step | a 2px ink line on the edge of the row under the pointer where the drop would land; the dragged row takes `--surface-fill` |
| iOS, Android | `grip-vertical` at the row's leading edge, left of the checkbox, always drawn, no container | `Gesture.Pan().activateAfterLongPress(250)` on the handle, in `ContentRowView`; the row follows the finger on a Reanimated `translateY` and lifts to `surface-raised` | the list measures its rows with `onLayout` and reads the drop off the dragged row's centre |

The phones' handle pan activates at 250ms, before the row's own 320ms long press, so holding the handle never opens the action sheet, and a vertical drag is exactly what the row's swipe fails on (`failOffsetY`). No list library: the app already has reanimated and gesture-handler, and a reorderable list dependency for one widget is not the smallest change.

**The writes are optimistic** on web and the phones: the rows take their new priorities on the drop, the requests go out together, the page reloads, and Undo writes every `previous` back through the same endpoint. A failed write leaves the screen as the server has it on the reload, which is the rule every other write on the page follows.

**Notes take the same helper** through their own endpoint; 014's impl-spec has the column and the route.

## Edge cases

- **A preference naming a widget the thread no longer earns.** Ignored, not an error.
- **A preference naming a dimension nothing carries.** One unnamed group holding everything, which reads as ungrouped and is honest.
- **A row tagged in two dimensions the thread could group by.** Only the named dimension is used. The other is still there and still groupable if the preference changes.
- **Every row in a group is ticked.** The group collapses to a heading and a count rather than disappearing, so the work that was done is visible.
- **A thread with 500 rows and four widgets.** One page of 30, bucketed four ways. A widget's heading counts the live rows the page holds and grows as the page does; it is never a number the list under it cannot show.

## Constitution check

| | |
| --- | --- |
| DEV-1 | One column, one tool, three indexes that now have readers. The drag reuses the priority endpoint and adds no column. |
| DEV-2 | 001 amended with `threads.attrs` in the same change. |
| DEV-3 | No new dependency. The map is pins on a surface. |
| QUAL-1 | Every criterion mapped in `tasks.md`. |
| QUAL-2 | Bucketing is one function over rows already fetched, called by each widget. |
| SEC-1 | No model output is trusted; the preference is validated against closed sets. |
| SEC-2 | `set_thread_preference` is membership-checked per call. |
| DATA-1 | Schema, indexes, volumes and access paths above. |
| OFF-1 | No event, log or trace gains a tag, a dimension or a title. |
| OFF-2 | No blobs. |
| OFF-3 | Tick and reprioritise are co-owned; nothing here deletes. |
| OFF-4 | No connectors. A thread-scoped connection is still the connector spec's. |
| OFF-5 | Tool arguments validated before execution. |
| OFF-6 | Tick, reprioritise and `set_thread_preference` **added to the allowlist before they ship**. |
| OFF-7 | The group heading is new surface and gets an entry. |
| OFF-8 | No prompt growth: the tool adds roughly 80 tokens against a 1,500 budget now at 1,031. |

## Amended 2026-11-06, the owner

**What is finished starts hidden.** `thread_members.hide_done` defaults to true, and migration 0099 sets it for every existing member, since a false never recorded a choice. To do shows its count and chevron, and one press shows the finished rows for that member and thread. The API and clients are unchanged. Folded notes needed nothing: they were already behind Show N folded.
