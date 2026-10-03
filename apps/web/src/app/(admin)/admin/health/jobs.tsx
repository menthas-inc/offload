"use client";

// Health, Jobs: everything that runs on a schedule, what is stuck, and what
// died. A dead job gets one more attempt from Retry, once, and an owner can
// take it off the list with Dismiss. Both ask first: a retry can send a
// person the same email or push again.

import { Fragment, useState } from "react";
import Link from "next/link";
import styles from "../../admin.module.css";
import { useAdmin } from "../../admin-context";
import { Confirm, Empty, Failed, Lines, Loading, Plot, Row, Section, StatusPill, Table, adminWrite, count, day, moment, useAdminRead, useRange, useSay, type Col } from "../../ui";
import { Head } from "./head";
import { CADENCE, RANGE_WORDS, bucket, duration, jobName, millis, startsNote } from "./words";

interface Scheduled {
  jobs: Array<{
    kind: string;
    does: string;
    cadence: string;
    runner: "api" | "worker";
    perAccount: boolean;
    last: { at: string; outcome: "done" | "failed" | "dead"; durationMs: number | null } | null;
    next: string | null;
    runs: number;
    failures: number;
    late: boolean;
  }>;
}

interface Volume {
  points: Array<{ at: string; runs: number; failures: number }>;
  nights: Array<{ at: string; booked: number; finished: number; failed: number }> | null;
  historyStarts: string | null;
}

interface Person {
  id: string;
  name: string | null;
}

interface Stuck {
  jobs: Array<{ id: string; kind: string; since: string; seconds: number; attempts: number; account: Person | null }>;
}

interface DeadJob {
  id: string;
  kind: string;
  at: string;
  attempts: number;
  errorCode: string | null;
  retried: boolean;
  account: Person | null;
}

interface Dead {
  jobs: DeadJob[];
  nextCursor: string | null;
}

const SCHEDULED_COLS: Col[] = [
  { label: "Job" },
  { label: "Schedule", w: 110 },
  { label: "Last run", w: 170 },
  { label: "Next run", w: 120 },
  { label: "Runs", w: 60, right: true },
  { label: "Failures", w: 70, right: true },
  { label: "", w: 84, right: true },
];
const NIGHT_COLS: Col[] = [{ label: "Night" }, { label: "Booked", w: 90, right: true }, { label: "Finished", w: 90, right: true }, { label: "Failed", w: 90, right: true }];
const STUCK_COLS: Col[] = [{ label: "Job" }, { label: "Running for", w: 120, right: true }, { label: "Since", w: 150 }, { label: "Attempts", w: 80, right: true }, { label: "Person", w: 180 }];
const DEAD_COLS: Col[] = [
  { label: "Job" },
  { label: "Died", w: 140 },
  { label: "Attempts", w: 80, right: true },
  { label: "Error code", w: 170 },
  { label: "Person", w: 160 },
  { label: "", w: 168, right: true },
];

/** The person a job belongs to, as a link to their page. A job that is
 *  nobody's is the system's own. */
function PersonLink({ account }: { account: Person | null }) {
  if (!account) return <span className={styles.quiet}>nobody</span>;
  return (
    <Link href={`/admin/people/${account.id}`} className={styles.healthLink}>
      {account.name ?? "No name"}
    </Link>
  );
}

const REFUSED: Record<string, string> = {
  account_off: "Not retried. That account is disabled",
  at_limit: "Not retried. That account is at its limit",
  already_retried: "Not retried. It has had its one retry",
  not_dead: "Not retried. That job is no longer dead",
};

const DISMISS_REFUSED: Record<string, string> = {
  not_dead: "Not dismissed. That job is no longer dead",
  already_dismissed: "Not dismissed. It was dismissed already",
};

/** The code a 409 carries, when it carries one. */
async function refusalOf(response: Response | null): Promise<string | undefined> {
  if (response?.status !== 409) return undefined;
  return ((await response.json().catch(() => ({}))) as { error?: string }).error;
}

