"use client";

// A calendar as a row: the same row in Settings and in a thread's popover.
//
// A checkbox, never a switch: a switch says a capability is on, and the
// capability is the connection one level up. This is a selection among peers.
// The calendar's own colour comes in as a 10px dot inside a hairline ring, as
// recognition and never as the differentiator: four of seven ordinary Google
// colours fail 3:1 on the row's ground, so the name is what tells two apart.

import { Checkbox } from "./Checkbox";
import styles from "../app/(shell)/calendar.module.css";

export interface CalendarRowShape {
  id: string;
  name: string;
  colour: string | null;
  writable: boolean;
  sharedWithYou: boolean;
  primary: boolean;
  note?: string | null;
}

/** The row's note, in this order: the account's address when two rows share a
 *  name, then the two load-bearing ones. A read-only calendar cannot be added
 *  to; a shared one says so without naming anybody, since Google's list
 *  carries no name. */
export function calendarNote(calendar: CalendarRowShape): string | null {
  if (calendar.note) return calendar.note;
  if (calendar.primary) return "Your own calendar";
  if (!calendar.writable) return "Read only";
  if (calendar.sharedWithYou) return "Shared with you";
  return null;
}

export function CalendarRow({
  calendar,
  picked,
  onChange,
  disabled = false,
  last = false,
}: {
  calendar: CalendarRowShape;
  picked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  const note = calendarNote(calendar);
  return (
    <label className={`${styles.row} ${last ? styles.rowLast : ""}`} data-picked={picked || undefined}>
      <Checkbox checked={picked} disabled={disabled} onChange={onChange} />
      <span
        className={styles.dot}
        style={{ background: calendar.colour ?? "var(--border-strong)" }}
        aria-hidden="true"
      />
      <span className={styles.text}>
        <span className={styles.title}>{calendar.name}</span>
        {note ? <span className={styles.note}>{note}</span> : null}
      </span>
    </label>
  );
}
