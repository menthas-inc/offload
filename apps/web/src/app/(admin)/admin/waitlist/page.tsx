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

/** Only until the server has told us. It returns batchSize precisely so the
 *  client does not carry a second copy of a number that is documented as
 *  moving to a Limits page. */
const BATCH_UNKNOWN = null;

/** The kit sizes the action column at 96, which fits one button. Waiting rows
 *  carry two, so it is wider here; the alternative is Remove hanging off the
 *  edge of the table, which is what it did. */
const ACTION_W = 156;

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
  "Remove takes an address off the list without telling them, for a typo or a bot. It only works before an invite goes out: after that the account has keys and a thread, and removing it belongs on People.",
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
  const [batch, setBatch] = useState<number | null>(BATCH_UNKNOWN);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [removingMany, setRemovingMany] = useState(false);

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
    const { results, batchSize } = (await response.json()) as {
      results: Array<{ status: string }>;
      batchSize: number;
    };
    setBatch(batchSize);
    say(`Invited ${results.filter((r) => r.status === "invited").length}`);
    void load(query, null);
  }

  async function resend(id: string) {
    const response = await fetch(`${API}/v1/admin/waitlist/${id}/resend`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      say("That did not go through.");
      return;
    }
    // 200 does not mean it sent. The row's state can have changed since this
    // page loaded, and reporting success then would be a lie the admin acts on.
    const { status } = (await response.json()) as { status: "queued" | "not-invited" };
    say(status === "queued" ? "Invite sent again" : "Nothing to resend, that account has moved on.");
    void load(query, null);
  }

  async function removeSelected() {
    const ids = [...picked];
    setRemovingMany(false);
    setBusy(true);
    const response = await fetch(`${API}/v1/admin/waitlist/remove`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setBusy(false);

    if (!response.ok) {
      say("That did not go through. Nobody was removed.");
      return;
    }
    const { removed, skipped } = (await response.json()) as { removed: number; skipped: number };
    // Skipped is not an error: someone can be invited between the page loading
    // and the click, and saying so is more use than a number that hides it.
    say(`Removed ${removed}${skipped ? `, ${skipped} already invited` : ""}`);
    setPicked(new Set());
    void load(query, null);
  }

  async function remove(row: Row) {
    setRemoving(null);
    const response = await fetch(`${API}/v1/admin/waitlist/${row.id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      say("That did not go through.");
      return;
    }
    const { status } = (await response.json()) as { status: "removed" | "not-waiting" };
    say(status === "removed" ? "Removed from the waitlist" : "That account has already been invited.");
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

  const allPicked = rows.length > 0 && picked.size === rows.length;
  const waiting = rows.filter((row) => row.state === "waiting").length;
  /** Removal only applies to people still waiting, so the button says how many
   *  of the selection it would actually touch rather than the selection size. */
  const pickedWaiting = rows.filter((row) => picked.has(row.id) && row.state === "waiting").length;

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
            {batch === null
              ? "Invite the next batch of the oldest still waiting?"
              : `Invite the oldest ${batch} still waiting?`}{" "}
            They each get one email, and it cannot be taken back.
          </b>
          <button type="button" className={styles.ghost} onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button type="button" className={styles.smallPrimary} onClick={() => void inviteNext()} disabled={busy}>
            {batch === null ? "Invite the batch" : `Invite ${batch}`}
          </button>
        </div>
      ) : null}

      {/* Destructive and not undoable from here, so it names the address
          rather than asking about "this row". Only ever offered for someone
          still waiting: an invited account has keys, a thread and a membership
          that this would orphan, and the server refuses it anyway. */}
      {removing ? (
        <div className={styles.selection}>
          <b className={styles.selectionCount}>
            Remove {removing.email} from the waitlist? They are not told, and they can join again.
          </b>
          <button type="button" className={styles.ghost} onClick={() => setRemoving(null)}>
            Cancel
          </button>
          <button type="button" className={styles.dangerSolid} onClick={() => void remove(removing)}>
            Remove
          </button>
        </div>
      ) : null}

      {removingMany ? (
        <div className={styles.selection}>
          <b className={styles.selectionCount}>
            Remove {pickedWaiting} from the waitlist? They are not told, and they can join again.
          </b>
          <button type="button" className={styles.ghost} onClick={() => setRemovingMany(false)}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.dangerSolid}
            onClick={() => void removeSelected()}
            disabled={busy}
          >
            Remove {pickedWaiting}
          </button>
        </div>
      ) : picked.size ? (
        <div className={styles.selection}>
          <b className={styles.selectionCount}>{picked.size} selected</b>
          <button type="button" className={styles.ghost} onClick={() => setPicked(new Set())}>
            Clear
          </button>
          {pickedWaiting > 0 ? (
            <button type="button" className={styles.danger} onClick={() => setRemovingMany(true)}>
              Remove {pickedWaiting}
            </button>
          ) : null}
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
          <span style={{ width: 24, flex: "0 0 auto" }}>
            <input
              type="checkbox"
              checked={allPicked}
              // Indeterminate when some but not all are picked, so the box
              // reports the state rather than guessing at it.
              ref={(node) => {
                if (node) node.indeterminate = picked.size > 0 && !allPicked;
              }}
              onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))}
              aria-label={allPicked ? "Clear the selection" : "Select every row on this page"}
            />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>Email</span>
          <span style={{ width: 80, flex: "0 0 auto" }}>Joined</span>
          <span style={{ width: 130, flex: "0 0 auto" }}>Came from</span>
          <span style={{ width: 110, flex: "0 0 auto" }}>State</span>
          <span style={{ width: ACTION_W, flex: "0 0 auto", textAlign: "right" }} />
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

            <span style={{ width: ACTION_W, flex: "0 0 auto", textAlign: "right" }}>
              {row.state === "waiting" ? (
                <span style={{ display: "inline-flex", gap: 4 }}>
                  <button type="button" className={styles.small} onClick={() => void invite([row.id])} disabled={busy}>
                    Invite
                  </button>
                  <button type="button" className={styles.danger} onClick={() => setRemoving(row)}>
                    Remove
                  </button>
                </span>
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

      {toast ? (
        <p className={styles.toast} role="status" aria-live="polite">
          {toast}
        </p>
      ) : null}
    </>
  );
}
