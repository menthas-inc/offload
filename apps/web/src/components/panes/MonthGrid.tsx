"use client";

// A month as a calendar: the thread calendar's grid, and since 2026-10-18
// Today's too, in place of Today's day stepper. One grid, so a day is dotted,
// named and picked the same way in both.
//
// The controls are the ones a calendar always has: the arrows at the ends and
// Today between them, the way back from wherever stepping left somebody. A day
// that does not open is drawn and closed: Today's past, and anything past the
// edge of what offload keeps of a calendar.

import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";
import { dayLabel, type Day, type Month, type RailRow } from "../../lib/widgets";

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
  // 2026-09-29. A picked calendar's event, drawn hollow in the quietest ink:
  // a calendar with something every day otherwise lit every cell and the
  // thread's own days stopped standing out.
  calendar: "var(--text-tertiary)",
};

export function MonthGrid({
  grid,
  selected,
  went,
  onPick,
  onStep,
  onToday,
  closed,
  first = false,
  last = false,
  title,
  heading = false,
}: {
  grid: Month;
  selected: string;
  /** Which way the last move went, so the grid comes in from that side. */
  went: 1 | -1;
  onPick: (iso: string) => void;
  onStep: (by: 1 | -1) => void;
  onToday: () => void;
  /** A day that is drawn but does not open. */
  closed?: (iso: string) => boolean;
  /** No month before this one, or after it. */
  first?: boolean;
  last?: boolean;
  /** What the head names in place of the month: Today's picked day. */
  title?: string | undefined;
  /** The head is the page's heading, as on Today. */
  heading?: boolean;
}) {
  const name = title ?? grid.label;
  const cell = (day: Day, outside: boolean) => (
    <button
      key={day.iso}
      type="button"
      className={styles.railDay}
      data-day={day.iso}
      data-today={day.today ? true : undefined}
      data-past={day.past ? true : undefined}
      data-on={day.iso === selected ? true : undefined}
      // **A day with anything on it is tinted, not only dotted.** Five pixels
      // of colour is easy to miss across seven cells; the cell itself carrying
      // a quiet inward edge is what makes a week readable at a glance, and the
      // dots then say what kind and how many. A calendar's events are dots and
      // never lift a cell (2026-09-29).
      data-has={day.own > 0 ? true : undefined}
      data-outside={outside ? true : undefined}
      disabled={closed?.(day.iso) ?? false}
      aria-pressed={day.iso === selected}
      // The dots are the fast read and never the only one.
      aria-label={dayLabel(day)}
      onClick={() => onPick(day.iso)}
    >
      <span className={styles.railDow}>{day.dow}</span>
      <span className={styles.railDom}>{day.dom}</span>
      <span className={styles.railDots} aria-hidden="true">
        {day.dots.map((dot, index) => (
          <span
            key={index}
            className={styles.railDot}
            data-dot
            data-done={dot.done || dot.kind === "calendar" ? true : undefined}
            style={{ color: DOT[dot.kind] ?? DOT["other"] }}
          />
        ))}
        {day.count > day.dots.length ? <span className={styles.railMore}>+{day.count - day.dots.length}</span> : null}
      </span>
    </button>
  );

  const week = (row: RailRow) => (
    <div key={row.key} className={styles.railWeek}>
      {row.days.map((day) => cell(day, !grid.inMonth(day.iso)))}
    </div>
  );

  return (
    <>
      <div className={styles.railMonth}>
        <button type="button" className={styles.railStep} aria-label="Previous month" disabled={first} onClick={() => onStep(-1)}>
          <Icon name="chevron-left" size={16} />
        </button>

        {/* **The arrows are the ends and everything else is between them.**
            Today is always drawn rather than only when you have wandered:
            appearing and disappearing would shift the month name beside it,
            and on this month it still takes the day back to today. */}
        <span className={styles.railMiddle}>
          {heading ? (
            <h1 className={styles.railMonthName}>{name}</h1>
          ) : (
            <span className={styles.railMonthName}>{name}</span>
          )}
          <button type="button" className={styles.railToday} onClick={onToday}>
            Today
          </button>
        </span>

        <button type="button" className={styles.railStep} aria-label="Next month" disabled={last} onClick={() => onStep(1)}>
          <Icon name="chevron-right" size={16} />
        </button>
      </div>

      {/* Keyed by the month so it remounts and the animation runs. Without the
          key the same element is rewritten in place and nothing moves. */}
      <div key={grid.key} className={styles.railSlide} data-went={went}>
        {grid.weeks.map(week)}
      </div>
    </>
  );
}
