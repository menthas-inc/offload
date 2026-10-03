"use client";

// People, from ui_kits/admin_web/AdminApp.jsx (PeoplePage). Every account
// that has signed in at least once.
//
// The kit's page with what 034 changed: money is dollars, a row opens the
// person's page and gains Joined, and the list can be sorted. Everything
// reversible sits on the row and acts without opening it. Which actions a row
// carries is the server's answer (`can`): a guarded action is not drawn.
//
// Delete is owner only and is built with account destruction (034 section G).
// Its place is marked below, in the row's actions and in the notes.

import { useEffect, useState } from "react";
import { Icon } from "../../../../components/Icon";
import styles from "../../admin.module.css";
import {
  Confirm,
  Empty,
  Failed,
  Lines,
  Loading,
  Notes,
  PaneHead,
  RowLink,
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
  useAdminRead,
  useSay,
  type Col,
} from "../../ui";
import { Choice } from "./choice";
import { usePaged } from "./paged";

interface PeopleStats {
  accounts: number;
  activeThisWeek: number;
  disabled: number;
  averageSpendMicros: number;
}

interface Person {
  id: string;
  name: string | null;
  email: string;
  providers: string[];
  threads: number;
  joined: string;
  lastActive: string | null;
  spendMicros: number;
  state: "active" | "disabled";
  can: { disable: boolean; enable: boolean };
}

const FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
] as const;

const SORTS = [
  { value: "joined", label: "Joined" },
  { value: "active", label: "Last active" },
  { value: "spend", label: "Spend" },
] as const;

const PROVIDER: Record<string, string> = { apple: "Apple", google: "Google" };

const COLS: Col[] = [
  { label: "Person" },
  { label: "Signed in with", w: 120 },
  { label: "Threads", w: 76, right: true },
  { label: "Joined", w: 80 },
  { label: "Last active", w: 110, right: true },
  { label: "Spend, 30d", w: 96, right: true },
  { label: "State", w: 92 },
  { label: "", w: 110, right: true },
];

// The kit's notes, without its line about Delete, which is not here yet.
const NOTES = [
  "Disable signs the account out everywhere and refuses new sign-ins. Nothing is deleted and threads shared with other people stay readable for them. Reversible from this row.",
  "While an account is disabled offload does nothing for it in the background: no nightly pass, no digest, no push, no calendar sync, no mail in.",
  "Nothing here emails the person. If they should be told, support writes to them.",
] as const;

