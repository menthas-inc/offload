"use client";

// The waitlist, from ui_kits/admin_web/AdminApp.jsx.
//
// One table with a state column, not a tab split: everyone who has ever been
// on the list sits together, so "invited and never signed in" is visible beside
// the people still waiting rather than behind a tab nobody opens.
//
// Search, the weekly batch button, the source column, the quiet note under an
// address, per-row actions and the notes below the table. 034 added what 002
// left out: the stats row, invite by address, and the weekly batch read from
// Limits.

import { useCallback, useEffect, useState } from "react";
import { Checkbox } from "../../../../components/Checkbox";
import { Icon } from "../../../../components/Icon";
import { useAdmin } from "../../admin-context";
import styles from "../../admin.module.css";
import { API, Confirm, Empty, Failed, Field, Loading, Notes, PaneHead, Section, Stat, Stats, StatusPill, adminWrite, count, day, useAdminRead, useSay } from "../../ui";

const PAGE = 50;

/** The stats row, straight from the accounts table. `batch` is the Limits
 *  value, so this page carries no copy of a number an owner can change. */
interface WaitlistStats {
  waiting: number;
  oldestWaiting: string | null;
  invitedThisWeek: number;
  signedUp: number;
  invitedNotSignedUp: number;
  batch: number;
}

/** Enough to stop a slip of the hand. The server decides what an address is. */
const LOOKS_LIKE_AN_ADDRESS = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

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

// What an invite does, and two things it deliberately does not. Straight from
// the kit, minus its claims about single-use links, which this product does
// not have: sign-in is by provider on the invited address.
const NOTES = [
  "Inviting sends the one transactional email and creates the account, its keys and its Miscellaneous thread in a single transaction. They can sign in with Apple or Google on that address as soon as it arrives.",
  "Inviting twice is inviting once. A second invite sends no second email and creates no second thread.",
  "Someone who came from a shared thread is already vouched for by a member, so those usually go in the next batch.",
  "Remove takes an address off the list without telling them, for a typo or a bot. It only works before an invite goes out: after that the account has keys and a thread, and removing it belongs on People.",
] as const;

