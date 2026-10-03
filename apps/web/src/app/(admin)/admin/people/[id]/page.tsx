"use client";

// A person: one account, for troubleshooting, with nothing they wrote on it.
//
// No kit draws this page. It is built from the kit's vocabulary (`../../ui`)
// in the order 034 section 3 gives: who they are, today against each cap,
// their limits, cost and activity per day, what they have, what happened and
// what refused them. Counts, kinds, times, costs and codes. No name of a
// thread, a file or a calendar, no second address, and nothing about where a
// session came from.
//
// Which actions are drawn is the server's answer (`can`): a guarded action is
// not drawn. Delete is owner only, with the address typed back and a day in
// which it can be cancelled. Once the account is gone this page is its head,
// the day it went and its audit entries, and nothing else (034 section G).

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import styles from "../../../admin.module.css";
import {
  Back,
  Confirm,
  Empty,
  Failed,
  Field,
  Loading,
  PaneHead,
  Plot,
  RangePicker,
  Row,
  Section,
  Stat,
  Stats,
  StatusPill,
  Table,
  adminWrite,
  count,
  day,
  dollars,
  moment,
  outOfBounds,
  useAdminRead,
  useRange,
  useSay,
  type Col,
} from "../../../ui";
import { kindLabel } from "../../audit/labels";
import { capLabel } from "../../limits/labels";
import { Choice } from "../choice";
import { DELETE_BODY, goes } from "../deleting";
import { usePaged } from "../paged";
import { refusedLine } from "../refused";

interface Who {
  id: string;
  name: string;
}

interface Cap {
  key: string;
  used: number;
  limit: number;
  reached: boolean;
}

interface Limit {
  key: string;
  kind: "int" | "micros";
  global: number;
  override: number | null;
  min: number;
  max: number;
  setBy: Who | null;
  setAt: string | null;
}

interface Person {
  id: string;
  name: string | null;
  email: string;
  state: "active" | "disabled";
  joined: string;
  firstSignedInAt: string;
  lastActive: string | null;
  disabledAt: string | null;
  deleteAfter: string | null;
  providers: string[];
  country: string | null;
  timeZone: string | null;
  consentVersion: string | null;
  invitedBy: Who | null;
  can: { disable: boolean; enable: boolean; limits: boolean; delete: boolean; cancelDelete: boolean };
  today: { caps: Cap[]; refused: { cap: string; scope: "account" | "platform" } | null };
  limits: Limit[];
  has: {
    threadsAlone: number;
    threadsShared: number;
    dumped: number;
    notes: number;
    connections: number;
    files: number;
    fileBytes: number;
    calendars: number;
    calendarSync: "ok" | "failed" | null;
    devices: { ios: number; android: number };
    sessions: number;
    sessionLastUsed: string | null;
  };
}

interface Usage {
  days: Array<{ day: string; costMicros: number; turns: number; photos: number; voiceNotes: number; mail: number }>;
}

interface Job {
  id: string;
  kind: string;
  state: string;
  attempts: number;
  at: string;
  durationMs: number | null;
  errorCode: string | null;
  /** From the ledger rows that name the job. Null when it called no model. */
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costMicros: number | null;
  canRetry: boolean;
}

interface Hit {
  cap: string;
  scope: "account" | "platform";
  day: string;
  count: number;
  lastAt: string;
}

const MB = 1024 * 1024;
const megabytes = (bytes: number) => `${count(Math.round(bytes / MB))} MB`;
const minutes = (ms: number) => `${count(Math.round(ms / 60_000))} min`;

/** How each cap's value reads, and the unit an owner types an override in.
 *  What a cap is called is Limits' to say (`limits/labels.ts`): one set of
 *  words for a cap wherever the panel names it. */
const UNITS: Record<string, { show: (value: number) => string; unit: number; prefix?: string; suffix?: string }> = {
  "cap.spend_micros": { show: dollars, unit: 1_000_000, prefix: "$" },
  "cap.photo_bytes": { show: megabytes, unit: MB, suffix: "MB" },
  "cap.storage_bytes": { show: megabytes, unit: MB, suffix: "MB" },
  "cap.voice_ms": { show: minutes, unit: 60_000, suffix: "min" },
  "platform.spend_micros": { show: dollars, unit: 1_000_000, prefix: "$" },
};

