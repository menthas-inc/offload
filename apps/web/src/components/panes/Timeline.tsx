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
  dayLabel,
  datedFor,
  localDay,
  railFor,
  thingsOn,
  weeksIn,
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
  const [opened, setOpened] = useState<Set<string>>(new Set());

  const dated = useMemo(() => datedFor(rows, notes), [rows, notes]);
  const rail = useMemo(
    () => railFor(dated, today, weekStart),
    [dated, today, weekStart]
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

  const expand = (row: Extract<RailRow, { row: "gap" }>): void => {
    const next = new Set(opened);
    next.add(row.key);
    setOpened(next);
  };

  const cell = (day: Day) => (
    <button
      key={day.iso}
      type="button"
      className={styles.railDay}
      data-today={day.today ? true : undefined}
      data-past={day.past ? true : undefined}
      data-on={day.iso === selected ? true : undefined}
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

  const week = (days: Day[], key: string) => (
    <div key={key} className={styles.railWeek}>
      {days.map(cell)}
    </div>
  );

  return (
    <section className={styles.rail}>
      {rail.map((row) => {
        if (row.row === "week") return week(row.days, row.key);
        if (opened.has(row.key)) {
          return (
            <div key={row.key}>
              {weeksIn(row, today).map((one) =>
                one.row === "week" ? week(one.days, one.key) : null
              )}
            </div>
          );
        }
        return (
          <button key={row.key} type="button" className={styles.railGap} onClick={() => expand(row)}>
            {row.weeks} weeks with nothing
          </button>
        );
      })}

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