export default function WaitlistPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // A failed read is never drawn as an empty list.
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast, say } = useSay();
  const stats = useAdminRead<WaitlistStats>("/waitlist/stats");
  const batch = stats.data?.batch ?? null;
  const [adding, setAdding] = useState(false);
  const [address, setAddress] = useState("");
  // The nav counts who is waiting, and every action below changes that number.
  // The page knows when it moved; the nav does not.
  const { refresh } = useAdmin();
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [removingMany, setRemovingMany] = useState(false);
  const [invitingMany, setInvitingMany] = useState(false);

  const load = useCallback(async (search: string, after: string | null) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE) });
    if (search) params.set("q", search);
    if (after) params.set("cursor", after);

    const response = await fetch(`${API}/v1/admin/waitlist?${params}`, { credentials: "include" }).catch(() => null);
    if (!response?.ok) {
      setFailed(true);
      setLoading(false);
      return;
    }
    const page = (await response.json()) as { rows: Row[]; nextCursor: string | null };
    setRows((existing) => (after ? [...existing, ...page.rows] : page.rows));
    setCursor(page.nextCursor);
    setFailed(false);
    setLoading(false);
  }, []);

  /** Everything a write can have moved: the nav's count, the stats row and
   *  the list. */
  const moved = () => {
    refresh();
    stats.reload();
    void load(query, null);
  };

  useEffect(() => {
    // Debounced, so typing an address is one request at the end rather than
    // one per keystroke against a table of thousands.
    const timer = setTimeout(() => {
      setPicked(new Set());
      void load(query, null);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, load]);

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
    moved();
  }

  /** Whoever it is, waiting or never seen. Same promotion, same one email. */
  async function inviteAddress() {
    setBusy(true);
    const response = await adminWrite("/waitlist/invite-address", "POST", { email: address.trim() }).catch(() => null);
    setBusy(false);
    setAddress("");

    if (!response?.ok) {
      say(response?.status === 400 ? "That address was refused. Nobody was invited." : "That did not go through. Nobody was invited.");
      return;
    }
    const { status } = (await response.json()) as { status: "invited" | "already-in" | "refused" };
    say(status === "invited" ? "Invite sent" : status === "already-in" ? "They are already in." : "That account is disabled. Nobody was invited.");
    moved();
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
    moved();
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
    moved();
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
    moved();
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
  /** Removal only applies to people still waiting, so the button says how many
   *  of the selection it would actually touch rather than the selection size. */
  const pickedWaiting = rows.filter((row) => picked.has(row.id) && row.state === "waiting").length;

  return (
    <>
      <PaneHead
        title="Waitlist"
        sub={
          stats.data
            ? `${count(stats.data.waiting)} waiting · letting ${stats.data.batch} in a week, set on Limits`
            : undefined
        }
        tools={
          <>
            <label className={styles.search}>
              <Icon name="search" size={15} />
              <input
                className={styles.searchInput}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by email"
                aria-label="Search by email"
              />
            </label>
            <button type="button" className={styles.small} onClick={() => setAdding(true)} disabled={busy}>
              Invite by address
            </button>
            <button type="button" className={styles.small} onClick={() => setConfirming(true)} disabled={busy}>
              {batch === null ? "Invite the next batch" : `Invite the next ${batch}`}
            </button>
          </>
        }
      />

      {/* The stats row the kit draws. A section that failed says so in its
          own place and the rest of the page stays. */}
      {stats.state === "failed" && !stats.data ? (
        <Failed what="the figures" onRetry={stats.reload} />
      ) : stats.data ? (
        <Stats>
          <Stat
            label="Waiting"
            value={count(stats.data.waiting)}
            note={stats.data.oldestWaiting ? `oldest joined ${day(stats.data.oldestWaiting)}` : undefined}
          />
          <Stat label="Invited this week" value={count(stats.data.invitedThisWeek)} />
          <Stat
            label="Signed up"
            value={count(stats.data.signedUp)}
            note={stats.data.invitedNotSignedUp ? `${count(stats.data.invitedNotSignedUp)} invited have not signed in` : undefined}
          />
          <Stat label="Weekly batch" value={stats.data.batch} note="set on the Limits page" />
        </Stats>
      ) : null}

      {/* 034. Invite by address: a one-field dialog. It says what happens,
          because an invite is an email and cannot be taken back. */}
      {adding ? (
        <Confirm
          title="Invite by address"
          body="They are let in at once, whether or not they were waiting, and get the one invite email. It cannot be taken back."
          confirmLabel="Invite"
          ready={LOOKS_LIKE_AN_ADDRESS.test(address.trim())}
          busy={busy}
          onConfirm={() => void inviteAddress()}
          onClose={() => setAdding(false)}
        >
          <Field label="Email" type="email" value={address} onChange={setAddress} width="100%" />
        </Confirm>
      ) : null}

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

      {invitingMany ? (
        <div className={styles.selection}>
          <b className={styles.selectionCount}>
            Invite {picked.size} from the waitlist? They each get one email, and it cannot be taken
            back.
          </b>
          <button type="button" className={styles.ghost} onClick={() => setInvitingMany(false)}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.smallPrimary}
            onClick={() => {
              setInvitingMany(false);
              void invite([...picked]);
            }}
            disabled={busy}
          >
            Invite {picked.size}
          </button>
        </div>
      ) : removingMany ? (
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
          {/* OFF-6 again, and for the same reason as the batch above: one
              row's Invite is its own confirmation because the click names the
              person, and this click names a set. It emails all of them and no
              part of it comes back. A single pick still goes straight through,
              since that click does name someone. */}
          <button
            type="button"
            className={styles.smallPrimary}
            onClick={() => (picked.size > 1 ? setInvitingMany(true) : void invite([...picked]))}
            disabled={busy}
          >
            Invite {picked.size}
          </button>
        </div>
      ) : null}

      <div className={styles.table}>
        <div className={styles.thead}>
          {/* A label, because the box is drawn and the input under it is the
              control: the label is what makes the drawing clickable. */}
          <label style={{ width: 24, flex: "0 0 auto" }}>
            <Checkbox
              checked={allPicked}
              onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))}
              label={allPicked ? "Clear the selection" : "Select every row on this page"}
            />
          </label>
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
            <label style={{ width: 24, flex: "0 0 auto" }}>
              <Checkbox checked={picked.has(row.id)} onChange={() => toggle(row.id)} label={`Select ${row.email}`} />
            </label>

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
              <StatusPill value={row.state} label={STATE_LABEL[row.state]} />
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

      {failed ? (
        <Failed what="the waitlist" onRetry={() => void load(query, null)} />
      ) : loading && rows.length === 0 ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>{query ? "No address matches that." : "Nobody is waiting."}</Empty>
      ) : null}

      {cursor ? (
        <div className={styles.more}>
          <button type="button" className={styles.ghost} onClick={() => void load(query, cursor)} disabled={loading}>
            Load more
          </button>
        </div>
      ) : null}

      <Section note="what an invite does">Notes</Section>
      <Notes items={NOTES} />

      {toast}
    </>
  );
}
