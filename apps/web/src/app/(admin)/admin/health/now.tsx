"use client";

// Health, Now: the services, each stretch one was down, the queue, the last
// backup, and any calendar grant left to revoke by hand. When nothing is
// wrong, one line at the top says so.

import styles from "../../admin.module.css";
import { useAdmin } from "../../admin-context";
import { Empty, Failed, Lines, Loading, Plot, Row, Section, Stat, Stats, StatusPill, Table, count, moment, useAdminRead, useRange, type Col } from "../../ui";
import { Head } from "./head";
import { RANGE_WORDS, SERVICE_NAMES, bucket, bytes, duration, millis, percent, startsNote } from "./words";

interface Services {
  services: Array<{
    service: string;
    status: "up" | "late" | "down" | "none";
    uptime: number | null;
    startedAt: string | null;
    commit: string | null;
    reportedBy: "itself" | "core-api";
    migrations: { count: number; latest: string | null } | null;
  }>;
}

interface Incidents {
  incidents: Array<{ service: string; began: string; ended: string | null; seconds: number }>;
}

interface Queue {
  now: { waiting: Array<{ priority: string; count: number }>; oldestSeconds: number | null; running: number };
  points: Array<{ at: string; finished: number; failed: number; dead: number; waitMsSum: number; waitMsP95: number }>;
  historyStarts: string | null;
}

interface Backups {
  last: { finishedAt: string; bytes: number; ok: boolean } | null;
  late: boolean;
}

/** S27. Grants sealed under a vault key no longer held, still live at Google. */
interface Revocations {
  unopenable: Array<{ since: string }>;
}

const SERVICE_COLS: Col[] = [{ label: "Service" }, { label: "Now", w: 150 }, { label: "Uptime", w: 90, right: true }, { label: "Started", w: 130 }, { label: "Commit", w: 90 }];
const INCIDENT_COLS: Col[] = [{ label: "Service" }, { label: "Began", w: 150 }, { label: "Ended", w: 150 }, { label: "How long", w: 110, right: true }];
const BACKUP_COLS: Col[] = [{ label: "Finished" }, { label: "Size", w: 110, right: true }, { label: "Outcome", w: 150 }];
const GRANT_COLS: Col[] = [{ label: "Kept since" }, { label: "Age", w: 110, right: true }];

