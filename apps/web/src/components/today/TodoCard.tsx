"use client";

// 027 To do and If you have time: the thread page's own rows in one card.
//
// To do: late first, on Today only, oldest first with 023's late chip, and
// past three the rest fold into one row that opens them in place; then the
// rows with a time, by the hour, each with a clock chip carrying it; then the
// rest due that day with no date chip, and past a hundred a count of the
// rest, which the read does not carry. Every row
// carries its thread pill and its labels on the marks line.
//
// If you have time: up to three of offload's picks, each with + Today at the
// trailing edge.

import { useState } from "react";
import { timeIn, whenOf } from "@offload/widgets";
import { Icon } from "../Icon";
import { ContentRowView } from "../panes/ContentRowView";
import type { AgendaRow } from "../../lib/today";
import type { TodayRows } from "./useTodayRows";
import pane from "../../app/(shell)/shell.module.css";
import styles from "../../app/(shell)/today.module.css";

const LATE_SHOWN = 3;

function Row({ row, rows, chip, trail }: { row: AgendaRow; rows: TodayRows; chip?: React.ReactNode; trail?: React.ReactNode }) {
  return (
    <ContentRowView
      row={row}
      lead={rows.lead(row)}
      meta={null}
      handlers={rows.handlers}
      thread={{ id: row.threadId, name: row.threadName }}
      chip={chip}
      trail={trail}
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
  restMore,
  rows,
  zone,
}: {
  late: AgendaRow[];
  lateMore: number;
  timed: AgendaRow[];
  rest: AgendaRow[];
  restMore: number;
  rows: TodayRows;
  zone: string | null;
}) {
  const [lateOpen, setLateOpen] = useState(false);
  const count = late.length + lateMore + timed.length + rest.length + restMore;
  if (late.length + timed.length + rest.length === 0) return null;

  const lateShown = lateOpen ? late : late.slice(0, LATE_SHOWN);
  const lateFolded = late.length - lateShown.length;

  return (
    <section className={styles.daySection}>
      <h3 className={styles.head}>
        To do <em className={styles.headCount}>{count}</em>
      </h3>
      <div className={styles.rows}>
        {lateShown.map((row) => (
          <Row key={row.id} row={row} rows={rows} />
        ))}
        {lateFolded > 0 ? (
          <button type="button" className={styles.fold} onClick={() => setLateOpen(true)}>
            {lateFolded} more late
          </button>
        ) : null}
        {lateOpen && lateMore > 0 ? <p className={styles.foldNote}>{lateMore} more before these</p> : null}
        {timed.map((row) => (
          <Row key={row.id} row={row} rows={rows} chip={<HourChip row={row} zone={zone} />} />
        ))}
        {rest.map((row) => (
          <Row key={row.id} row={row} rows={rows} chip={null} />
        ))}
        {/* The read stops at a hundred and counts the rest; they are on the
            thread pages, and the count says how many. */}
        {restMore > 0 ? <p className={styles.foldNote}>{restMore} more</p> : null}
      </div>
    </section>
  );
}

export function Picks({ picks, rows }: { picks: AgendaRow[]; rows: TodayRows }) {
  if (picks.length === 0) return null;
  return (
    <section className={styles.daySection}>
      <h3 className={styles.head}>
        If you have time <span className={styles.headHint}>picked by offload</span>
      </h3>
      <div className={styles.rows}>
        {picks.map((row) => (
          <Row
            key={row.id}
            row={row}
            rows={rows}
            chip={null}
            trail={
              <button type="button" className={styles.take} aria-label={`Add ${row.title} to today`} onClick={() => rows.take(row)}>
                <span className={styles.takePill}>
                  <Icon name="plus" size={13} />
                  Today
                </span>
              </button>
            }
          />
        ))}
      </div>
    </section>
  );
}