/** A cap the panel has no name for shows its key, and one with no unit of
 *  its own is a count. */
const capOf = (key: string) => ({ label: capLabel(key), ...(UNITS[key] ?? { show: count, unit: 1 }) });

const PROVIDER: Record<string, string> = { apple: "Apple", google: "Google" };

const LIMIT_COLS: Col[] = [
  { label: "Cap" },
  { label: "Global", w: 110, right: true },
  { label: "Override", w: 110, right: true },
  { label: "Set by", w: 170 },
  { label: "When", w: 80 },
  { label: "", w: 130, right: true },
];

// Eight columns, not ten: the code sits under the kind and the tokens under
// the model, so the kind keeps a width at 1280.
const JOB_COLS: Col[] = [
  { label: "When", w: 120 },
  { label: "Kind" },
  { label: "State", w: 84 },
  { label: "Attempts", w: 70, right: true },
  { label: "Took", w: 64, right: true },
  { label: "Model", w: 190 },
  { label: "Cost", w: 72, right: true },
  { label: "", w: 72, right: true },
];

const HIT_COLS: Col[] = [
  { label: "Day", w: 100 },
  { label: "Cap" },
  { label: "Whose", w: 140 },
  { label: "Times", w: 76, right: true },
];

const SHOWN = [
  { value: "all", label: "Everything" },
  { value: "failed", label: "Failures" },
] as const;

const AUDIT_COLS: Col[] = [{ label: "When", w: 120 }, { label: "Who", w: 220 }, { label: "What" }];

const FULL_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

interface Entry {
  id: string;
  at: string;
  kind: string;
  staff: { id: string; name?: string | null; email?: string };
}

/** What is left of a deleted account: when it went, and what staff did to
 *  it. The entries are the owner's to read; for support the log is not there
 *  and the line stands alone. */
