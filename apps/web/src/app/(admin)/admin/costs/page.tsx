"use client";

// Costs, from ui_kits/admin_web/AdminApp.jsx (`CostsPage`).
//
// The kit's page: the four stats, the daily bars, where the money goes and
// the heaviest accounts. 034 adds the same split by model and by vendor,
// trends, usage, and a range. Money is dollars from the ledger, and the sub
// line says what the ledger is: every call it records, not hosting.
//
// Every figure is read from `/v1/admin/costs/*`. The page carries no number
// of its own and no colour: the one state that needs somebody, a day the
// platform cap was reached, is a tone the plot draws.

import { useState } from "react";
import styles from "../../admin.module.css";
import { RealCosts } from "./RealCosts";
import {
  API,
  Empty,
  Failed,
  Lines,
  Loading,
  PaneHead,
  Plot,
  RANGES,
  RangePicker,
  Row,
  RowLink,
  Section,
  ShareBar,
  Stat,
  Stats,
  Table,
  count,
  day,
  dollars,
  moment,
  useAdminRead,
  useRange,
  useSay,
  type Col,
  type Point,
} from "../../ui";

interface Summary {
  monthStart: string;
  monthMicros: number;
  lastMonthMicros: number;
  accounts: number;
  perAccountMicros: number;
  tooEarly: boolean;
  onPaceMicros: number | null;
  /** Null when no budget is set on Limits. */
  budgetMicros: number | null;
  /** Null when the platform cap is off. */
  platformCapMicros: number | null;
}

type Unit = "hour" | "day";

interface Daily {
  unit: Unit;
  totalMicros: number;
  totalCalls: number;
  points: Array<{ at: string; micros: number; calls: number; capReached: boolean }>;
}

interface Split {
  totalMicros: number;
  totalCalls: number;
  /** A vendor nothing writes a ledger row for is not recorded, which is not zero. */
  rows: Array<{ key: string; name: string; recorded: boolean; micros: number | null; calls: number | null }>;
}

