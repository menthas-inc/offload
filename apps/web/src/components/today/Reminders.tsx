"use client";

// 042 Reminders, on Today: what offload is reminding you about, nearest
// first, from the moment a thing's first reminder was due to the end of its
// day. Today only, under Your day by default, and empty it draws nothing.
//
// A row is the thread page's row, as To do draws it, with its thread's pill;
// a row with no date of its own (a task reminded against the thing it is for)
// carries the day it is reminded against, "By Friday", with the bell when
// offload will remind about it, as the phones draw it. A note is its name,
// its day and its thread, opening the thread, or Not in a thread in the
// default one; a memory is its name, its day and Memories, opening it there.
// Past twenty, "and N more" counts the rest.

import Link from "next/link";
import { bellOn, MEMORY_PARAM, remindDayLabel, whenOf } from "@offload/widgets";
import { Icon } from "../Icon";
import { ThreadPill } from "../shell/ThreadPill";
import { TodayRow } from "./TodoCard";
import { remindersInOrder, type ReminderOther, type RemindersRead } from "../../lib/today";
import type { TodayRows } from "./useTodayRows";
import pane from "../../app/(shell)/shell.module.css";
import labelStyles from "../labels/labels.module.css";
import styles from "../../app/(shell)/today.module.css";

/** The day as a chip, labelled as the date chip is, with its bell. */
function DayChip({ day, today, by, bell = false }: { day: string; today: string; by: boolean; bell?: boolean }) {
  const label = remindDayLabel(day, today, by);
  return (
    <span className={pane.chip} role="img" aria-label={bell ? `${label}, offload will remind you` : label}>
      <Icon name="calendar" size={12} />
      {label}
      {bell ? <Icon name="bell" size={11} /> : null}
    </span>
  );
}

function Other({ other, today }: { other: ReminderOther; today: string }) {
  const memory = other.of === "memory";
  const href = memory ? `/memories?${MEMORY_PARAM}=${other.id}` : other.threadId ? `/threads/${other.threadId}` : null;
  const pill = !memory && other.threadId && other.threadName;
  return (
    <div className={pane.row} data-row>
      <span className={pane.rowIcon}>
        {/* A note's glyph is the note row's, a memory's the Memories tab's. */}
        <Icon name={memory ? "cloudy" : "text-quote"} size={18} />
      </span>
      <span className={pane.rowText}>
        <span className={pane.rowLine}>
          {href ? (
            <Link href={href} className={pane.rowTitle}>
              {other.name}
            </Link>
          ) : (
            <span className={pane.rowTitle}>{other.name}</span>
          )}
          <span className={labelStyles.marks}>
            <DayChip day={other.day} today={today} by={other.by} />
            {pill ? (
              <ThreadPill
                id={other.threadId!}
                name={other.threadName!}
                icon={other.threadIcon ?? "lasso"}
                hue={other.threadHue ?? 1}
                size={24}
              />
            ) : null}
          </span>
        </span>
        {memory ? <span className={pane.rowMeta}>Memories</span> : pill ? null : <span className={pane.rowMeta}>Not in a thread</span>}
      </span>
    </div>
  );
}

export function Reminders({ read, rows, today }: { read: RemindersRead; rows: TodayRows; today: string }) {
  // A row archived or deleted here leaves the list, and the count with it.
  const entries = remindersInOrder({ rows: rows.shown(read.rows), others: read.others });
  if (entries.length === 0) return null;
  const count = entries.length + read.more;

  return (
    <section className={styles.daySection} aria-labelledby="reminders-head">
      <h3 className={styles.head} id="reminders-head">
        Reminders <em className={styles.headCount}>{count}</em>
      </h3>
      <div className={styles.rows}>
        {entries.map((entry) =>
          "row" in entry ? (
            <TodayRow
              key={entry.row.id}
              row={entry.row}
              rows={rows}
              chip={
                whenOf(entry.row) ? undefined : (
                  <DayChip day={entry.row.remindDay} today={today} by={entry.row.remindBy} bell={bellOn(entry.row)} />
                )
              }
            />
          ) : (
            <Other key={`${entry.other.of}:${entry.other.id}`} other={entry.other} today={today} />
          ),
        )}
        {read.more > 0 ? <p className={styles.foldNote}>and {read.more} more</p> : null}
      </div>
    </section>
  );
}
