"use client";

// Health, Calls: what the model was asked, per job, and each company offload
// calls. Volume and latency live here; what the calls cost lives on Costs.

import { useState } from "react";
import styles from "../../admin.module.css";
import { Empty, Failed, Lines, Loading, Notes, Plot, Row, Section, Table, count, useAdminRead, useRange, type Col } from "../../ui";
import { Head } from "./head";
import { RANGE_WORDS, VENDOR_NAMES, bucket, jobName, millis } from "./words";

interface Calls {
  kinds: Array<{
    kind: string;
    calls: number;
    failures: number;
    p50: number;
    p95: number;
    points: Array<{ at: string; calls: number; failures: number; p50: number | null; p95: number | null }>;
  }>;
}

interface Vendors {
  vendors: Array<{ vendor: string; recorded: boolean; calls: number | null; failures: number | null }>;
}

const CALL_COLS: Col[] = [
  { label: "Job" },
  { label: "Calls", w: 80, right: true },
  { label: "Failures", w: 80, right: true },
  { label: "Median", w: 90, right: true },
  { label: "95th", w: 90, right: true },
  { label: "", w: 70, right: true },
];
const VENDOR_COLS: Col[] = [{ label: "Company" }, { label: "Calls", w: 130, right: true }, { label: "Failures", w: 100, right: true }];

const VENDOR_NOTES = [
  "The model and transcription are counted from the ledger. Their failures are read from the job table, which keeps 30 days.",
  "Search and reading links are counted from the lookups, one row a call.",
  "Embeddings, maps, the calendar, mail, push and file storage are counted from the hourly history of the jobs that call them, so the hour in progress is not in yet.",
  "Not recorded means offload has written nothing about that company. It is not a zero.",
] as const;

export function CallsView() {
  const range = useRange();
  const [chosen, setChosen] = useState<string | null>(null);
  const calls = useAdminRead<Calls>(`/health/calls?range=${range}`);
  const vendors = useAdminRead<Vendors>(`/health/vendors?range=${range}`);
  const reads = [calls, vendors];
  const head = <Head asOf={calls.asOf ?? vendors.asOf} onRefresh={() => reads.forEach((read) => read.reload())} />;

  if (reads.some((read) => read.state === "loading" && !read.data)) {
    return (
      <>
        {head}
        <Loading />
      </>
    );
  }

  const unit = range === "24h" ? "hour" : "day";
  // The busiest job unless one was picked, or the one picked has gone.
  const plotted = calls.data?.kinds.find((one) => one.kind === chosen) ?? calls.data?.kinds[0];

  return (
    <>
      {head}

      <Section note="per job, from the ledger">Model calls</Section>
      {!calls.data ? (
        <Failed what="the model calls" onRetry={calls.reload} />
      ) : calls.data.kinds.length === 0 ? (
        <Empty>No model calls in {RANGE_WORDS[range]}.</Empty>
      ) : (
        <>
          <Table cols={CALL_COLS}>
            {calls.data.kinds.map((one, index, all) => (
              <Row
                key={one.kind}
                cols={CALL_COLS}
                last={index === all.length - 1}
                cells={[
                  <Lines key="job" main={jobName(one.kind)} sub={one.kind} />,
                  count(one.calls),
                  count(one.failures),
                  millis(one.p50),
                  millis(one.p95),
                  <button key="plot" type="button" className={styles.small} aria-pressed={one.kind === plotted?.kind} onClick={() => setChosen(one.kind)}>
                    Plot
                  </button>,
                ]}
              />
            ))}
          </Table>
          {plotted ? (
            <div className={styles.healthPlots}>
              <Plot
                label={`Median latency per ${unit}, ${jobName(plotted.kind)}`}
                kind="line"
                points={plotted.points.map((point) => ({ label: bucket(range, point.at), value: point.p50 ?? 0 }))}
                format={millis}
                caption={`${jobName(plotted.kind)}: median latency`}
              />
              <Plot
                label={`95th percentile latency per ${unit}, ${jobName(plotted.kind)}`}
                kind="line"
                points={plotted.points.map((point) => ({ label: bucket(range, point.at), value: point.p95 ?? 0 }))}
                format={millis}
                caption={`${jobName(plotted.kind)}: 95th percentile latency`}
              />
            </div>
          ) : null}
        </>
      )}

      <Section note={`calls and failures over ${RANGE_WORDS[range]}, from what offload already records`}>Vendors</Section>
      {vendors.data ? (
        <>
          <Table cols={VENDOR_COLS}>
            {vendors.data.vendors.map((one, index, all) => (
              <Row
                key={one.vendor}
                cols={VENDOR_COLS}
                last={index === all.length - 1}
                cells={[
                  VENDOR_NAMES[one.vendor] ?? one.vendor,
                  one.recorded && one.calls !== null ? count(one.calls) : <span className={styles.quiet}>not recorded</span>,
                  one.recorded && one.failures !== null ? count(one.failures) : "",
                ]}
              />
            ))}
          </Table>
          <Notes items={VENDOR_NOTES} />
        </>
      ) : (
        <Failed what="the vendors" onRetry={vendors.reload} />
      )}
    </>
  );
}
