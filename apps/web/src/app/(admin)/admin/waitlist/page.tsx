"use client";

// The waitlist, from ui_kits/admin_web/AdminApp.jsx.
//
// One table with a state column, not a tab split: everyone who has ever been
// on the list sits together, so "invited and never signed in" is visible beside
// the people still waiting rather than behind a tab nobody opens.
//
// The stats row in the kit is deliberately not built. Everything else is:
// search, the weekly batch button, the source column, the quiet note under an
// address, per-row actions and the notes below the table.

import { useCallback, useEffect, useState } from "react";
import styles from "../../admin.module.css";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";
const PAGE = 50;

/** Shown in the confirmation so the number is not a surprise. The server owns
 *  the real value and ignores anything sent from here; this is copy. */
const BATCH = 25;

interface Row {
  id: string;
  email: string;
  state: "waiting" | "invited" | "accepted" | "disabled";
  joined: string;
  source: "waitlist" | "thread";
  note: string | null;
}

const STATE_LABEL: Record<Row["state"], string> = {
  waiting: "waiting",
  invited: "invited",
  accepted: "signed up",
  disabled: "disabled",
};

const STATE_TONE: Record<Row["state"], string> = {
  waiting: "",
  invited: styles.badgeAttention!,
  accepted: styles.badgeAccent!,
  disabled: "",
};

// What an invite does, and two things it deliberately does not. Straight from
// the kit, minus its claims about single-use links, which this product does
// not have: sign-in is by provider on the invited address.
const NOTES = [
  "Inviting sends the one transactional email and creates the account, its keys and its Miscellaneous thread in a single transaction. They can sign in with Apple or Google on that address as soon as it arrives.",
  "Inviting twice is inviting once. A second invite sends no second email and creates no second thread.",
  "Someone who came from a shared thread is already vouched for by a member, so those usually go in the next batch.",
  "Removing an address from the waitlist is not here on purpose. Support does it from People once the account exists.",
] as const;

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" style={{ color: "var(--text-tertiary)", flex: "none" }}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