export function JobsView() {
  const range = useRange();
  const { staff, refresh } = useAdmin();
  const { toast, say } = useSay();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [earlier, setEarlier] = useState<DeadJob[]>([]);
  const [dismissing, setDismissing] = useState<DeadJob | null>(null);
  const [retrying, setRetrying] = useState<DeadJob | null>(null);
  const [busy, setBusy] = useState(false);

  const scheduled = useAdminRead<Scheduled>(`/health/scheduled?range=${range}`);
  const stuck = useAdminRead<Stuck>("/health/stuck");
  const dead = useAdminRead<Dead>(`/health/dead${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
  const reads = [scheduled, stuck, dead];

  /** Back to the first page of the dead list, read again. */
  const rereadDead = () => {
    setEarlier([]);
    if (cursor === null) dead.reload();
    else setCursor(null);
  };

  const head = (
    <Head
      asOf={scheduled.asOf ?? dead.asOf}
      onRefresh={() => {
        scheduled.reload();
        stuck.reload();
        rereadDead();
      }}
    />
  );

  if (reads.some((read) => read.state === "loading" && !read.data)) {
    return (
      <>
        {head}
        <Loading />
      </>
    );
  }

  // The pages before this one, then this one. While the next page is on its
  // way the read still holds the last, so a row is only ever drawn once.
  const deadRows = [...earlier, ...(dead.data?.jobs ?? [])].filter((job, index, all) => all.findIndex((one) => one.id === job.id) === index);

  async function retry(job: DeadJob) {
    setBusy(true);
    const response = await adminWrite(`/jobs/${job.id}/retry`, "POST").catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const refusal = await refusalOf(response);
      say((refusal && REFUSED[refusal]) || "That did not go through. The job was not retried");
      return;
    }
    say("Retrying");
    refresh();
    rereadDead();
  }

  async function dismiss(job: DeadJob) {
    setBusy(true);
    const response = await adminWrite(`/jobs/${job.id}/dismiss`, "POST").catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const refusal = await refusalOf(response);
      say((refusal && DISMISS_REFUSED[refusal]) || "That did not go through. The job was not dismissed");
      return;
    }
    say("Dismissed");
    refresh();
    rereadDead();
  }

  const toggle = (kind: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <>
      {head}

      <Section note="everything that runs on a schedule, and not because a person asked">Background jobs</Section>
      {scheduled.data ? (
        <Table cols={SCHEDULED_COLS}>
          {scheduled.data.jobs.map((job, index, all) => (
            <Fragment key={job.kind}>
              <Row
                cols={SCHEDULED_COLS}
                last={index === all.length - 1 && !open.has(job.kind)}
                cells={[
                  <Lines key="job" main={jobName(job.kind)} sub={job.does} />,
                  <Lines key="schedule" main={CADENCE[job.cadence] ?? job.cadence} sub={job.runner === "worker" ? "on the worker" : "on the Core API"} />,
                  job.last ? (
                    <span key="last">
                      {moment(job.last.at)} <StatusPill value={job.last.outcome} label={job.last.outcome === "dead" ? "died" : job.last.outcome} />
                      {job.last.durationMs === null ? null : <span className={styles.note}>took {millis(job.last.durationMs)}</span>}
                    </span>
                  ) : (
                    <span key="last" className={styles.quiet}>
                      not yet
                    </span>
                  ),
                  <span key="next" className={styles.healthActions}>
                    {job.next ? moment(job.next) : <span className={styles.quiet}>nothing booked</span>}
                    {job.late ? <StatusPill value="late" /> : null}
                  </span>,
                  count(job.runs),
                  count(job.failures),
                  <button
                    key="open"
                    type="button"
                    className={styles.small}
                    aria-expanded={open.has(job.kind)}
                    aria-controls={open.has(job.kind) ? `volume-${job.kind}` : undefined}
                    onClick={() => toggle(job.kind)}
                  >
                    {open.has(job.kind) ? "Hide" : "Volume"}
                  </button>,
                ]}
              />
              {open.has(job.kind) ? (
                // A row of the table, with one cell across it, so the table
                // still reads as rows of cells with this open.
                <div id={`volume-${job.kind}`} className={styles.healthExpand} role="row">
                  <div role="cell">
                    <JobVolume kind={job.kind} />
                  </div>
                </div>
              ) : null}
            </Fragment>
          ))}
        </Table>
      ) : (
        <Failed what="the background jobs" onRetry={scheduled.reload} />
      )}

      <Section note="running longer than their kind should take">Stuck</Section>
      {!stuck.data ? (
        <Failed what="the stuck jobs" onRetry={stuck.reload} />
      ) : stuck.data.jobs.length === 0 ? (
        <Empty>No stuck jobs.</Empty>
      ) : (
        <Table cols={STUCK_COLS}>
          {stuck.data.jobs.map((job, index, all) => (
            <Row
              key={job.id}
              cols={STUCK_COLS}
              last={index === all.length - 1}
              cells={[
                <Lines key="job" main={jobName(job.kind)} sub={job.kind} />,
                duration(job.seconds),
                moment(job.since),
                count(job.attempts),
                <PersonLink key="person" account={job.account} />,
              ]}
            />
          ))}
        </Table>
      )}

      <Section note="every job that ran out of attempts">Dead jobs</Section>
      {!dead.data ? (
        <Failed what="the dead jobs" onRetry={dead.reload} />
      ) : deadRows.length === 0 ? (
        <Empty>No dead jobs.</Empty>
      ) : (
        <Table cols={DEAD_COLS}>
          {deadRows.map((job, index) => (
            <Row
              key={job.id}
              cols={DEAD_COLS}
              last={index === deadRows.length - 1}
              cells={[
                <Lines key="job" main={jobName(job.kind)} sub={job.kind} />,
                moment(job.at),
                count(job.attempts),
                job.errorCode ?? "",
                <PersonLink key="person" account={job.account} />,
                <span key="actions" className={styles.healthActions}>
                  {job.retried ? (
                    <span className={styles.quiet}>retried once</span>
                  ) : (
                    <button type="button" className={styles.small} disabled={busy} onClick={() => setRetrying(job)}>
                      Retry
                    </button>
                  )}
                  {staff?.role === "owner" ? (
                    <button type="button" className={styles.ghost} disabled={busy} onClick={() => setDismissing(job)}>
                      Dismiss
                    </button>
                  ) : null}
                </span>,
              ]}
            />
          ))}
        </Table>
      )}
      {dead.data?.nextCursor ? (
        <div className={styles.more}>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => {
              setEarlier(deadRows);
              setCursor(dead.data!.nextCursor);
            }}
          >
            Load more
          </button>
        </div>
      ) : null}

      {/* One click would be one more email or push to a real person. */}
      {retrying ? (
        <Confirm
          title="Retry this job?"
          body={`${jobName(retrying.kind)}, died ${moment(retrying.at)}. It gets one more attempt, and may send again what it sends.`}
          confirmLabel="Retry"
          busy={busy}
          onConfirm={() => void retry(retrying)}
          onClose={() => setRetrying(null)}
        />
      ) : null}

      {dismissing ? (
        <Confirm
          title="Dismiss this job?"
          body={`${jobName(dismissing.kind)}, died ${moment(dismissing.at)}. It leaves this list. Its record is kept for the 30 days every job is, and still shows on the person's page.`}
          confirmLabel="Dismiss"
          busy={busy}
          onConfirm={() => void dismiss(dismissing)}
          onClose={() => setDismissing(null)}
        />
      ) : null}

      {toast}
    </>
  );
}

