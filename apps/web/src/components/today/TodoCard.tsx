"use client";

// 027 To do: the thread page's own rows in one card.
//
// To do: late first, on Today only, oldest first with 023's late chip, and
// past three the rest fold into one row that opens them in place; then the
// rows with a time, by the hour, each with a clock chip carrying it; then the
// rest due that day with no date chip, and past a hundred a count of the
// rest, which the read does not carry. Every row
// carries its thread pill and its labels on the marks line.

import { useState } from "react";
import { timeIn, whenOf } from "@offload/widgets";
import { Icon } from "../Icon";
import { ContentRowView } from "../panes/ContentRowView";
import type { AgendaRow } from "../../lib/today";
import type { TodayRows } from "./useTodayRows";
import pane from "../../app/(shell)/shell.module.css";
import styles from "../../app/(shell)/today.module.css";

const LATE_SHOWN = 3;

/** The thread page's own row with its thread's pill, as To do draws it.
 *  042's Reminders draws the same. */
export function TodayRow({ row, rows, chip }: { row: AgendaRow; rows: TodayRows; chip?: React.ReactNode }) {
  return (
    <ContentRowView
      row={row}
      lead={rows.lead(row)}
      meta={null}
      handlers={rows.handlers}
      // 028. A row not in a thread draws no pill.
      thread={row.threadName === null ? undefined : { id: row.threadId, name: row.threadName, icon: row.threadIcon ?? "lasso", hue: row.threadHue ?? 1 }}
      chip={chip}
    />
  );
}

/** The hour a timed row carries, in the account's clock. */
function HourChip({ row, zone }: { row: AgendaRow; zone: string | null }) {
  const at = whenOf(row);
  if (!at) return null;
  return (
    <span className={`${pane.chip} ${styles.hourChip}`}>
      <Icon name="clock" size={12} />
      {timeIn(new Date(at), zone, "en-GB")}
    </span>
  );
}

export function TodoCard({
  late,
  lateMore,
  timed,
  rest,
  notDrawn,
  rows,
  zone,
}: {
  late: AgendaRow[];
  lateMore: number;
  timed: AgendaRow[];
  rest: AgendaRow[];
  /** Rows of the day past the read's caps, timed and the rest. */
  notDrawn: number;
  rows: TodayRows;
  zone: string | null;
}) {
  const [lateOpen, setLateOpen] = useState(false);
  const count = late.length + lateMore + timed.length + rest.length + notDrawn;
  if (late.length + timed.length + rest.length === 0) return null;

  const lateShown = lateOpen ? late : late.slice(0, LATE_SHOWN);
  // The fold counts the late rows the read left out too, as the phones do.
  const lateFolded = lateOpen ? 0 : late.length - lateShown.length + lateMore;

  return (
    <section className={styles.daySection}>
      <h3 className={styles.head}>
        To do <em className={styles.headCount}>{count}</em>
      </h3>
      <div className={styles.rows}>
        {lateShown.map((row) => (
          <TodayRow key={row.id} row={row} rows={rows} />
        ))}
        {lateFolded > 0 ? (
          <button type="button" className={styles.fold} onClick={() => setLateOpen(true)}>
            {lateFolded} more late
          </button>
        ) : null}
        {timed.map((row) => (
          <TodayRow key={row.id} row={row} rows={rows} chip={<HourChip row={row} zone={zone} />} />
        ))}
        {rest.map((row) => (
          <TodayRow key={row.id} row={row} rows={rows} chip={null} />
        ))}
        {/* The read stops at a hundred and counts the rest; they are on the
            thread pages, and the count says how many. */}
        {notDrawn > 0 ? <p className={styles.foldNote}>and {notDrawn} more</p> : null}
      </div>
    </section>
  );
}