export default function WaitlistPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async (search: string, after: string | null) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE) });
    if (search) params.set("q", search);
    if (after) params.set("cursor", after);

    const response = await fetch(`${API}/v1/admin/waitlist?${params}`, { credentials: "include" });
    if (!response.ok) {
      setLoading(false);
      return;
    }
    const page = (await response.json()) as { rows: Row[]; nextCursor: string | null };
    setRows((existing) => (after ? [...existing, ...page.rows] : page.rows));
    setCursor(page.nextCursor);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Debounced, so typing an address is one request at the end rather than
    // one per keystroke against a table of thousands.
    const timer = setTimeout(() => {
      setPicked(new Set());
      void load(query, null);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, load]);

  function say(message: string) {
    setToast(message);
    // Long enough to read, short enough not to sit there. The toast is
    // confirmation, not a status bar.
    setTimeout(() => setToast(null), 4000);
  }

  async function invite(ids: string[]) {
    setBusy(true);
    const response = await fetch(`${API}/v1/admin/waitlist/invite`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setBusy(false);

    if (!response.ok) {
      say("That did not go through. Nobody was invited.");
      return;
    }
    const { results } = (await response.json()) as { results: Array<{ status: string }> };
    const letIn = results.filter((r) => r.status === "invited").length;
    const already = results.length - letIn;
    // Says what happened including the part that did nothing: promotion is
    // idempotent, so an already-invited row sent no second email and counting
    // it as a success would misreport that.
    say(
      letIn === 1 && !already
        ? "Invite sent"
        : `Invited ${letIn}${already ? `, ${already} already in` : ""}`
    );
    setPicked(new Set());
    void load(query, null);
  }

  async function inviteNext() {
    setConfirming(false);
    setBusy(true);
    const response = await fetch(`${API}/v1/admin/waitlist/invite-next`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusy(false);

    if (!response.ok) {
      say("That did not go through. Nobody was invited.");
      return;
    }
    const { results } = (await response.json()) as { results: Array<{ status: string }> };
    say(`Invited ${results.filter((r) => r.status === "invited").length}`);
    void load(query, null);
  }

  async function resend(id: string) {
    const response = await fetch(`${API}/v1/admin/waitlist/${id}/resend`, {
      method: "POST",
      credentials: "include",
    });
    say(response.ok ? "Invite sent again" : "That did not go through.");
    void load(query, null);
  }

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const waiting = rows.filter((row) => row.state === "waiting").length;

  return (
    <>
      <div className={styles.paneHead}>
        <span>
          <h1 className={styles.paneTitle}>Waitlist</h1>
          <span className={styles.paneSub}>
            {waiting.toLocaleString("en-GB")} waiting on this page
          </span>
        </span>

        <span className={styles.headTools}>
          <span className={styles.search}>
            <SearchIcon />
            <input
              className={styles.searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by email"
              aria-label="Search by email"
            />
          </span>
          <button type="button" className={styles.small} onClick={() => setConfirming(true)} disabled={busy}>
            Invite the next batch
          </button>
        </span>
      </div>

      {/* OFF-6: anything that leaves offload is confirmed per action, and this
          one leaves in bulk. A single row's Invite is its own confirmation,
          because the click names the person. This click names nobody and
          emails everybody in the batch, and no part of it is reversible once
          the mail is out. */}
      {confirming ? (
        <div className={styles.selection}>
          <b className={styles.selectionCount}>
            Invite the oldest {BATCH} still waiting? They each get one email, and it cannot be
            taken back.
          </b>
          <button type="button" className={styles.ghost} onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button type="button" className={styles.smallPrimary} onClick={() => void inviteNext()} disabled={busy}>
            Invite {BATCH}
          </button>
        </div>
      ) : null}

      {picked.size ? (
        <div className={styles.selection}>
          <b className={styles.selectionCount}>{picked.size} selected</b>
          <button type="button" className={styles.ghost} onClick={() => setPicked(new Set())}>
            Clear
          </button>
          <button
            type="button"
            className={styles.smallPrimary}
            onClick={() => void invite([...picked])}
            disabled={busy}
          >
            Invite {picked.size}
          </button>
        </div>
      ) : null}

      <div className={styles.table}>
        <div className={styles.thead}>
          <span style={{ width: 24, flex: "0 0 auto" }} />
          <span style={{ flex: 1, minWidth: 0 }}>Email</span>
          <span style={{ width: 80, flex: "0 0 auto" }}>Joined</span>
          <span style={{ width: 130, flex: "0 0 auto" }}>Came from</span>
          <span style={{ width: 110, flex: "0 0 auto" }}>State</span>
          <span style={{ width: 96, flex: "0 0 auto", textAlign: "right" }} />
        </div>

        {rows.map((row, index) => (
          <div
            key={row.id}
            className={`${styles.row} ${index === rows.length - 1 ? styles.rowLast : ""} ${row.state === "accepted" ? styles.rowMuted : ""}`}
          >
            <span style={{ width: 24, flex: "0 0 auto" }}>
              <input
                type="checkbox"
                checked={picked.has(row.id)}
                onChange={() => toggle(row.id)}
                aria-label={`Select ${row.email}`}
              />
            </span>

            <span className={styles.cellEmail}>
              <b className={styles.email}>{row.email}</b>
              {row.note ? <span className={styles.note}>{row.note}</span> : null}
            </span>

            <span className={`${styles.quiet}`} style={{ width: 80, flex: "0 0 auto", fontVariantNumeric: "tabular-nums" }}>
              {row.joined}
            </span>

            <span className={styles.quiet} style={{ width: 130, flex: "0 0 auto" }}>
              {row.source === "thread" ? "A shared thread" : "Waitlist"}
            </span>

            <span style={{ width: 110, flex: "0 0 auto" }}>
              <span className={`${styles.badge} ${STATE_TONE[row.state]}`}>{STATE_LABEL[row.state]}</span>
            </span>

            <span style={{ width: 96, flex: "0 0 auto", textAlign: "right" }}>
              {row.state === "waiting" ? (
                <button type="button" className={styles.small} onClick={() => void invite([row.id])} disabled={busy}>
                  Invite
                </button>
              ) : row.state === "invited" ? (
                <button type="button" className={styles.ghost} onClick={() => void resend(row.id)}>
                  Resend
                </button>
              ) : (
                <span className={styles.quiet} style={{ fontSize: 12.5 }}>
                  in the app
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {rows.length === 0 && !loading ? (
        <p className={styles.empty}>{query ? "No address matches that." : "Nobody is waiting."}</p>
      ) : null}

      {cursor ? (
        <div className={styles.more}>
          <button type="button" className={styles.ghost} onClick={() => void load(query, cursor)} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}

      <span className={styles.sectionLabel}>Notes · what an invite does</span>
      <ul className={styles.notes}>
        {NOTES.map((note) => (
          <li key={note} className={styles.noteItem}>
            <span className={styles.noteBullet}>·</span>
            {note}
          </li>
        ))}
      </ul>

      {toast ? <p className={styles.toast}>{toast}</p> : null}
    </>
  );
}
