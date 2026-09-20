"use client";

// The rail: a thread's dates as weeks, and the day underneath it.
//
// **It is not a widget and it is drawn for every thread**, including one with
// no dates on it at all, which is why 015 took it out of the earned set rather
// than making it a widget that is always earned. 007's rule is about splitting
// content by what it is; this is about time passing, and the empty days are
// most of what it says.
//
// **There is no mock for this anywhere.** The nearest thing is the phones'
// `TimelineWidget`, a Mon to Sun rail with one dot per day for "has content"
// and an Overall/Daily toggle. This keeps its shape, gives the dot a colour per
// kind and lets a day have several, and drops the toggle: picking a day is the
// toggle. Logged in the design system's `decisions.md`.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";
import cal from "../../app/(shell)/calendar.module.css";
import { ContentRowView, type RowHandlers } from "./ContentRowView";
import {
  WEEKS_BEFORE_MONTHS,
  dayLabel,
  datedFor,
  localDay,
  monthFor,
  railFor,
  stepMonth,
  thingsOn,
  weeksSpanned,
  type Dated,
  type Day,
  type RailRow,
} from "../../lib/widgets";
import { useAppearance } from "../../lib/appearance";
import { QUICK_ADD_CHARS, fetchThreadEvents } from "../../lib/threads";
import type { ContentRow, Note, ThreadEvent } from "../../lib/threads";

interface Props {
  threadId: string;
  rows: ContentRow[];
  notes: Note[];
  handlers: RowHandlers;
  onToggle: (row: ContentRow) => void;
  /** Something was typed straight onto the open day. The page owns the rows,
   *  so it draws the new one on that day and writes it. */
  onAdd: (text: string, day: string) => void;
  /** 019. Whether any member has picked a calendar here, which is what puts
   *  the calendars' events on the rail. Bumped when the picks change. */
  calendars: { anyPicked: boolean; version: number };
}

/** 019. A calendar's event as an entry on the rail: kind `event`, never done,
 *  never repeating here since the copy already holds every occurrence. The id
 *  is prefixed so it can never collide with a row's. */
function eventDated(event: ThreadEvent): Dated | null {
  if (!event.occursAt) return null;
  const from = localDay(new Date(event.occursAt));
  const end = event.occursEndAt ? localDay(new Date(event.occursEndAt)) : from;
  return { id: `event:${event.id}`, rowId: `event:${event.id}`, due: false, kind: "event", from, to: end < from ? from : end, done: false };
}

/** The hour, for a row that has one. */
function time(at: string): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** The colour of a dot is what the thing is.
 *
 *  Semantic aliases, never a ramp: blue already means waiting on you, ink is a
 *  fact of the day rather than a demand on it, and amber is what the kits use
 *  for something offload has noticed. A done dot keeps its colour and loses its
 *  fill, so the legend stays about kind and weight says state. */
const DOT: Record<string, string> = {
  // **Text aliases, not fill aliases, and the lift is why.**
  // `--surface-attention` and `--surface-noticed` are deliberately fixed across
  // themes, which is right for a chip and wrong for a 5px mark whose backdrop
  // now changes with the theme. Measured on the lift, the task dot was 2.62:1 in
  // dark and the note dot 2.03:1 in light. Event and other already used text
  // aliases and already passed, which is what makes this a rule rather than two
  // patches.
  task: "var(--text-attention)",
  event: "var(--text-primary)",
  note: "var(--text-noticed)",
  other: "var(--text-tertiary)",
};