interface TrendPoint {
  at: string;
  micros: number;
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

interface Series {
  key: string;
  name: string;
  points: TrendPoint[];
}

interface Trends {
  unit: Unit;
  total: Series;
  series: Series[];
}

interface Usage {
  unit: Unit;
  /** Where turns start, when the range reaches past what is kept. */
  turnsFrom: string | null;
  points: Array<{ at: string; accounts: number; turns: number; photos: number; voiceNotes: number; mailIn: number }>;
}

interface Heaviest {
  rows: Array<{ id: string; name: string | null; email: string; micros: number }>;
}

const SPLIT_COLS = (first: string): Col[] => [{ label: first }, { label: "Calls", w: 90, right: true }, { label: "Spend", w: 100, right: true }, { label: "Share", w: 180 }];
const HEAVY_COLS: Col[] = [{ label: "Person" }, { label: "Spend", w: 100, right: true }, { label: "Share of the heaviest", w: 180 }];

/** What a trend draws, one row of small multiples each. */
const METRICS: ReadonlyArray<{ label: string; of: (point: TrendPoint) => number; format: (value: number) => string }> = [
  { label: "Spend", of: (point) => point.micros, format: dollars },
  { label: "Calls", of: (point) => point.calls, format: count },
  { label: "Input tokens", of: (point) => point.input, format: count },
  { label: "Output tokens", of: (point) => point.output, format: count },
  { label: "Cache read tokens", of: (point) => point.cacheRead, format: count },
  { label: "Cache write tokens", of: (point) => point.cacheWrite, format: count },
];

const USAGE: ReadonlyArray<{ label: string; of: (point: Usage["points"][number]) => number }> = [
  { label: "Accounts active", of: (point) => point.accounts },
  { label: "Turns", of: (point) => point.turns },
  { label: "Photos", of: (point) => point.photos },
  { label: "Voice notes", of: (point) => point.voiceNotes },
  { label: "Mail in", of: (point) => point.mailIn },
];

const TREND_SPLITS = [
  { value: "job", label: "Job" },
  { value: "model", label: "Model" },
] as const;

const MONTH_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/** The month so far, as the kit writes it: "1 to 25 August". */
function monthLabel(at: Date): string {
  const today = MONTH_DAY.format(at);
  return at.getUTCDate() === 1 ? today : `1 to ${today}`;
}

/** A bucket's name: a UTC day, or an hour in the reader's own clock. */
const labelOf = (unit: Unit, at: string) => (unit === "hour" ? moment(at) : day(at));

/** One split of the range's spend: by job, by model or by vendor. A job is
 *  named for what it does, with its kind under the name. */
function SplitTable({ first, split, kinds }: { first: string; split: Split; kinds?: boolean }) {
  if (split.rows.length === 0) return <Empty>Nothing was spent in this range.</Empty>;
  const cols = SPLIT_COLS(first);
  const most = Math.max(...split.rows.map((row) => row.micros ?? 0));
  return (
    <Table cols={cols}>
      {split.rows.map((row, index) => (
        <Row
          key={row.key}
          cols={cols}
          last={index === split.rows.length - 1}
          cells={
            row.recorded && row.micros !== null && row.calls !== null
              ? [
                  <Lines key="name" main={row.name} sub={kinds && row.name !== row.key ? row.key : undefined} />,
                  <span key="calls" className={styles.quiet}>
                    {count(row.calls)}
                  </span>,
                  dollars(row.micros),
                  <ShareBar key="share" value={row.micros} total={most} />,
                ]
              : [
                  <Lines key="name" main={row.name} />,
                  <span key="calls" className={styles.quiet}>
                    not recorded
                  </span>,
                  null,
                  null,
                ]
          }
        />
      ))}
    </Table>
  );
}

// The range lives in the address. The boundary that reading it needs is the
// shell's (`layout.tsx`), one for every page.
export default function CostsPage() {
  const range = useRange();
  const [trendDim, setTrendDim] = useState<"job" | "model">("job");
  const [exporting, setExporting] = useState(false);
  const { toast, say } = useSay();

  const summary = useAdminRead<Summary>("/costs/summary");
  const daily = useAdminRead<Daily>(`/costs/daily?range=${range}`);
  const byJob = useAdminRead<Split>(`/costs/by?dim=job&range=${range}`);
  const byModel = useAdminRead<Split>(`/costs/by?dim=model&range=${range}`);
  const byVendor = useAdminRead<Split>(`/costs/by?dim=vendor&range=${range}`);
  const trends = useAdminRead<Trends>(`/costs/trends?dim=${trendDim}&range=${range}`);
  const usage = useAdminRead<Usage>(`/costs/usage?range=${range}`);
  const heaviest = useAdminRead<Heaviest>(`/costs/heaviest?range=${range}`);
  const reads = [summary, daily, byJob, byModel, byVendor, trends, usage, heaviest];

  const reloadAll = () => {
    for (const read of reads) read.reload();
  };

  // The file, not a link: the API is another origin and the session is a
  // cookie, so the browser has to be told to send it.
  async function exportCsv() {
    setExporting(true);
    const response = await fetch(`${API}/v1/admin/costs/export.csv?range=${range}`, { credentials: "include" }).catch(() => null);
    setExporting(false);
    if (!response?.ok) {
      say("That did not go through. Nothing was exported.");
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `offload-costs-${range}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const loading = reads.some((read) => read.state === "loading");
  const ready = !loading && summary.state === "ready" && summary.data !== null;
  const s = summary.data;
  const rangeLabel = `last ${RANGES.find((one) => one.value === range)!.label}`;
  const over = s !== null && s.budgetMicros !== null && s.onPaceMicros !== null && s.onPaceMicros > s.budgetMicros;

  return (
    <>
      <PaneHead
        title="Costs"
        sub={`${ready && summary.asOf ? `${monthLabel(summary.asOf)} · ` : ""}everything the ledger records per call, not hosting`}
        asOf={ready ? summary.asOf : null}
        onRefresh={reloadAll}
        tools={
          <>
            <RangePicker />
            <button type="button" className={styles.small} disabled={exporting} onClick={() => void exportCsv()}>
              Export CSV
            </button>
          </>
        }
      />

      {loading ? (
        <Loading />
      ) : !ready || !s ? (
        <Failed what="costs" onRetry={reloadAll} />
      ) : (
        <>
          {/* 034 section 4.1. The bill, above the ledger's figures. It makes
              its own read and says its own failure. */}
          <RealCosts />

          <Stats>
            <Stat label="Spent this month" value={dollars(s.monthMicros)} note={s.budgetMicros === null ? undefined : `budget ${dollars(s.budgetMicros)}`} />
            {s.tooEarly || s.onPaceMicros === null ? (
              <Stat label="On pace for" value="Too early to say" />
            ) : (
              <Stat
                label="On pace for"
                value={dollars(s.onPaceMicros)}
                tone={over ? "attention" : undefined}
                note={
                  s.budgetMicros === null
                    ? undefined
                    : over
                      ? `over budget by ${dollars(s.onPaceMicros - s.budgetMicros)}`
                      : "inside budget"
                }
              />
            )}
            <Stat label="Per account" value={dollars(s.perAccountMicros)} note={`all ${count(s.accounts)} accounts, not just active`} />
            <Stat label="Last month" value={dollars(s.lastMonthMicros)} />
          </Stats>

          {daily.state === "failed" || !daily.data ? (
            <>
              <Section>Daily spend</Section>
              <Failed what="daily spend" onRetry={daily.reload} />
            </>
          ) : (
            <>
              <Section note={`${rangeLabel}, ${daily.data.unit === "hour" ? "by the hour" : "UTC days"} · ${dollars(daily.data.totalMicros)}`}>
                {daily.data.unit === "hour" ? "Spend by hour" : "Daily spend"}
              </Section>
              <Plot
                label={daily.data.unit === "hour" ? "Spend by hour" : "Daily spend"}
                format={dollars}
                points={daily.data.points.map<Point>((point) => ({
                  label: labelOf(daily.data!.unit, point.at),
                  value: point.micros,
                  tone: point.capReached ? "attention" : undefined,
                }))}
                caption={
                  s.platformCapMicros === null
                    ? "The platform cap is off"
                    : `Marked days reached the platform cap of ${dollars(s.platformCapMicros)} in any 24 hours`
                }
              />
            </>
          )}

          <Section note={`${rangeLabel}, by the job being paid for`}>Where it goes</Section>
          {byJob.state === "failed" || !byJob.data ? (
            <Failed what="spend by job" onRetry={byJob.reload} />
          ) : (
            <SplitTable first="What it pays for" split={byJob.data} kinds />
          )}

          <Section note={rangeLabel}>By model</Section>
          {byModel.state === "failed" || !byModel.data ? (
            <Failed what="spend by model" onRetry={byModel.reload} />
          ) : (
            <SplitTable first="Model" split={byModel.data} />
          )}

          <Section note={`${rangeLabel}, from the ledger`}>By vendor</Section>
          {byVendor.state === "failed" || !byVendor.data ? (
            <Failed what="spend by vendor" onRetry={byVendor.reload} />
          ) : (
            <SplitTable first="Vendor" split={byVendor.data} />
          )}

          <Section note={`${rangeLabel}, one scale per figure`}>Trends</Section>
          <div className={styles.costsSplit}>
            <span className={styles.seg} role="radiogroup" aria-label="Split trends by">
              {TREND_SPLITS.map((split) => (
                <button
                  key={split.value}
                  type="button"
                  role="radio"
                  aria-checked={split.value === trendDim}
                  className={styles.segOption}
                  onClick={() => setTrendDim(split.value)}
                >
                  {split.label}
                </button>
              ))}
            </span>
          </div>
          {trends.state === "failed" || !trends.data ? (
            <Failed what="trends" onRetry={trends.reload} />
          ) : (
            METRICS.map((metric) => {
              const all = [trends.data!.total, ...trends.data!.series];
              // One scale across the row, so a small multiple can be compared
              // with its neighbour.
              const top = Math.max(...all.flatMap((series) => series.points.map(metric.of)));
              return (
                <div key={metric.label}>
                  <h3 className={styles.costsMetric}>{metric.label}</h3>
                  <div className={styles.costsGrid}>
                    {all.map((series) => (
                      <div key={series.key} className={styles.costsCell}>
                        <div className={styles.costsKey}>{series.name}</div>
                        <Plot
                          label={`${metric.label}, ${series.name}`}
                          format={metric.format}
                          max={top}
                          points={series.points.map<Point>((point) => ({ label: labelOf(trends.data!.unit, point.at), value: metric.of(point) }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}

          <Section note={`${rangeLabel}, each on its own scale`}>Usage</Section>
          {usage.state === "failed" || !usage.data ? (
            <Failed what="usage" onRetry={usage.reload} />
          ) : (
            <div className={styles.costsGrid}>
              {USAGE.map((figure) => (
                <div key={figure.label} className={styles.costsCell}>
                  <div className={styles.costsKey}>{figure.label}</div>
                  <Plot
                    label={figure.label}
                    format={count}
                    points={usage.data!.points.map<Point>((point) => ({ label: labelOf(usage.data!.unit, point.at), value: figure.of(point) }))}
                    startsAt={figure.label === "Turns" && usage.data!.turnsFrom ? `Turns start on ${day(usage.data!.turnsFrom)}.` : undefined}
                  />
                </div>
              ))}
            </div>
          )}

          <Section note={rangeLabel}>Heaviest accounts</Section>
          {heaviest.state === "failed" || !heaviest.data ? (
            <Failed what="the heaviest accounts" onRetry={heaviest.reload} />
          ) : heaviest.data.rows.length === 0 ? (
            <Empty>Nobody spent anything in this range.</Empty>
          ) : (
            <Table cols={HEAVY_COLS}>
              {heaviest.data.rows.map((row, index) => (
                <RowLink
                  key={row.id}
                  cols={HEAVY_COLS}
                  last={index === heaviest.data!.rows.length - 1}
                  href={`/admin/people/${row.id}`}
                  label={row.name ?? row.email}
                  cells={[
                    <Lines key="who" main={row.name ?? row.email} sub={row.name ? row.email : undefined} />,
                    dollars(row.micros),
                    <ShareBar key="share" value={row.micros} total={heaviest.data!.rows[0]!.micros} />,
                  ]}
                />
              ))}
            </Table>
          )}
        </>
      )}
      {toast}
    </>
  );
}