/** One scheduled job's volume, read when its row is opened. A day with a
 *  failure in it is the one drawn in the attention colour. */
function JobVolume({ kind }: { kind: string }) {
  const range = useRange();
  const volume = useAdminRead<Volume>(`/health/scheduled/${encodeURIComponent(kind)}?range=${range}`);
  if (!volume.data) return volume.state === "failed" ? <Failed what="its volume" onRetry={volume.reload} /> : null;

  const unit = range === "24h" ? "hour" : "day";
  const starts = startsNote(volume.data.historyStarts, volume.data.points[0]?.at);
  const nights = volume.data.nights?.filter((night) => night.booked > 0) ?? null;

  return (
    <div className={styles.healthPlots}>
      <Plot
        label={`Runs per ${unit}, ${jobName(kind)}`}
        points={volume.data.points.map((point) => ({
          label: bucket(range, point.at),
          value: point.runs,
          ...(point.failures > 0 ? { tone: "attention" as const } : {}),
        }))}
        format={count}
        caption={`runs per ${unit}, marked where one failed`}
        {...(starts ? { startsAt: starts } : {})}
      />
      {nights === null ? null : nights.length === 0 ? (
        <Empty>No passes in {RANGE_WORDS[range === "24h" ? "7d" : range]}.</Empty>
      ) : (
        <Table cols={NIGHT_COLS}>
          {nights.map((night, index) => (
            <Row
              key={night.at}
              cols={NIGHT_COLS}
              last={index === nights.length - 1}
              cells={[day(night.at), count(night.booked), count(night.finished), count(night.failed)]}
            />
          ))}
        </Table>
      )}
    </div>
  );
}
