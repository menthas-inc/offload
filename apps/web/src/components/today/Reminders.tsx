"use client";

// 042 Reminders, on Today: what offload is reminding you about, nearest
// first, from the moment a thing's first reminder was due to the end of its
// day. Today only, under Your day by default, and empty it draws nothing.
//
// Drawn as the kit's column since 2026-10-11 (`TodayReminders.jsx`): the
// countdown leads in a fixed column, everything on the day shares one card
// under a single Today, each later thing is a card of its own, and under the
// name is where it lives, with its time in the day's colour. No tick, no chip,
// no pill: the whole row opens the thing, a row or a note its thread, a
// memory Memories. The x dismisses **this reminder and nothing else** (the
// owner): a birthday dismissed a month out comes back a week out, so the toast
// says when, with Undo. Which entries show, and which were dismissed here, is
// the pane's, so an emptied section takes no band.

import Link from "next/link";
import { countdownLabel, dismissedLine, dismissLabel, MEMORY_PARAM, reminderDayLine, reminderKey as keyOf, reminderTimeLine, timeIn, whenOf, whereOf } from "@offload/widgets";
import { Icon } from "../Icon";
import { useToast } from "../shell/Toast";
import { perform, type Writes } from "../../lib/optimistic";
import { dismissReminder, undismissReminder, type Dismissal, type ReminderEntry } from "../../lib/today";
import styles from "../../app/(shell)/today.module.css";

const LOOSE_HREF = "/threads/loose";

/** One line of the column, whatever it came from. */
interface Line {
  key: string;
  name: string;
  day: string;
  by: boolean;
  time: string | null;
  next: string | null;
  href: string | null;
  where: { icon: string; text: string };
  which: Dismissal;
}

/** The key the pane hides a dismissed entry by: the thing, its day and the
 *  reminder showing, as the server keys a dismissal. */
export function reminderKey(entry: ReminderEntry): string {
  return "row" in entry
    ? keyOf({ of: "content", id: entry.row.id, day: entry.row.remindDay, window: entry.row.window })
    : keyOf({ of: entry.other.of, id: entry.other.id, day: entry.other.day, window: entry.other.window });
}

function lineOf(entry: ReminderEntry, zone: string | null): Line {
  const key = reminderKey(entry);
  if ("row" in entry) {
    const { row } = entry;
    const at = row.allDay ? null : whenOf(row);
    return {
      key,
      name: row.title,
      day: row.remindDay,
      by: row.remindBy,
      time: at ? timeIn(new Date(at), zone, "en-GB") : null,
      next: row.next,
      href: row.threadName === null ? LOOSE_HREF : `/threads/${row.threadId}`,
      where: whereOf({ of: "content", threadName: row.threadName, threadIcon: row.threadIcon }),
      which: { of: "content", id: row.id, day: row.remindDay, window: row.window },
    };
  }
  const { other } = entry;
  const memory = other.of === "memory";
  return {
    key,
    name: other.name,
    day: other.day,
    by: other.by,
    time: other.time,
    next: other.next,
    href: memory ? `/memories?${MEMORY_PARAM}=${other.id}` : other.threadId ? (other.threadName === null ? LOOSE_HREF : `/threads/${other.threadId}`) : null,
    where: whereOf(other),
    which: { of: other.of, id: other.id, day: other.day, window: other.window },
  };
}

export function Reminders({
  entries,
  today,
  zone,
  onGone,
  writes,
}: {
  /** What is showing, nearest first, with what was dismissed here taken out. */
  entries: ReminderEntry[];
  today: string;
  zone: string | null;
  /** Hide or show an entry dismissed here, by its key. */
  onGone: (key: string, gone: boolean) => void;
  writes: Writes;
}) {
  const toast = useToast();
  const lines = entries.map((entry) => lineOf(entry, zone));
  if (lines.length === 0) return null;
  const onDay = lines.filter((line) => line.day === today);
  const later = lines.filter((line) => line.day !== today);

  function dismiss(line: Line): void {
    void perform(
      {
        apply: () => onGone(line.key, true),
        revert: () => onGone(line.key, false),
        write: () => dismissReminder(line.which),
        unwrite: () => undismissReminder(line.which),
        did: dismissedLine(line.next, today),
        failed: "Couldn't dismiss that",
        unfailed: "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  // The shared card's day line is the day's, never one thing's "By".
  const when = (line: Line, shared: boolean) => (
    <span className={styles.remWhen} data-soon={shared || undefined}>
      <span data-countdown>{countdownLabel(line.day, today)}</span>
      <span className={styles.remDay}>{reminderDayLine(line.day, shared ? false : line.by)}</span>
    </span>
  );

  const body = (line: Line) => (
    <>
      <span className={styles.remText}>
        {line.href ? (
          <Link href={line.href} className={styles.remName}>
            {line.name}
          </Link>
        ) : (
          <span className={styles.remName}>{line.name}</span>
        )}
        <span className={styles.remWhere}>
          <span className={styles.remWhereIcon}>
            <Icon name={line.where.icon} size={12} />
          </span>
          {line.where.text}
          {line.time ? <span className={styles.remTime}>{`· ${reminderTimeLine(line.time, line.by)}`}</span> : null}
        </span>
      </span>
      <button type="button" className={styles.remDismiss} aria-label={dismissLabel(line.name)} onClick={() => dismiss(line)}>
        <Icon name="x" size={16} />
      </button>
    </>
  );

  return (
    <section className={styles.daySection} aria-labelledby="reminders-head">
      <h3 className={`${styles.head} ${styles.headBig}`} id="reminders-head" data-big="true">
        Reminders <em className={styles.headCount}>{lines.length}</em>
      </h3>
      <div className={styles.remColumn}>
        {onDay.length > 0 ? (
          <div className={`${styles.remCard} ${styles.remShared}`} data-reminder-card>
            <div className={styles.remSharedWhen}>{when(onDay[0]!, true)}</div>
            <div className={styles.remRows}>
              {onDay.map((line) => (
                <div key={line.key} className={styles.remRow} data-reminder>
                  {body(line)}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {later.map((line) => (
          <div key={line.key} className={`${styles.remCard} ${styles.remRow}`} data-reminder-card data-reminder>
            {when(line, false)}
            {body(line)}
          </div>
        ))}
      </div>
    </section>
  );
}