export default function PeoplePage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("joined");
  const [query, setQuery] = useState("");
  // What is asked for trails what is typed, so a name is one request at the
  // end and not one per keystroke.
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, say } = useSay();

  useEffect(() => {
    const timer = setTimeout(() => setQ(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const params = new URLSearchParams({ state: filter, sort });
  if (q) params.set("q", q);
  const list = usePaged<Person, { capped: boolean }>(`/people?${params}`);
  const stats = useAdminRead<PeopleStats>("/people/stats");

  const reload = () => {
    stats.reload();
    list.reload();
  };

  const called = (person: Person) => person.name ?? person.email;

  async function disable(person: Person) {
    setBusy(true);
    const response = await adminWrite(`/people/${person.id}/disable`, "POST").catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      say("That did not go through. Nobody was disabled.");
      return;
    }
    say(`${called(person)} is disabled`);
    reload();
  }

  async function enable(person: Person) {
    setBusy(true);
    const response = await adminWrite(`/people/${person.id}/enable`, "POST").catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      say("That did not go through. Nobody was enabled.");
      return;
    }
    say(`${called(person)} is active again`);
    reload();
  }

  const rows = list.rows;

  return (
    <>
      <PaneHead
        title="People"
        sub={stats.data ? `${count(stats.data.accounts)} accounts · ${count(stats.data.disabled)} disabled` : undefined}
        asOf={list.asOf}
        onRefresh={reload}
        tools={
          <>
            <Choice label="State" options={FILTERS} value={filter} onChange={setFilter} />
            <label className={styles.search}>
              <Icon name="search" size={15} />
              <input
                className={styles.searchInput}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or email"
                aria-label="Search name or email"
              />
            </label>
          </>
        }
      />

      {/* A section that failed says so in its own place and the list stays. */}
      {stats.state === "failed" && !stats.data ? (
        <Failed what="the figures" onRetry={stats.reload} />
      ) : stats.data ? (
        <Stats>
          <Stat label="Accounts" value={count(stats.data.accounts)} />
          <Stat
            label="Used it this week"
            value={count(stats.data.activeThisWeek)}
            note={stats.data.accounts > 0 ? `${Math.round((stats.data.activeThisWeek / stats.data.accounts) * 100)}% of accounts` : undefined}
          />
          <Stat label="Disabled" value={count(stats.data.disabled)} />
          <Stat label="Average spend" value={dollars(stats.data.averageSpendMicros)} note="per account, last 30 days" />
        </Stats>
      ) : null}

      {list.state === "failed" && !list.data ? (
        <Failed what="people" onRetry={list.reload} />
      ) : list.state === "loading" ? (
        <Loading />
      ) : (
        <>
          <div className={styles.tableTools}>
            <Choice label="Sort" options={SORTS} value={sort} onChange={setSort} />
            {list.data?.capped ? <span className={styles.quiet}>The top 200. Search to find anybody else.</span> : null}
          </div>

          <Table cols={COLS}>
            {rows.map((person, index) => (
              <RowLink
                key={person.id}
                cols={COLS}
                href={`/admin/people/${person.id}`}
                label={`Open ${called(person)}`}
                last={index === rows.length - 1}
                muted={person.state === "disabled"}
                cells={[
                  <Lines key="who" main={called(person)} sub={person.name ? person.email : undefined} />,
                  <span key="with" className={styles.quiet}>
                    {person.providers.map((provider) => PROVIDER[provider] ?? provider).join(", ")}
                  </span>,
                  count(person.threads),
                  <span key="joined" className={styles.quiet}>
                    {day(person.joined)}
                  </span>,
                  <span key="active" className={styles.quiet}>
                    {person.lastActive ? moment(person.lastActive) : null}
                  </span>,
                  dollars(person.spendMicros),
                  <StatusPill key="state" value={person.state} />,
                  <span key="actions" className={styles.rowActions}>
                    {person.can.disable ? (
                      <button type="button" className={styles.ghost} onClick={() => setAsking(person)} disabled={busy}>
                        Disable
                      </button>
                    ) : null}
                    {person.can.enable ? (
                      <button type="button" className={styles.small} onClick={() => void enable(person)} disabled={busy}>
                        Enable
                      </button>
                    ) : null}
                    {/* 034 section G. The owner-only Delete goes here, after
                        Disable or Enable, with its confirm and its cancel. */}
                  </span>,
                ]}
              />
            ))}
          </Table>

          {rows.length === 0 ? <Empty>{q ? "No account matches that." : "Nobody has signed in yet."}</Empty> : null}

          {/* A next page that failed to load leaves what is on screen there. */}
          {list.state === "failed" ? <Failed what="people" onRetry={list.reload} /> : null}

          {list.loadMore ? (
            <div className={styles.more}>
              <button type="button" className={styles.ghost} onClick={list.loadMore}>
                Load more
              </button>
            </div>
          ) : null}
        </>
      )}

      <Section note="and what they do not">What these do</Section>
      {/* 034 section G. Delete's line goes in these notes when it is built. */}
      <Notes items={NOTES} />

      {asking ? (
        <Confirm
          title={`Disable ${called(asking)}?`}
          body="They are signed out everywhere and cannot sign in again until you enable them. Nothing is deleted."
          confirmLabel="Disable"
          busy={busy}
          onConfirm={() => void disable(asking)}
          onClose={() => setAsking(null)}
        />
      ) : null}

      {toast}
    </>
  );
}
