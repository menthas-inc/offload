"use client";

// What offload really costs (034, section 4.1). The bill, at the top of
// Costs: every company offload pays, this month, each row saying where its
// number came from, the month's total, and twelve months as bars.
//
// Self-contained: it makes its own read and carries its own three states, so
// the Costs page mounts it and passes nothing.

import { Empty, Failed, Notes, Plot, Row, Section, Stat, Stats, StatusPill, Table, clock, dollars, moment, useAdminRead, type Col } from "../../ui";
import styles from "../../admin.module.css";

interface BillingRow {
  vendor: string;
  name: string;
  source: "billed" | "metered" | "fixed";
  micros: number;
  /** The ledger's figure, beside a bill or a typed amount. */
  metered?: number;
  difference?: number;
  readAt?: string;
  final: boolean;
  recorded: boolean;
}

interface BillingMonth {
  /** A UTC month, `YYYY-MM`. */
  month: string;
  final: boolean;
  total: number;
  rows: BillingRow[];
}

const COLS: Col[] = [
  { label: "Company" },
  { label: "Source", w: 100 },
  { label: "This month", w: 120, right: true },
  { label: "Ledger", w: 110, right: true },
  { label: "Difference", w: 110, right: true },
  { label: "Read", w: 130, right: true },
];

const NOTES = [
  "Billed is the company's own figure, read once a day. Metered is the ledger's estimate. Fixed is a subscription, typed on Limits.",
  "A difference is the bill less the ledger. A gap means the ledger is mispricing a call, or something is spending that the ledger never sees.",
  "Not recorded means the company is paid and nothing here says how much.",
] as const;

// Written out: the browser's own short names differ by version.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthName(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ""} ${month.slice(0, 4)}`;
}

/** Signed, in plain characters: over the ledger is a plus. */
function signed(micros: number): string {
  return `${micros > 0 ? "+" : ""}${dollars(micros)}`;
}

export function RealCosts() {
  const { data, state, asOf, reload } = useAdminRead<{ months: BillingMonth[] }>("/billing?months=12");
  const months = data?.months ?? [];
  const now = months[months.length - 1];
  const last = months[months.length - 2];
  const nothing = months.every((month) => month.total === 0 && month.rows.every((row) => !row.recorded));

  return (
    <section>
      <Section
        note={
          asOf ? (
            <>
              As of {clock(asOf)}{" "}
              <button type="button" className={styles.small} onClick={reload}>
                Refresh
              </button>
            </>
          ) : undefined
        }
      >
        What offload really costs
      </Section>

      {state === "loading" && !data ? (
        <p className={styles.srOnly} role="status">
          Loading
        </p>
      ) : null}
      {state === "failed" ? <Failed what="the bills" onRetry={reload} /> : null}

      {!data || !now ? null : nothing ? (
        <Empty>Nothing recorded yet.</Empty>
      ) : (
        <>
          <Stats>
            <Stat label={monthName(now.month)} value={dollars(now.total)} note={now.final ? undefined : "not final"} />
            {last ? <Stat label={monthName(last.month)} value={dollars(last.total)} note={last.final ? undefined : "not final"} /> : null}
          </Stats>

          <Table cols={COLS}>
            {now.rows.map((row, index) => (
              <Row
                key={row.vendor}
                cols={COLS}
                last={index === now.rows.length - 1}
                cells={[
                  <b key="name" className={styles.email}>
                    {row.name}
                  </b>,
                  <StatusPill key="source" value={row.source} />,
                  row.recorded ? dollars(row.micros) : <span key="none" className={styles.quiet}>not recorded</span>,
                  row.source !== "metered" && row.metered !== undefined ? dollars(row.metered) : "",
                  row.difference !== undefined ? signed(row.difference) : "",
                  row.readAt ? <span key="read" className={styles.quiet}>{moment(row.readAt)}</span> : "",
                ]}
              />
            ))}
          </Table>

          <div className={styles.billingPlot}>
            <Plot
              label="What offload cost, by month"
              points={months.map((month) => ({ label: `${monthName(month.month)}${month.final ? "" : ", not final"}`, value: month.total }))}
              format={dollars}
              caption="12 months"
            />
          </div>

          <Notes items={NOTES} />
        </>
      )}
    </section>
  );
}
