# 015 The timeline, tasks

> Ordered. Shared arithmetic first, because three surfaces draw the same rail and two of them are a phone.

## Foundation

- [x] **F1** `packages/widgets`: `Dated`, `datedFor`, `railFor`, `thingsOn`, `WeekStart`, `MAX_DOTS`. Local dates as `YYYY-MM-DD` throughout. (AC-2, AC-3, AC-4, AC-6, AC-7)
- [x] **F2** The gap row: three or more empty weeks collapse, one and two do not. (AC-5)
- [x] **F3** Remove the widget: `timeline` out of `WIDGET_KINDS` and `EARNS`, `splitRepeating` and `cadenceLabel` and `Series` deleted with their tests, `STARTS_AS.timeline` deleted. (Feature spec, "What this replaces")

## Web

- [x] **W1** `Timeline.tsx`: the rail, weeks and days, dots by kind, today marked, past quiet. (AC-1, AC-2, AC-3, AC-9, AC-15)
- [x] **W2** The day under the rail, open on today, drawing each thing as its own kind through `ContentRowView` and the note row. (AC-11, AC-12, AC-13, AC-14)
- [x] **W3** Accessible names on every day card, counts in words. (AC-10)
- [x] **W4** Wire into `Thread.tsx` above the widgets, and take the timeline branch out of `Widgets.tsx`. (AC-1)
- [x] **W5** Week start in the appearance store and the Appearance pane. (AC-16)

## Mobile

- [x] **M1** W1 to W4 on both platforms from the shared module. (AC-1 to AC-15)
- [x] **M2** Week start in the phones' appearance store and settings screen. (AC-16)

*Not done: nothing has run on a device. The rail is the first thing in this product with seven tap targets across a phone's width, and `find-kit.sh` has no mock to check it against.*

## Tests

- [x] **T1** `railFor`: whole weeks, both week starts, today always in the span, a thread with nothing dated giving this week. (AC-1, AC-2, AC-4)
- [x] **T2** A span fills every day between its ends, and a repeating series draws every occurrence. (AC-7, AC-8)
- [x] **T3** Gap rows at three, not at two. (AC-5)
- [x] **T4** `datedFor` reads content and notes into one shape, and a task with a due date and an occurrence lands on both days. (AC-6)
- [x] **T5** Local dates: a 23:00 event is on its own day, not tomorrow. (impl-spec, "Dates are local")
- [x] **T6** The widget is gone: `widgetsFor` never returns `timeline`, and a preference naming it is ignored rather than breaking. (F3)
