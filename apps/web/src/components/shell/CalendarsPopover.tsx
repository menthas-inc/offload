"use client";

// 019. Calendars in this thread: the pane head's third tool and its popover.
//
// **A plain glyph, never a badge or a count.** A dot and a bubble both mean
// attention, and a mark meaning "you configured this" earns a click that
// finds nothing wrong. The accessible name carries the state instead.
//
// **A popover, not a modal**, because it is a scope and not a task, and the
// pane behind it is what the scope is about. It reuses the More menu's shell
// and carries the caption the phones' sheet carries, which the mock's web
// crop drew without. Same rows, same ticks: a tick applies at once, with no
// save and no toast, and un-ticking is its own way back.
//
// It is the third tool on the head, which the design system's pane-head rule
// was amended for: a tool earns a head slot only if it changes what offload
// reads or shows, and a scope you cannot see is a scope you forget.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { CalendarRow } from "../CalendarRow";
import {
  fetchThreadCalendars,
  setThreadCalendar,
  type ThreadCalendars,
} from "../../lib/threads";
import pane from "../../app/(shell)/shell.module.css";
import styles from "../../app/(shell)/calendar.module.css";

const FAILED = "That did not go through. Try again.";

export function calendarsLabel(picked: number, total: number): string {
  return picked === 0 ? "Calendars, none in this thread" : `Calendars, ${picked} of ${total} in this thread`;
}

/** The captions, per the thread's state. */
export function captionFor(
  threadName: string,
  mine: number,
  others: number,
  members: number
): { line: string; shared: string | null } {
  const line =
    mine > 0
      ? `Which of your calendars offload reads when it works on ${threadName}.`
      : others > 0
        ? `offload is not reading any of your calendars for ${threadName}. Tick the ones it should.`
        : `offload is not reading any calendar for ${threadName}. Tick the ones it should.`;
  return { line, shared: members > 1 ? `Everyone in ${threadName} sees what is on them.` : null };
}

export function othersLine(others: Array<{ displayName: string; count: number }>): string | null {
  if (others.length === 0) return null;
  const names =
    others.length === 1
      ? others[0]!.displayName
      : `${others
          .slice(0, -1)
          .map((o) => o.displayName)
          .join(", ")} and ${others[others.length - 1]!.displayName}`;
  const count = others.reduce((sum, o) => sum + o.count, 0);
  return `${names} ${others.length === 1 ? "reads" : "read"} ${count} ${count === 1 ? "calendar" : "calendars"} here.`;
}

export function CalendarsTool({
  threadId,
  threadName,
  members,
  counts,
  open,
  onOpenChange,
  onChanged,
}: {
  threadId: string;
  threadName: string;
  members: number;
  counts: { picked: number; total: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The picks changed; the thread reloads its envelope and its rail. */
  onChanged: () => void;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const [list, setList] = useState<ThreadCalendars | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setList(null);
    setFailed(false);
    // A list that did not come is the failure line, never the loading state:
    // the title alone is reserved for still fetching.
    fetchThreadCalendars(threadId)
      .then((next) => (next ? setList(next) : setFailed(true)))
      .catch(() => setFailed(true));
  }, [open, threadId]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent): void => {
      if (!box.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onOpenChange]);

  async function pick(calendarId: string, picked: boolean) {
    setFailed(false);
    const next = await setThreadCalendar(threadId, calendarId, picked);
    if (!next) return setFailed(true);
    setList(next);
    onChanged();
  }

  const mine = list?.calendars.filter((c) => c.picked).length ?? counts.picked;
  const othersCount = list?.others.reduce((sum, o) => sum + o.count, 0) ?? 0;
  const caption = captionFor(threadName, mine, othersCount, members);

  return (
    <span className={pane.moreWrap} ref={box}>
      <button
        type="button"
        className={pane.tool}
        aria-label={calendarsLabel(counts.picked, counts.total)}
        aria-expanded={open}
        title="Calendars in this thread"
        onClick={() => onOpenChange(!open)}
      >
        <Icon name="calendar" size={16} />
      </button>

      {open ? (
        <span className={styles.popover} role="group" aria-label="Calendars in this thread">
          <h2 className={styles.popoverTitle}>Calendars in this thread</h2>
          {/* While the list loads, the title alone: a popover still fetching
              must never read as a thread with nothing to tick. */}
          {list === null ? (
            failed ? (
              <p className={pane.settingsRowError} role="alert">
                {FAILED}
              </p>
            ) : null
          ) : list.calendars.length === 0 ? (
            <>
              <p className={styles.caption}>offload has no calendars to read yet.</p>
              <Link href="/settings/apps" className={styles.settingsLink}>
                Approve a calendar in Settings
                <span className={styles.settingsLinkChevron}>
                  <Icon name="chevron-right" size={15} />
                </span>
              </Link>
            </>
          ) : (
            <>
              <p className={styles.caption}>{caption.line}</p>
              {caption.shared ? <p className={styles.captionLine}>{caption.shared}</p> : null}
              {failed ? (
                <p className={pane.settingsRowError} role="alert">
                  {FAILED}
                </p>
              ) : null}
              <div role="group" aria-label="Your calendars">
                {list.calendars.map((calendar, index) => (
                  <CalendarRow
                    key={calendar.id}
                    calendar={calendar}
                    picked={calendar.picked}
                    onChange={(next) => void pick(calendar.id, next)}
                    last={index === list.calendars.length - 1}
                  />
                ))}
              </div>
              {othersLine(list.others) ? <p className={styles.others}>{othersLine(list.others)}</p> : null}
            </>
          )}
        </span>
      ) : null}
    </span>
  );
}
