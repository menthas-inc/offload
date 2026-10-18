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
// owner): a birthday dismissed a month out comes back a week out, so its line
// says when, with Undo, in the reminder's place (2026-10-18): inside the Today
// card, which stays while its lines run, or in a later card's own place. Which
// entries show, and which were dismissed here, is the pane's, so an emptied
// section takes no band.

import Link from "next/link";
import { useRef } from "react";
import { countdownLabel, dismissedLine, dismissLabel, MEMORY_PARAM, reminderDayLine, reminderLine, reminderTimeLine, type ReminderLine } from "@offload/widgets";
import { Icon } from "../Icon";
import { useToast } from "../shell/Toast";
import { InPlace } from "../shell/InPlace";
import { Returned } from "../shell/UndoLine";
import { useUndoEntries } from "../../lib/undo";
import { perform, type Writes } from "../../lib/optimistic";
import { dismissReminder, undismissReminder, type ReminderEntry } from "../../lib/today";
import styles from "../../app/(shell)/today.module.css";

const LOOSE_HREF = "/threads/loose";

/** One line of the column, built in widgets as the phones build it. */
type Line = ReminderLine & { href: string | null };

function lineOf(entry: ReminderEntry, zone: string | null): Line {
  const line = reminderLine(entry, zone);
  const { opens } = line;
  const href = !opens ? null : "memory" in opens ? `/memories?${MEMORY_PARAM}=${opens.memory}` : opens.threadName === null ? LOOSE_HREF : `/threads/${opens.threadId}`;
  return { ...line, href };
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
  // What has been drawn on the day, so the Today card stays for a line whose
  // reminder was its last.
  const seenToday = useRef(new Set<string>());
  const seen = useRef(new Set<string>());
  const undos = useUndoEntries();
  const lines = entries.map((entry) => lineOf(entry, zone));
  for (const line of lines) seen.current.add(line.key);
  // The last reminder dismissed keeps the section while its line runs.
  if (lines.length === 0 && ![...undos.keys()].some((key) => seen.current.has(key))) return null;
  const onDay = lines.filter((line) => line.day === today);
  const later = lines.filter((line) => line.day !== today);
  for (const line of onDay) seenToday.current.add(line.key);
  const todayLine = [...undos.keys()].some((key) => seenToday.current.has(key));

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
        place: { id: line.key, icon: "bell", form: "slot" },
      },
      toast,
      writes,
    );
  }

  // The shared card's day line is the day's, never one thing's "By".
  const when = (day: string, by: boolean, shared: boolean) => (
    <span className={styles.remWhen} data-soon={shared || undefined}>
      <span data-countdown>{countdownLabel(day, today)}</span>
      <span className={styles.remDay}>{reminderDayLine(day, shared ? false : by)}</span>
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
        {onDay.length > 0 || todayLine ? (
          <div className={`${styles.remCard} ${styles.remShared}`} data-reminder-card>
            <div className={styles.remSharedWhen}>{when(today, false, true)}</div>
            <div className={styles.remRows}>
              <InPlace items={onDay} idOf={(line) => line.key} radius="0">
                {(line, undo) => (
                  <>
                    <Returned id={line.key}>
                      <div className={styles.remRow} data-reminder>
                        {body(line)}
                      </div>
                    </Returned>
                    {undo}
                  </>
                )}
              </InPlace>
            </div>
          </div>
        ) : null}
        {/* A later card's line takes the card's place and its corner. */}
        <InPlace items={later} idOf={(line) => line.key} radius="var(--radius-md)">
          {(line, undo) => (
            <>
              <Returned id={line.key}>
                <div className={`${styles.remCard} ${styles.remRow}`} data-reminder-card data-reminder>
                  {when(line.day, line.by, false)}
                  {body(line)}
                </div>
              </Returned>
              {undo}
            </>
          )}
        </InPlace>
      </div>
    </section>
  );
}
