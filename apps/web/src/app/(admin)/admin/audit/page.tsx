"use client";

// Audit. Every staff write, newest first.
//
// 034, section F. There is no mock for this page; it is built from the kit's
// table and pane head. One row per write: when, who, what as a plain phrase,
// on whom or on which setting, and old to new where something has a before
// and an after. Thirty days, fifty at a time.
//
// The log names accounts by id. Names come from the accounts as they are
// now, so a live account is a link to its page and one that has gone is its
// id as plain text.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../../../../components/Icon";
import styles from "../../admin.module.css";
import { Diff, Empty, Failed, Lines, Loading, PaneHead, Row, Table, moment, useAdminRead, type Col } from "../../ui";
import { settingLabel } from "../limits/labels";
import { kindLabel, settingValue, shortId } from "./labels";

type Who = { id: string; name?: string | null; email?: string };
type Target = { id: string; name: string | null; email: string; deleted: false } | { id: string; deleted: true };

interface Entry {
  id: string;
  at: string;
  kind: string;
  staff: Who;
  target: Target | null;
  settingKey: string | null;
  old: unknown;
  new: unknown;
  jobId: string | null;
}

interface Page {
  rows: Entry[];
  nextCursor: string | null;
}

interface Facets {
  staff: Who[];
  kinds: string[];
}

const COLS: Col[] = [{ label: "When", w: 110 }, { label: "Who", w: 190 }, { label: "What", w: 200 }, { label: "On", w: 210 }, { label: "Change" }];

const gone = (id: string) => `deleted account ${shortId(id)}`;
const whoName = (who: Who) => (who.email === undefined ? gone(who.id) : (who.name ?? who.email));

/** Who it was done to, or which setting. */
function On({ entry }: { entry: Entry }) {
  const { target } = entry;
  if (target && !target.deleted) {
    return (
      <Link href={`/admin/people/${target.id}`} className={styles.textLink}>
        {target.name ?? target.email}
      </Link>
    );
  }
  if (target) return <span className={styles.quiet}>{gone(target.id)}</span>;
  if (entry.settingKey) return <>{settingLabel(entry.settingKey)}</>;
  return null;
}

/** Old to new, for what has a before and an after. */
function Change({ entry }: { entry: Entry }) {
  if (entry.settingKey) {
    // An override names its person in the column before, so the setting is
    // named here. A setting change already named it.
    const label = entry.target ? settingLabel(entry.settingKey) : "Value";
    return <Diff changes={[{ label, from: settingValue(entry.settingKey, entry.old), to: settingValue(entry.settingKey, entry.new) }]} />;
  }
  if (entry.kind === "staff.role_changed") return <Diff changes={[{ label: "Role", from: String(entry.old), to: String(entry.new) }]} />;
  if (entry.kind === "staff.added" && typeof entry.new === "string") return <span className={styles.quiet}>as {entry.new}</span>;
  if (entry.kind === "staff.removed" && typeof entry.old === "string") return <span className={styles.quiet}>was {entry.old}</span>;
  return null;
}

export default function AuditPage() {
  const [staff, setStaff] = useState("");
  const [kind, setKind] = useState("");
  const [typed, setTyped] = useState("");
  const [person, setPerson] = useState("");

  // Typing an address is one request when it stops, not one per letter.
  useEffect(() => {
    const timer = setTimeout(() => setPerson(typed.trim()), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  const params = new URLSearchParams();
  if (staff) params.set("staff", staff);
  if (kind) params.set("kind", kind);
  if (person) params.set("person", person);
  const filters = params.toString();
  const filtered = filters !== "";

  const facets = useAdminRead<Facets>("/audit/facets");
  const first = useAdminRead<Page>(`/audit${filtered ? `?${filters}` : ""}`);

  // The pages after the first, each read by the cursor the one before gave.
  const [extra, setExtra] = useState<Entry[]>([]);
  const [after, setAfter] = useState<string | null | undefined>(undefined);
  const [want, setWant] = useState<string | null>(null);
  const more = useAdminRead<Page>(want ? `/audit?${filters}${filtered ? "&" : ""}cursor=${encodeURIComponent(want)}` : null);
  const taken = useRef<Page | null>(null);

  useEffect(() => {
    if (!more.data || more.data === taken.current) return;
    taken.current = more.data;
    // A page that arrives after the question changed belongs to nothing.
    if (!want) return;
    setExtra((rows) => [...rows, ...more.data!.rows]);
    setAfter(more.data.nextCursor);
    setWant(null);
  }, [more.data, want]);

  // A different question, or a fresh read of the same one, starts from the top.
  useEffect(() => {
    setExtra([]);
    setAfter(undefined);
    setWant(null);
  }, [filters, first.data]);

  const rows = first.data ? [...first.data.rows, ...extra] : [];
  const next = after === undefined ? (first.data?.nextCursor ?? null) : after;
  const refresh = () => {
    first.reload();
    facets.reload();
  };

  return (
    <>
      <PaneHead
        title="Audit"
        sub="Every staff write, newest first · the last 30 days"
        asOf={first.asOf}
        onRefresh={refresh}
        tools={
          <>
            {facets.data ? (
              <>
                <select className={styles.select} aria-label="Staff member" value={staff} onChange={(event) => setStaff(event.target.value)}>
                  <option value="">Everyone</option>
                  {facets.data.staff.map((who) => (
                    <option key={who.id} value={who.id}>
                      {whoName(who)}
                    </option>
                  ))}
                </select>
                <select className={styles.select} aria-label="Kind" value={kind} onChange={(event) => setKind(event.target.value)}>
                  <option value="">Every kind</option>
                  {facets.data.kinds.map((one) => (
                    <option key={one} value={one}>
                      {kindLabel(one)}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <label className={styles.search}>
              <Icon name="search" size={15} />
              <input
                className={styles.searchInput}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="Person, by address or id"
                aria-label="Person, by address or id"
              />
            </label>
          </>
        }
      />

      {/* A section that failed says so in its own place and the rest stays. */}
      {facets.state === "failed" && !facets.data ? <Failed what="the filters" onRetry={facets.reload} /> : null}

      {first.state === "failed" ? (
        <Failed what="the audit log" onRetry={first.reload} />
      ) : !first.data || first.state === "loading" ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>{filtered ? "Nothing matches that." : "Nothing recorded yet."}</Empty>
      ) : (
        <>
          <Table cols={COLS}>
            {rows.map((entry, index) => (
              <Row
                key={entry.id}
                cols={COLS}
                last={index === rows.length - 1}
                cells={[
                  <span key="when" className={styles.quiet}>
                    {moment(entry.at)}
                  </span>,
                  entry.staff.email === undefined ? (
                    <span key="who" className={styles.quiet}>
                      {gone(entry.staff.id)}
                    </span>
                  ) : (
                    <Lines key="who" main={entry.staff.name ?? entry.staff.email} sub={entry.staff.name ? entry.staff.email : undefined} />
                  ),
                  kindLabel(entry.kind),
                  <On key="on" entry={entry} />,
                  <Change key="change" entry={entry} />,
                ]}
              />
            ))}
          </Table>

          {more.state === "failed" && want ? <Failed what="more" onRetry={more.reload} /> : null}

          {next ? (
            <div className={styles.more}>
              <button type="button" className={styles.ghost} onClick={() => setWant(next)} disabled={want !== null && more.state !== "failed"}>
                Load more
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