export function NowView() {
  const range = useRange();
  const { staff } = useAdmin();
  const services = useAdminRead<Services>(`/health/services?range=${range}`);
  const incidents = useAdminRead<Incidents>(`/health/incidents?range=${range}`);
  const queue = useAdminRead<Queue>(`/health/queue?range=${range}`);
  const backups = useAdminRead<Backups>("/health/backups");
  const revocations = useAdminRead<Revocations>("/health/revocations");
  const reads = [services, incidents, queue, backups, revocations];
  const head = <Head asOf={services.asOf ?? queue.asOf} onRefresh={() => reads.forEach((read) => read.reload())} />;

  if (reads.some((read) => read.state === "loading" && !read.data)) {
    return (
      <>
        {head}
        <Loading />
      </>
    );
  }

  // Only said when every read came back and none of them has anything in it.
  const well =
    staff?.wrong === 0 &&
    services.data !== null &&
    incidents.data !== null &&
    backups.data !== null &&
    services.data.services.every((one) => one.status === "up" || one.status === "none") &&
    incidents.data.incidents.every((one) => one.ended !== null) &&
    !backups.data.late &&
    revocations.data?.unopenable.length === 0;

  const unit = range === "24h" ? "hour" : "day";

  return (
    <>
      {head}
      {well ? <p className={styles.healthWell}>All is well.</p> : null}

      <Section note="the web and the database are the Core API's own checks">Services</Section>
      {services.data ? (
        <Table cols={SERVICE_COLS}>
          {services.data.services.map((one, index, all) => (
            <Row
              key={one.service}
              cols={SERVICE_COLS}
              last={index === all.length - 1}
              cells={[
                <Lines
                  key="name"
                  main={SERVICE_NAMES[one.service] ?? one.service}
                  sub={
                    one.migrations
                      ? `${count(one.migrations.count)} migrations${one.migrations.latest ? `, latest ${one.migrations.latest}` : ""}`
                      : one.reportedBy === "core-api"
                        ? "checked by the Core API"
                        : undefined
                  }
                />,
                one.status === "none" ? <StatusPill key="now" value="none" label="no heartbeat yet" /> : <StatusPill key="now" value={one.status} />,
                one.uptime === null ? "" : percent(one.uptime),
                one.startedAt ? moment(one.startedAt) : "",
                one.commit ? one.commit.slice(0, 7) : one.service === "database" ? "" : <span className={styles.quiet}>unknown</span>,
              ]}
            />
          ))}
        </Table>
      ) : (
        <Failed what="the services" onRetry={services.reload} />
      )}

      <Section note="two minutes or more with no heartbeat">Incidents</Section>
      {!incidents.data ? (
        <Failed what="the incidents" onRetry={incidents.reload} />
      ) : incidents.data.incidents.length === 0 ? (
        <Empty>No incidents in {RANGE_WORDS[range]}.</Empty>
      ) : (
        <Table cols={INCIDENT_COLS}>
          {incidents.data.incidents.map((one, index, all) => (
            <Row
              key={`${one.service}-${one.began}`}
              cols={INCIDENT_COLS}
              last={index === all.length - 1}
              cells={[
                SERVICE_NAMES[one.service] ?? one.service,
                moment(one.began),
                one.ended ? moment(one.ended) : <StatusPill value="down" label="still down" />,
                duration(one.seconds),
              ]}
            />
          ))}
        </Table>
      )}

      <Section note={`now, and over ${RANGE_WORDS[range]}`}>Queue</Section>
      {queue.data ? <QueueFigures queue={queue.data} unit={unit} /> : <Failed what="the queue" onRetry={queue.reload} />}

      <Section note={backups.data?.late ? "late: none has finished in 26 hours" : "a nightly run"}>Backups</Section>
      {!backups.data ? (
        <Failed what="the backups" onRetry={backups.reload} />
      ) : backups.data.last === null ? (
        <Empty>No backup has been recorded.</Empty>
      ) : (
        <Table cols={BACKUP_COLS}>
          <Row
            cols={BACKUP_COLS}
            last
            cells={[
              moment(backups.data.last.finishedAt),
              bytes(backups.data.last.bytes),
              <span key="outcome" className={styles.healthActions}>
                <StatusPill value={backups.data.last.ok ? "ok" : "failed"} />
                {backups.data.late ? <StatusPill value="late" /> : null}
              </span>,
            ]}
          />
        </Table>
      )}

      <Section note="sealed under an old vault key, so offload could not revoke them; each goes after seven days">Calendar grants</Section>
      {!revocations.data ? (
        <Failed what="the calendar grants" onRetry={revocations.reload} />
      ) : revocations.data.unopenable.length === 0 ? (
        <Empty>None to revoke by hand.</Empty>
      ) : (
        <Table cols={GRANT_COLS}>
          {revocations.data.unopenable.map((one, index, all) => (
            <Row
              key={`${one.since}-${index}`}
              cols={GRANT_COLS}
              last={index === all.length - 1}
              cells={[moment(one.since), duration((Date.now() - new Date(one.since).getTime()) / 1000)]}
            />
          ))}
        </Table>
      )}
    </>
  );
}

function QueueFigures({ queue, unit }: { queue: Queue; unit: "hour" | "day" }) {
  const range = useRange();
  const waiting = queue.now.waiting.reduce((sum, one) => sum + one.count, 0);
  const byPriority = queue.now.waiting
    .filter((one) => one.count > 0)
    .map((one) => `${count(one.count)} ${one.priority}`)
    .join(" · ");
  const total = (key: "finished" | "failed" | "dead") => queue.points.reduce((sum, point) => sum + point[key], 0);
  const failed = total("failed");
  const dead = total("dead");
  const starts = startsNote(queue.historyStarts, queue.points[0]?.at);

  return (
    <>
      <Stats>
        <Stat
          label="Waiting"
          value={waiting > 0 ? count(waiting) : "None"}
          note={waiting > 0 ? `${byPriority}${queue.now.oldestSeconds === null ? "" : `, oldest due ${duration(queue.now.oldestSeconds)} ago`}` : undefined}
        />
        <Stat label="Running" value={queue.now.running > 0 ? count(queue.now.running) : "None"} />
        <Stat label="Finished" value={count(total("finished"))} note={`in ${RANGE_WORDS[range]}`} />
        <Stat
          label="Failed or died"
          value={count(failed + dead)}
          note={`${count(failed)} failed · ${count(dead)} died`}
          {...(dead > 0 ? { tone: "attention" as const } : {})}
        />
      </Stats>
      <div className={styles.healthPlots}>
        <Plot
          label={`Mean wait per ${unit}`}
          points={queue.points.map((point) => ({ label: bucket(range, point.at), value: point.finished > 0 ? point.waitMsSum / point.finished : 0 }))}
          format={millis}
          caption="mean wait of the jobs that finished, from due to done"
          {...(starts ? { startsAt: starts } : {})}
        />
        <Plot
          label={`95th percentile wait per ${unit}`}
          points={queue.points.map((point) => ({ label: bucket(range, point.at), value: point.waitMsP95 }))}
          format={millis}
          caption="95th percentile wait, the worst hour in each"
        />
      </div>
    </>
  );
}
