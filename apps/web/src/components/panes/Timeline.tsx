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

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";
import cal from "../../app/(shell)/calendar.module.css";
import { ContentRowView, type RowHandlers } from "./ContentRowView";
import { MonthGrid } from "./MonthGrid";
import { datedFor, monthFor, stepMonth, contentOn, type Dated } from "../../lib/widgets";
import { dayIn, utcDay, eventMeta } from "@offload/widgets";
import { useClock } from "../../lib/clock";
import { useAppearance } from "../../lib/appearance";
import { QUICK_ADD_CHARS, TYPED_ROW_PLACEHOLDER, fetchThreadEvents, rangeOf } from "../../lib/threads";
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

/** 019. A calendar's event as an entry on the rail: kind `calendar`, never done,
 *  never repeating here since the copy already holds every occurrence. The id
 *  is prefixed so it can never collide with a row's. */
function eventDated(event: ThreadEvent, zone: string | null): Dated | null {
  if (!event.occursAt) return null;
  // 023. An all-day event is a date; a timed one lands on its day in the
  // account's clock.
  const day = (at: string) => (event.allDay ? utcDay(new Date(at)) : dayIn(new Date(at), zone));
  const from = day(event.occursAt);
  const end = event.occursEndAt ? day(event.occursEndAt) : from;
  return { id: `event:${event.id}`, rowId: `event:${event.id}`, due: false, kind: "calendar", from, to: end < from ? from : end, done: false };
}


export function Timeline({ threadId, rows, notes, handlers, onToggle, onAdd, calendars }: Props) {
  const { weekStart } = useAppearance();
  // Computed on render rather than held, so the first render after midnight
  // moves today. Nothing polls for it.
  const { zone, today } = useClock();
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
  const own = useMemo(() => datedFor(rows, notes, zone), [rows, notes, zone]);

  // **Always a month.** A rail of weeks was drawn until the span passed six
  // weeks, and a trip over three weeks crossed a month boundary with no way
  // to step. A calendar is read a month at a time, so that is the one shape.
  const here = monthFor(month ?? today, [], today, weekStart).key;

  // 019. The events on the thread's calendars, by the days a month draws,
  // from the copy. **A month is drawn once** (2026-09-29): its dots wait for
  // its events, and the months either side are read ahead, so neither opening
  // the thread nor an arrow shows the grid changing under whoever reads it.
  // Keyed by the thread, so another thread's events can never be drawn
  // here, and by the picks' version, so a change of calendars reads again.
  const windowOf = (at: string): string => {
    const weeks = monthFor(at, [], today, weekStart).weeks;
    return `${threadId}|${calendars.version}|${weeks[0]?.days[0]?.iso ?? at}|${weeks[weeks.length - 1]?.days[6]?.iso ?? at}`;
  };
  const [read, setRead] = useState<Map<string, ThreadEvent[]>>(() => new Map());
  const asking = useRef(new Set<string>());
  useEffect(() => {
    if (!calendars.anyPicked) return;
    for (const at of [here, stepMonth(here, 1), stepMonth(here, -1)]) {
      const window = windowOf(at);
      if (asking.current.has(window)) continue;
      asking.current.add(window);
      const [, , from, to] = window.split("|") as [string, string, string, string];
      void fetchThreadEvents(threadId, from, to)
        .catch(() => null)
        .then((found) => {
          // A month whose calendars did not answer is drawn with the
          // thread's own dots, and asked for again the next time it is near.
          if (found === null) asking.current.delete(window);
          setRead((held) => new Map(held).set(window, found ?? []));
        });
    }
    // `windowOf` reads only what is listed here.
  }, [threadId, here, today, weekStart, calendars.anyPicked, calendars.version]);

  const shownEvents = calendars.anyPicked ? read.get(windowOf(here)) : [];
  const events = useMemo(() => shownEvents ?? [], [shownEvents]);
  const ready = shownEvents !== undefined;

  // Everything on the thread's days, for the day list: the thread's own
  // things at once, a calendar's as they arrive. Only the grid waits.
  const dated = useMemo(
    () => [...own, ...events.map((event) => eventDated(event, zone)).filter((one): one is Dated => one !== null)],
    [own, events, zone]
  );
  const eventsById = useMemo(() => new Map(events.map((event) => [`event:${event.id}`, event])), [events]);

  // The grid's dots wait for the month's calendars, so it is drawn once.
  const grid = useMemo(
    () => monthFor(here, ready ? dated : [], today, weekStart),
    [here, ready, dated, today, weekStart]
  );

  // What is on the open day, drawn as whatever each one is.
  //
  // **Over the entries, not the rows.** A task with an occurrence on Tuesday
  // and a due date on Thursday is on both days and they are two different
  // facts, so drawing it from the row's own fields put Tuesday's time on
  // Thursday and said the thing happens on a day it does not.
  const onDay = contentOn(dated, selected);
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

  const goToday = (): void => {
    // Back to this month from wherever you are, and in the direction that is
    // actually true: forward if you had wandered into the past.
    setWent(grid.key > today ? -1 : 1);
    setMonth(null);
    pick(today);
  };

  const step = (by: 1 | -1): void => {
    setWent(by);
    setMonth(stepMonth(grid.key, by));
  };

  return (
    <section className={styles.rail}>
      {/* A month at a time: the grid Today draws too. */}
      <MonthGrid grid={grid} selected={selected} went={went} onPick={pick} onStep={step} onToday={goToday} />

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

      {/* 019, redrawn to the 21 September design: a calendar's event is
          DayAgenda's EventLine with two additions, the calendar's colour on
          the anchor and its name as the caption. Another member's calendar
          is named by their display name, which the wire already does. No
          checkbox, no tools, no sheet, no tap: it is the calendar's, read
          through the thread, and changing it is changing the calendar. */}
      {dayEvents.length ? (
        <div className={cal.runway}>
          <span className={cal.spine} aria-hidden="true" />
          {dayEvents.map(({ one, event }) => {
            const when = event.allDay || !event.occursAt ? "All day" : rangeOf(event.occursAt, event.occursEndAt);
            return (
              <div key={one.id} className={cal.eventLine}>
                <span
                  className={cal.anchor}
                  style={{ background: event.colour ?? "var(--border-strong)" }}
                  aria-hidden="true"
                />
                <span className={cal.eventTime}>{when}</span>
                <span className={cal.text}>
                  {/* 027. An event the viewer is not in stays, quieter, and says so. */}
                  <span className={cal.eventTitle} data-theirs={event.involved === false || undefined}>
                    {event.title}
                  </span>
                  <span className={cal.eventName}>{eventMeta(event.calendarName, event.involved)}</span>
                </span>
              </div>
            );
          })}
        </div>
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
          checkbox={row.type === "task"}
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
              {/* 023. The chip says the hour; the day list only says a row is here
                      for the day it is wanted by rather than the day it happens. */}
                  {one.due ? "due" : ""}
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
        placeholder={TYPED_ROW_PLACEHOLDER}
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