function Deleted({ id, deletedAt }: { id: string; deletedAt: string }) {
  const entries = useAdminRead<{ rows: Entry[] }>(`/audit?person=${id}`, { missing: true });
  return (
    <>
      <PaneHead title="Deleted account" />
      <p className={styles.lineNote}>This account was deleted on {FULL_DAY.format(new Date(deletedAt))}.</p>
      {entries.state === "failed" && !entries.data ? (
        <Failed what="its audit entries" onRetry={entries.reload} />
      ) : entries.data && entries.data.rows.length > 0 ? (
        <Table cols={AUDIT_COLS}>
          {entries.data.rows.map((entry, index) => (
            <Row
              key={entry.id}
              cols={AUDIT_COLS}
              last={index === entries.data!.rows.length - 1}
              cells={[
                <span key="at" className={styles.quiet}>
                  {moment(entry.at)}
                </span>,
                entry.staff.name ?? entry.staff.email ?? "deleted account",
                kindLabel(entry.kind),
              ]}
            />
          ))}
        </Table>
      ) : null}
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{children}</dd>
    </>
  );
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const range = useRange();
  const [shown, setShown] = useState<(typeof SHOWN)[number]["value"]>("all");
  const [asking, setAsking] = useState<"disable" | "sign-out" | "delete" | null>(null);
  const [retrying, setRetrying] = useState<Job | null>(null);
  const [setting, setSetting] = useState<Limit | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast, say } = useSay();

  // A 404 is its own state here: there is nobody to try again for. So is a
  // 410, an account that was deleted. The rest is asked for once there is
  // somebody to ask about, so a page with nobody on it reads nothing more.
  const person = useAdminRead<Person>(`/people/${id}`, { missing: true });
  const here = person.data ? id : null;
  const usage = useAdminRead<Usage>(here && `/people/${here}/usage?range=${range}`);
  const timeline = usePaged<Job>(here && `/people/${here}/timeline${shown === "failed" ? "?failed=1" : ""}`);
  const hits = useAdminRead<{ rows: Hit[] }>(here && `/people/${here}/hits`);

  // Opening this page is recorded, once per staff member, person and day. A
  // write the page makes after it loads, because no read changes anything.
  const loaded = person.data?.id ?? null;
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || recorded.current === loaded) return;
    recorded.current = loaded;
    void adminWrite(`/people/${loaded}/viewed`, "POST").catch(() => null);
  }, [loaded]);

  const reload = () => {
    person.reload();
    usage.reload();
    timeline.reload();
    hits.reload();
  };

  if (!person.data) {
    return (
      <>
        <Back />
        {person.gone ? (
          <Deleted id={id} deletedAt={person.gone.deletedAt} />
        ) : person.state === "missing" ? (
          <Empty>Nobody here.</Empty>
        ) : person.state === "failed" ? (
          <Failed what="this person" onRetry={person.reload} />
        ) : (
          <Loading />
        )}
      </>
    );
  }

  const who = person.data;
  const called = who.name ?? who.email;

  /** One of the row actions. A failed write leaves the page as it was and
   *  says what did not happen. */
  async function act(path: string, done: string, undone: string, body?: unknown) {
    setBusy(true);
    const response = await adminWrite(path, "POST", body).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      say((await refusedLine(path.slice(path.lastIndexOf("/") + 1), response)) ?? `That did not go through. ${undone}`);
      return false;
    }
    say(done);
    return true;
  }

  async function override(limit: Limit, value: number | null) {
    setBusy(true);
    const response = await adminWrite(`/people/${who.id}/limits`, "PATCH", { key: limit.key, value }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      say("That did not go through. The override was not changed");
      return;
    }
    say(value === null ? "Override cleared" : "Override set");
    person.reload();
  }

  async function retry(job: Job) {
    // Health's route. It gives a dead job one more attempt, once, and refuses
    // one for an account that is disabled or over its cap.
    if (await act(`/jobs/${job.id}/retry`, "Retrying", "Nothing was retried")) timeline.reload();
  }

  const used = new Map(who.today.caps.map((cap) => [cap.key, cap]));
  /** A cap's figure for Today: what was used, of what. */
  const of = (key: string) => {
    const cap = used.get(key);
    return cap ? `${capOf(key).show(cap.used)} of ${capOf(key).show(cap.limit)}` : "";
  };
  const reached = (...keys: string[]) => (keys.some((key) => used.get(key)?.reached) ? ("attention" as const) : undefined);
  const usedOf = (key: string) => {
    const cap = used.get(key);
    return cap ? capOf(key).show(cap.used) : "";
  };
  const limitOf = (key: string) => {
    const cap = used.get(key);
    return cap ? `of ${capOf(key).show(cap.limit)}` : "";
  };

  const settingCap = setting ? capOf(setting.key) : null;
  const typedValue = settingCap ? Math.round(Number(typed) * settingCap.unit) : 0;
  const typedOk =
    setting !== null && settingCap !== null && typed.trim() !== "" && !outOfBounds(typed, setting.min / settingCap.unit, setting.max / settingCap.unit);

  const days = usage.data?.days ?? [];
  const series = (pick: (one: Usage["days"][number]) => number) => days.map((one) => ({ label: day(one.day), value: pick(one) }));
  const plots = usage.state === "failed" && !usage.data ? <Failed what="the plots" onRetry={usage.reload} /> : null;

  const has = who.has;
  const devices = has.devices.ios + has.devices.android;

  return (
    <>
      <Back />
      <PaneHead
        title={called}
        sub={who.name ? who.email : undefined}
        asOf={person.asOf}
        onRefresh={reload}
        tools={
          <>
            <StatusPill value={who.state} />
            <RangePicker />
          </>
        }
      />

      <div className={styles.actions} data-section="actions">
        <button type="button" className={styles.small} onClick={() => setAsking("sign-out")} disabled={busy}>
          Sign out everywhere
        </button>
        {who.can.disable ? (
          <button type="button" className={styles.ghost} onClick={() => setAsking("disable")} disabled={busy}>
            Disable
          </button>
        ) : null}
        {who.can.enable ? (
          <button
            type="button"
            className={styles.small}
            disabled={busy}
            onClick={() => void act(`/people/${who.id}/enable`, `${called} is active again`, "Nobody was enabled").then((ok) => ok && person.reload())}
          >
            Enable
          </button>
        ) : null}
        {who.can.delete ? (
          <button type="button" className={styles.danger} onClick={() => setAsking("delete")} disabled={busy}>
            Delete
          </button>
        ) : null}
        {who.can.cancelDelete ? (
          <button
            type="button"
            className={styles.small}
            disabled={busy}
            onClick={() =>
              void act(`/people/${who.id}/delete/cancel`, `Deletion cancelled. ${called} stays disabled`, "Nothing was cancelled").then((ok) => ok && person.reload())
            }
          >
            Cancel deletion
          </button>
        ) : null}
      </div>

      <Section>Who</Section>
      <div data-section="who">
        <dl className={styles.facts}>
          <Fact label="Name">{who.name ?? "Not set"}</Fact>
          <Fact label="Address">{who.email}</Fact>
          <Fact label="State">{who.deleteAfter ? goes(who.deleteAfter) : who.disabledAt ? `Disabled since ${day(who.disabledAt)}` : who.state === "active" ? "Active" : "Disabled"}</Fact>
          <Fact label="Joined">{day(who.joined)}</Fact>
          {who.invitedBy ? <Fact label="Invited by">{who.invitedBy.name}</Fact> : null}
          <Fact label="First signed in">{day(who.firstSignedInAt)}</Fact>
          <Fact label="Last active">{who.lastActive ? moment(who.lastActive) : "Not yet"}</Fact>
          <Fact label="Signs in with">{who.providers.map((provider) => PROVIDER[provider] ?? provider).join(", ") || "Nothing linked"}</Fact>
          <Fact label="Country">{who.country ?? "Not set"}</Fact>
          <Fact label="Time zone">{who.timeZone ?? "Not set"}</Fact>
          <Fact label="Consent">{who.consentVersion ?? "Not given"}</Fact>
        </dl>
      </div>

      <Section note="the last 24 hours, rolling">Today</Section>
      {who.today.refused ? (
        <p className={styles.lineNote} data-tone="attention">
          {who.today.refused.scope === "platform"
            ? "The platform's cap is refusing everybody now."
            : `At a limit now: ${capOf(who.today.refused.cap).label.toLowerCase()}.`}
        </p>
      ) : null}
      <div data-section="today">
        <Stats>
          <Stat label={capLabel("cap.spend_micros")} value={usedOf("cap.spend_micros")} note={limitOf("cap.spend_micros")} tone={reached("cap.spend_micros")} />
          <Stat label={capLabel("cap.turns")} value={usedOf("cap.turns")} note={limitOf("cap.turns")} tone={reached("cap.turns")} />
          <Stat
            label={capLabel("cap.photos")}
            value={usedOf("cap.photos")}
            note={`${limitOf("cap.photos")} · ${of("cap.photo_bytes")}`}
            tone={reached("cap.photos", "cap.photo_bytes")}
          />
          <Stat
            label={capLabel("cap.voice_notes")}
            value={usedOf("cap.voice_notes")}
            note={`${limitOf("cap.voice_notes")} · ${of("cap.voice_ms")}`}
            tone={reached("cap.voice_notes", "cap.voice_ms")}
          />
          <Stat
            label="Mail in"
            value={usedOf("cap.mail_day")}
            note={`${limitOf("cap.mail_day")} · ${of("cap.mail_hour")} this hour`}
            tone={reached("cap.mail_day", "cap.mail_hour")}
          />
        </Stats>
      </div>

      <Section note="per person, in any 24 hours">Limits</Section>
      <div data-section="limits">
        <Table cols={LIMIT_COLS}>
          {who.limits.map((limit, index) => (
            <Row
              key={limit.key}
              cols={LIMIT_COLS}
              last={index === who.limits.length - 1}
              cells={[
                capOf(limit.key).label,
                capOf(limit.key).show(limit.global),
                limit.override === null ? null : <b key="own">{capOf(limit.key).show(limit.override)}</b>,
                <span key="by" className={styles.quiet}>
                  {limit.setBy?.name}
                </span>,
                <span key="when" className={styles.quiet}>
                  {limit.setAt ? day(limit.setAt) : null}
                </span>,
                who.can.limits ? (
                  <span key="actions" className={styles.rowActions}>
                    {limit.override !== null ? (
                      <button type="button" className={styles.ghost} onClick={() => void override(limit, null)} disabled={busy}>
                        Clear
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={styles.small}
                      disabled={busy}
                      onClick={() => {
                        setTyped("");
                        setSetting(limit);
                      }}
                    >
                      Set
                    </button>
                  </span>
                ) : null,
              ]}
            />
          ))}
        </Table>
      </div>

      <Section note="UTC days">Cost per day</Section>
      {plots ?? (usage.data ? <Plot label="Cost per day" points={series((one) => one.costMicros)} format={dollars} /> : null)}

      <Section note="UTC days">Activity per day</Section>
      {plots ??
        (usage.data ? (
          <div className={styles.plots}>
            <Plot
              label="Turns per day"
              caption="Turns"
              points={series((one) => one.turns)}
              format={count}
              startsAt={range === "90d" ? "Turns are kept for 30 days." : undefined}
            />
            <Plot label="Photos per day" caption="Photos" points={series((one) => one.photos)} format={count} />
            <Plot label="Voice notes per day" caption="Voice notes" points={series((one) => one.voiceNotes)} format={count} />
            <Plot label="Mail in per day" caption="Mail in" points={series((one) => one.mail)} format={count} />
          </div>
        ) : null)}

      <Section note="counts only">What they have</Section>
      <div data-section="has">
        <Stats>
          <Stat
            label="Threads"
            value={count(has.threadsAlone + has.threadsShared)}
            note={`${count(has.threadsAlone)} alone, ${count(has.threadsShared)} shared`}
          />
          <Stat label="Dumped" value={count(has.dumped)} />
          <Stat label="Notes" value={count(has.notes)} />
          <Stat label="Connections" value={count(has.connections)} />
        </Stats>
        <Stats>
          <Stat label="Files" value={count(has.files)} note={megabytes(has.fileBytes)} />
          {/* 036. Everything kept against its cap, here rather than under
              Today: it is not a day's figure. */}
          <Stat
            label={capLabel("cap.storage_bytes")}
            value={usedOf("cap.storage_bytes")}
            // Files counts every file kept; this is what the cap counts,
            // which leaves out what they left in threads they are not in.
            note={`${limitOf("cap.storage_bytes")}, less what they left in threads`}
            tone={reached("cap.storage_bytes")}
          />
          <Stat
            label="Calendars"
            value={count(has.calendars)}
            note={has.calendarSync === "failed" ? "last sync failed" : has.calendarSync === "ok" ? "last sync worked" : undefined}
            tone={has.calendarSync === "failed" ? "attention" : undefined}
          />
          <Stat label="Devices" value={count(devices)} note={devices ? `${has.devices.ios} iOS, ${has.devices.android} Android` : undefined} />
          <Stat label="Sessions" value={count(has.sessions)} note={has.sessionLastUsed ? `last used ${moment(has.sessionLastUsed)}` : undefined} />
        </Stats>
      </div>

      <Section note="the last 30 days, which is how long jobs are kept">What happened</Section>
      <div data-section="happened">
        {timeline.state === "failed" && !timeline.data ? (
          <Failed what="what happened" onRetry={timeline.reload} />
        ) : timeline.data ? (
          <>
            <div className={styles.tableTools}>
              <Choice label="Show" options={SHOWN} value={shown} onChange={setShown} />
            </div>
            <Table cols={JOB_COLS}>
              {timeline.rows.map((job, index) => (
                <Row
                  key={job.id}
                  cols={JOB_COLS}
                  last={index === timeline.rows.length - 1}
                  cells={[
                    <span key="at" className={styles.quiet}>
                      {moment(job.at)}
                    </span>,
                    <span key="kind">
                      {job.kind}
                      {job.errorCode ? <span className={styles.note}>{job.errorCode}</span> : null}
                    </span>,
                    <StatusPill key="state" value={job.state} />,
                    job.attempts,
                    job.durationMs === null ? null : `${(job.durationMs / 1000).toFixed(1)}s`,
                    <span key="model" className={styles.quiet}>
                      {job.model}
                      {job.tokensIn === null || job.tokensOut === null ? null : (
                        <span className={styles.note}>{`${count(job.tokensIn)} in, ${count(job.tokensOut)} out`}</span>
                      )}
                    </span>,
                    job.costMicros === null ? null : dollars(job.costMicros),
                    job.canRetry ? (
                      <button key="retry" type="button" className={styles.small} onClick={() => setRetrying(job)} disabled={busy}>
                        Retry
                      </button>
                    ) : null,
                  ]}
                />
              ))}
            </Table>
            {timeline.rows.length === 0 ? (
              <Empty>{shown === "failed" ? "Nothing of theirs has failed in 30 days." : "Nothing has run for them in 30 days."}</Empty>
            ) : null}
            {timeline.state === "failed" ? <Failed what="what happened" onRetry={timeline.reload} /> : null}
            {timeline.loadMore ? (
              <div className={styles.more}>
                <button type="button" className={styles.ghost} onClick={timeline.loadMore}>
                  Load more
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <Section note="each time a cap refused them, for 30 days">Limit hits</Section>
      <div data-section="hits">
        {hits.state === "failed" && !hits.data ? (
          <Failed what="the limit hits" onRetry={hits.reload} />
        ) : hits.data && hits.data.rows.length === 0 ? (
          <Empty>No cap has refused them in 30 days.</Empty>
        ) : hits.data ? (
          <Table cols={HIT_COLS}>
            {hits.data.rows.map((hit, index) => (
              <Row
                key={`${hit.day} ${hit.cap} ${hit.scope}`}
                cols={HIT_COLS}
                last={index === hits.data!.rows.length - 1}
                cells={[day(hit.day), capOf(hit.cap).label, hit.scope === "platform" ? "the platform's" : "theirs", count(hit.count)]}
              />
            ))}
          </Table>
        ) : null}
      </div>

      {asking === "disable" ? (
        <Confirm
          title={`Disable ${called}?`}
          body="They are signed out everywhere and cannot sign in again until you enable them. Nothing is deleted."
          confirmLabel="Disable"
          busy={busy}
          onConfirm={() => void act(`/people/${who.id}/disable`, `${called} is disabled`, "Nobody was disabled").then((ok) => ok && person.reload())}
          onClose={() => setAsking(null)}
        />
      ) : null}

      {asking === "sign-out" ? (
        <Confirm
          title={`Sign ${called} out everywhere?`}
          body="Every session of theirs ends now. The account stays active and they can sign in again."
          confirmLabel="Sign out"
          busy={busy}
          onConfirm={() => void act(`/people/${who.id}/sign-out`, "Signed out everywhere", "Nobody was signed out").then((ok) => ok && person.reload())}
          onClose={() => setAsking(null)}
        />
      ) : null}

      {asking === "delete" ? (
        <Confirm
          danger
          title={`Delete ${called}?`}
          body={DELETE_BODY}
          confirmWord={who.email}
          confirmLabel="Delete account"
          busy={busy}
          onConfirm={() =>
            void act(`/people/${who.id}/delete`, `${called} will be deleted in 24 hours`, "Nobody was deleted", { email: who.email }).then(
              (ok) => ok && person.reload(),
            )
          }
          onClose={() => setAsking(null)}
        />
      ) : null}

      {/* One click would be one more email or push to a real person. */}
      {retrying ? (
        <Confirm
          title="Retry this job?"
          body={`${retrying.kind}, died ${moment(retrying.at)}. It gets one more attempt, and may send again what it sends.`}
          confirmLabel="Retry"
          busy={busy}
          onConfirm={() => void retry(retrying)}
          onClose={() => setRetrying(null)}
        />
      ) : null}

      {setting && settingCap ? (
        <Confirm
          title={`${settingCap.label} for ${called}`}
          body="Their own value, in place of the global one, until it is cleared."
          confirmLabel="Set"
          ready={typedOk}
          busy={busy}
          onConfirm={() => void override(setting, typedValue)}
          onClose={() => setSetting(null)}
        >
          <Field
            label="Override"
            value={typed}
            onChange={setTyped}
            prefix={settingCap.prefix}
            suffix={settingCap.suffix}
            min={setting.min / settingCap.unit}
            max={setting.max / settingCap.unit}
            hint={`The global value is ${settingCap.show(setting.global)}.`}
            width="100%"
          />
        </Confirm>
      ) : null}

      {toast}
    </>
  );
}
