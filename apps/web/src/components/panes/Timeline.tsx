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

import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";
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
import type { ContentRow, Note } from "../../lib/threads";

interface Props {
  rows: ContentRow[];
  notes: Note[];
  handlers: RowHandlers;
  onToggle: (row: ContentRow) => void;
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
  task: "var(--surface-attention)",
  event: "var(--text-primary)",
  note: "var(--surface-noticed)",
  other: "var(--text-tertiary)",
};

export function Timeline({ rows, notes, handlers, onToggle }: Props) {
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
  // The month on screen, in month mode. Null means the one today is in, so it
  // follows today over midnight rather than pinning the month this mounted in.
  const [month, setMonth] = useState<string | null>(null);

  const dated = useMemo(() => datedFor(rows, notes), [rows, notes]);

  // **A rail past a few weeks stops being a rail.** Weeks read as time passing,
  // which is what the empty days are for; a year of weeks is a scroll. Past the
  // threshold it draws the shape everybody already knows instead, a month at a
  // time with a way to step through them.
  const weeks = useMemo(
    () => weeksSpanned(dated, today, weekStart),
    [dated, today, weekStart]
  );
  const asMonth = weeks > WEEKS_BEFORE_MONTHS;

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
      onClick={() => setSelected(day.iso)}
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
    setMonth(null);
    setSelected(today);
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
            onClick={() => setMonth(stepMonth(grid.key, -1))}
          >
            <Icon name="chevron-left" size={16} />
          </button>
          <span className={styles.railMonthName}>{grid.label}</span>
          <button
            type="button"
            className={styles.railStep}
            aria-label="Next month"
            onClick={() => setMonth(stepMonth(grid.key, 1))}
          >
            <Icon name="chevron-right" size={16} />
          </button>
          <button type="button" className={styles.railToday} onClick={goToday}>
            Today
          </button>
        </div>
      ) : null}

      {(grid ? grid.weeks : (rail ?? [])).map((row) =>
        week(row, grid ? grid.inMonth : undefined)
      )}

      <div className={styles.railDayHead}>
        <h2 className={styles.section} style={{ paddingTop: "var(--space-0)" }}>
          {new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
          {selected === today ? <em className={styles.sectionCount}>Today</em> : null}
        </h2>
      </div>

      {dayRows.length === 0 && dayNotes.length === 0 ? (
        <p className={styles.railEmpty}>Nothing on this day.</p>
      ) : null}

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