export function Timeline({ threadId, rows, notes, handlers, onToggle, onAdd, calendars }: Props) {
  const { weekStart } = useAppearance();
  // Computed on render rather than held, so the first render after midnight
  // moves today. Nothing polls for it.
  const today = localDay(new Date());
  // **Thread-scoped only because this is keyed by the thread.** `selected` and
  // `opened` are plain state, and the day somebody was reading would otherwise
  // follow them into the next thread, along with a gap row that reads as
  // already open because its key is a date with no thread in it. The caller
  // passes `key`, and the page keys `Thread` by thread id besides.
  const [selected, setSelected] = useState(today);
  // The day's own +. Closed the moment the row is written, same as every
  // other section's: the request that matters has already succeeded.
  const [adding, setAdding] = useState(false);
  // The month on screen, in month mode. Null means the one today is in, so it
  // follows today over midnight rather than pinning the month this mounted in.
  const [month, setMonth] = useState<string | null>(null);
  // Which way the last move went, so the grid comes in from the side it came
  // from. Movement says which direction you went in a way a redraw cannot.
  const [went, setWent] = useState<1 | -1>(1);

  // The thread's own dated things: what the span is made of.
  const own = useMemo(() => datedFor(rows, notes), [rows, notes]);

  // **A rail past a few weeks stops being a rail.** Weeks read as time passing,
  // which is what the empty days are for; a year of weeks is a scroll. Past the
  // threshold it draws the shape everybody already knows instead, a month at a
  // time with a way to step through them.
  //
  // **The span is the thread's own.** A picked calendar's twelve months of
  // events do not stretch a rail into a month view; they are drawn inside
  // whatever span the thread's rows and notes make.
  const weeks = useMemo(() => weeksSpanned(own, today, weekStart), [own, today, weekStart]);
  const asMonth = weeks > WEEKS_BEFORE_MONTHS;

  const ownRail = useMemo(
    () => (asMonth ? null : railFor(own, today, weekStart)),
    [asMonth, own, today, weekStart]
  );
  const ownGrid = useMemo(
    () => (asMonth ? monthFor(month ?? today, own, today, weekStart) : null),
    [asMonth, month, own, today, weekStart]
  );

  // The days on screen, which is the window the calendars are read for.
  const shown = ownRail ?? ownGrid?.weeks ?? [];
  const from = shown[0]?.days[0]?.iso ?? today;
  const to = shown[shown.length - 1]?.days[6]?.iso ?? today;

  // 019. The events on the thread's calendars inside that window, from the
  // copy. Read again when the window moves or the picks change.
  const [events, setEvents] = useState<ThreadEvent[]>([]);
  useEffect(() => {
    if (!calendars.anyPicked) {
      setEvents([]);
      return;
    }
    let live = true;
    void fetchThreadEvents(threadId, from, to).then((found) => {
      if (live) setEvents(found);
    });
    return () => {
      live = false;
    };
  }, [threadId, from, to, calendars.anyPicked, calendars.version]);

  const dated = useMemo(
    () => [...own, ...events.map(eventDated).filter((one): one is Dated => one !== null)],
    [own, events]
  );
  const eventsById = useMemo(() => new Map(events.map((event) => [`event:${event.id}`, event])), [events]);

  // The same span, now with the calendars' dots in it: the events were
  // fetched for exactly these days, so they cannot widen it.
  const rail = useMemo(
    () => (asMonth ? null : railFor(dated, today, weekStart)),
    [asMonth, dated, today, weekStart]
  );
  const grid = useMemo(
    () => (asMonth ? monthFor(month ?? today, dated, today, weekStart) : null),
    [asMonth, month, dated, today, weekStart]
  );

  // What is on the open day, drawn as whatever each one is.
  //
  // **Over the entries, not the rows.** A task with an occurrence on Tuesday
  // and a due date on Thursday is on both days and they are two different
  // facts, so drawing it from the row's own fields put Tuesday's time on
  // Thursday and said the thing happens on a day it does not.
  const onDay = thingsOn(dated, selected);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const notesById = new Map(notes.map((note) => [note.id, note]));
  const dayRows = onDay
    .map((one) => ({ one, row: byId.get(one.rowId) }))
    .filter((pair): pair is { one: Dated; row: ContentRow } => pair.row !== undefined);
  const dayNotes = onDay
    .map((one) => ({ one, note: notesById.get(one.rowId) }))
    .filter((pair): pair is { one: Dated; note: Note } => pair.note !== undefined);
  const dayEvents = onDay
    .map((one) => ({ one, event: eventsById.get(one.rowId) }))
    .filter((pair): pair is { one: Dated; event: ThreadEvent } => pair.event !== undefined);

  // A day switch closes the open composer rather than carrying it along: it
  // was open on the day it was open on, and offering to add to a different one
  // through the same field would be adding to the day you left, silently.
  const pick = (iso: string): void => {
    setAdding(false);
    setSelected(iso);
  };

  const cell = (day: Day, outside = false) => (
    <button
      key={day.iso}
      type="button"
      className={styles.railDay}
      data-today={day.today ? true : undefined}
      data-past={day.past ? true : undefined}
      data-on={day.iso === selected ? true : undefined}
      // **A day with anything on it is tinted, not only dotted.** Five pixels
      // of colour is easy to miss across seven cells; the cell itself carrying
      // a quiet inward edge is what makes a week readable at a glance, and the
      // dots then say what kind and how many.
      data-has={day.count > 0 ? true : undefined}
      data-outside={outside ? true : undefined}
      aria-pressed={day.iso === selected}
      // The dots are the fast read and never the only one.
      aria-label={dayLabel(day)}
      onClick={() => pick(day.iso)}
    >
      <span className={styles.railDow}>{day.dow}</span>
      <span className={styles.railDom}>{day.dom}</span>
      <span className={styles.railDots} aria-hidden="true">
        {day.dots.map((dot, index) => (
          <span
            key={index}
            className={styles.railDot}
            data-done={dot.done ? true : undefined}
            style={{ color: DOT[dot.kind] ?? DOT["other"] }}
          />
        ))}
        {day.count > day.dots.length ? (
          <span className={styles.railMore}>+{day.count - day.dots.length}</span>
        ) : null}
      </span>
    </button>
  );

  const week = (row: RailRow, outside?: (iso: string) => boolean) => (
    <div key={row.key} className={styles.railWeek}>
      {row.days.map((day) => cell(day, outside ? !outside(day.iso) : false))}
    </div>
  );

  const goToday = (): void => {
    // Back to this month from wherever you are, and in the direction that is
    // actually true: forward if you had wandered into the past.
    if (grid) setWent(grid.key > today ? -1 : 1);
    setMonth(null);
    pick(today);
  };

  const step = (by: 1 | -1): void => {
    if (!grid) return;
    setWent(by);
    setMonth(stepMonth(grid.key, by));
  };

  return (
    <section className={styles.rail}>
      {/* A month at a time, once the span is past a few weeks. The controls are
          the ones a calendar always has, and Today is the way back from
          wherever stepping through months left somebody. */}
      {grid ? (
        <div className={styles.railMonth}>
          <button
            type="button"
            className={styles.railStep}
            aria-label="Previous month"
            onClick={() => step(-1)}
          >
            <Icon name="chevron-left" size={16} />
          </button>

          {/* **The arrows are the ends and everything else is between them.**
              Today sat outside the next arrow, which put the two ways of
              moving through months on either side of a control that is not
              one. It is always drawn rather than only when you have wandered:
              appearing and disappearing would shift the month name beside it,
              and on this month it still does something, which is take the day
              back to today. */}
          <span className={styles.railMiddle}>
            <span className={styles.railMonthName}>{grid.label}</span>
            <button type="button" className={styles.railToday} onClick={goToday}>
              Today
            </button>
          </span>

          <button
            type="button"
            className={styles.railStep}
            aria-label="Next month"
            onClick={() => step(1)}
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      ) : null}

      {/* Keyed by the month so it remounts and the animation runs. Without the
          key the same element is rewritten in place and nothing moves, which
          is a redraw rather than a change of month. */}
      {grid ? (
        <div key={grid.key} className={styles.railSlide} data-went={went}>
          {grid.weeks.map((row) => week(row, grid.inMonth))}
        </div>
      ) : (
        (rail ?? []).map((row) => week(row))
      )}

      <div className={styles.railDayHead}>
        <h2 className={styles.section} style={{ paddingTop: "var(--space-0)" }}>
          {new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
          {selected === today ? <em className={styles.sectionCount}>Today</em> : null}
          {/* Straight onto this day, without going through the composer. The
              same model reads it, grounded in this thread, and it leaves no
              trace in the conversation, exactly like every other section's +. */}
          {adding ? null : (
            <button
              type="button"
              className={styles.sectionAdd}
              aria-label="Add to this day"
              title="Add"
              onClick={() => setAdding(true)}
            >
              <Icon name="plus" size={15} />
            </button>
          )}
        </h2>

        {adding ? (
          <DayQuickAdd
            onAdd={(text) => {
              setAdding(false);
              onAdd(text, selected);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : null}
      </div>

      {dayRows.length === 0 && dayNotes.length === 0 && dayEvents.length === 0 ? (
        <p className={styles.railEmpty}>Nothing on this day.</p>
      ) : null}

      {/* 019. A calendar's event: the calendar's colour dot with its ring, the
          title, the time or All day, and the calendar's name as its note. No
          checkbox, no tools, no sheet: it is the calendar's, read through the
          thread, and changing it is changing the calendar. */}
      {dayEvents.map(({ one, event }) => (
        <div key={one.id} className={cal.eventLine}>
          <span
            className={cal.dot}
            style={{ background: event.colour ?? "var(--border-strong)" }}
            aria-hidden="true"
          />
          <span className={cal.text}>
            <span className={cal.eventTitle}>{event.title}</span>
            <span className={cal.note}>{event.calendarName}</span>
          </span>
          <span className={cal.eventTime}>{event.allDay || !event.occursAt ? "All day" : time(event.occursAt)}</span>
        </div>
      ))}

      {dayNotes.map(({ one, note }) => (
        <div key={one.id} className={styles.railNote}>
          {note.origin === "learned" ? (
            <>
              <Icon name="sparkles" size={14} className={styles.noteGlyph} />
              <span className={styles.hidden}>offload wrote this. </span>
            </>
          ) : null}
          <span className={styles.noteText}>{note.text}</span>
        </div>
      ))}

      {dayRows.map(({ one, row }) => (
        <ContentRowView
          key={one.id}
          row={row}
          handlers={handlers}
          lead={
            row.type === "task" ? (
              <input
                type="checkbox"
                className={styles.rowCheck}
                checked={row.doneAt !== null}
                onChange={() => onToggle(row)}
                aria-label={
                  row.doneAt !== null ? `Put ${row.title} back on the list` : `Finish ${row.title}`
                }
              />
            ) : (
              <span className={styles.rowIcon}>
                <Icon name={row.type === "event" ? "calendar" : "clock"} size={18} />
              </span>
            )
          }
          meta={
            <span className={styles.rowMeta}>
              {/* **Nothing when the date has no time in it.** A bare date is a
                  day, and drawing an hour it does not have is how "Sunday
                  brunch" read "8:00 PM". */}
              {one.due ? "due" : row.allDay || !row.occursAt ? "" : time(row.occursAt)}
            </span>
          }
        />
      ))}
    </section>
  );
}

/** Typing straight onto the day that is open.
 *
 *  The same field as every other section's, and nothing else on it.
 *
 *  **It had a "Repeats weekly" box for three days.** The reasoning was that
 *  `edit_content` carries no repeat field, so a repeat had to be structural or
 *  it could never be set. It can: the model reads the words at the moment it
 *  writes the row, and "weekly on Monday at 2pm" says more than one box ever
 *  could, in the way this product is supposed to be talked to. The box asked
 *  somebody to choose a format before they could put something down, which is
 *  the thing the composer exists not to do.
 *
 *  **The day stays structural**, because it is not something they said. It is
 *  the heading they pressed +  on. */
function DayQuickAdd({ onAdd, onCancel }: { onAdd: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState("");

  function save(): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return onCancel();
    onAdd(trimmed);
  }

  return (
    <div className={styles.dayQuickAdd}>
      <input
        className={styles.quickAddField}
        value={text}
        autoFocus
        maxLength={QUICK_ADD_CHARS}
        placeholder="Type it, offload will sort it out"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter") save();
        }}
        aria-label="Add to this day"
      />
      <div className={styles.dayQuickAddRow}>
        <div className={styles.dayQuickAddActions}>
          <button type="button" className={styles.sectionAction} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.quickAddSave}
            disabled={text.trim().length === 0}
            onClick={save}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
