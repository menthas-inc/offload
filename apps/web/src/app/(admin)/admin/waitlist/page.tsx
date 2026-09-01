"use client";

// The waitlist.
//
// Two tabs, because "invited and never signed in" is the state that looks like
// success and is not: someone was let in, the email went out, and nothing
// happened. It gets its own view rather than a column nobody sorts by.
//
// Selection is many-at-once because letting people in weekly is a batch job.
// The action bar appears only when something is selected; a permanently
// disabled button teaches nothing and is always in the way.

import { useCallback, useEffect, useState } from "react";
import styles from "../../admin.module.css";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";
const PAGE = 50;

type Tab = "waiting" | "invited";

interface Row {
  id: string;
  email: string;
  state: "waitlist" | "invited";
  createdAt: string;
  awaitingFirstSignIn: boolean;
}

const joined = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function WaitlistPage() {
  const [tab, setTab] = useState<Tab>("waiting");
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(
    async (which: Tab, after: string | null) => {
      setLoading(true);
      const query = new URLSearchParams({ state: which, limit: String(PAGE) });
      if (after) query.set("cursor", after);

      const response = await fetch(`${API}/v1/admin/waitlist?${query}`, { credentials: "include" });
      if (!response.ok) {
        setLoading(false);
        return;
      }
      const page = (await response.json()) as { rows: Row[]; nextCursor: string | null };
      // Appended on "load more", replaced on a tab change, which is what the
      // null cursor distinguishes.
      setRows((existing) => (after ? [...existing, ...page.rows] : page.rows));
      setCursor(page.nextCursor);
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    setSelected(new Set());
    setNote(null);
    void load(tab, null);
  }, [tab, load]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function invite() {
    setInviting(true);
    const ids = [...selected];
    const response = await fetch(`${API}/v1/admin/waitlist/invite`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    if (!response.ok) {
      setNote("That did not go through. Nobody was invited.");
      setInviting(false);
      return;
    }

    const { results } = (await response.json()) as {
      results: Array<{ status: "invited" | "already-in" | "refused" }>;
    };
    const letIn = results.filter((result) => result.status === "invited").length;
    const already = results.filter((result) => result.status === "already-in").length;

    // Says what happened, including the part that did nothing. Promotion is
    // idempotent, so a row that was already in is not an error, but silently
    // counting it as a success would misreport how many emails went out.
    setNote(
      [
        `${letIn} invited`,
        already ? `${already} already in` : null,
        results.length - letIn - already ? `${results.length - letIn - already} refused` : null,
      ]
        .filter(Boolean)
        .join(", ")
    );

    setSelected(new Set());
    setInviting(false);
    void load(tab, null);
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;

  return (
    <>
      <div className={styles.paneHead}>
        <h1 className={styles.paneTitle}>Waitlist</h1>
        <div className={styles.tabs}>
          {(["waiting", "invited"] as const).map((which) => (
            <button
              key={which}
              type="button"
              className={`${styles.tab} ${tab === which ? styles.tabOn : ""}`}
              onClick={() => setTab(which)}
            >
              {which === "waiting" ? "Waiting" : "Invited"}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.bar}>
        {selected.size > 0 ? (
          <>
            <button
              type="button"
              className={styles.action}
              onClick={() => void invite()}
              disabled={inviting}
            >
              {inviting ? "Letting them in…" : `Invite ${selected.size}`}
            </button>
            <button
              type="button"
              className={styles.quietAction}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
          </>
        ) : null}
        {note ? <span className={styles.count}>{note}</span> : null}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.pick}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                aria-label="Select every row on this page"
              />
            </th>
            <th>Email</th>
            <th>State</th>
            <th className={styles.numeric}>Joined</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={styles.pick}>
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => toggle(row.id)}
                  aria-label={`Select ${row.email}`}
                />
              </td>
              <td>{row.email}</td>
              <td>
                {row.awaitingFirstSignIn ? (
                  <span className={styles.chip}>Invited, never signed in</span>
                ) : (
                  <span className={styles.count}>{row.state === "waitlist" ? "Waiting" : "Invited"}</span>
                )}
              </td>
              <td className={styles.numeric}>{joined.format(new Date(row.createdAt))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && !loading ? (
        <p className={styles.empty}>
          {tab === "waiting" ? "Nobody is waiting." : "Nobody has been invited yet."}
        </p>
      ) : null}

      {cursor ? (
        <div className={styles.more}>
          <button
            type="button"
            className={styles.quietAction}
            onClick={() => void load(tab, cursor)}
            disabled={loading}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </>
  );
}
