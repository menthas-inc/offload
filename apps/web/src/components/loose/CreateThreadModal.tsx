"use client";

// 028. Create a thread from offload's proposal.
//
// The kit draws a sheet on the phones and a side pane on the web; the web's is
// a `people/Modal` wide instead, modelled on the label's list (025), which is
// the web's other modal of ticked rows (logged with the feature's
// divergences). *Create a thread*, *These three look like one project.*, the
// name prefilled and editable, *Moves into it* with every thing still not in a
// thread ticked, and Cancel and *Create thread*. The last ticked thing cannot
// be unticked. The modal makes the one write; a refusal keeps it open with
// what was typed, and the button says Try again.

import { useEffect, useState } from "react";
import { Modal } from "../people/Modal";
import people from "../people/people.module.css";
import pane from "../../app/(shell)/shell.module.css";
import { Icon } from "../Icon";
import {
  THREAD_NAME_CHARS,
  chipInfo,
  chipOf,
  countInWords,
  fetchProposal,
  itemId,
  itemKey,
  itemTitle,
  validThreadName,
  type LooseItem,
  type Proposal,
} from "../../lib/loose";
import styles from "./loose.module.css";

export interface CreateChoice {
  name: string;
  contentIds: string[];
  noteIds: string[];
}

export function CreateThreadModal({
  proposalId,
  name: proposed,
  onCreate,
  onClose,
}: {
  proposalId: string;
  /** The proposal's name as the row drew it, until the read lands. */
  name: string;
  /** The write. Resolves false when it was refused. */
  onCreate: (choice: CreateChoice) => Promise<boolean>;
  onClose: () => void;
}) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [unread, setUnread] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState(proposed);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setUnread(false);
    void fetchProposal(proposalId).then((read) => {
      if (!live) return;
      if (!read) return setUnread(true);
      setProposal(read);
      setName((current) => (current === proposed ? read.name : current));
    });
    return () => {
      live = false;
    };
  }, [proposalId, attempt]);

  const items = proposal?.items ?? [];
  const ticked = items.filter((item) => !unticked.has(itemKey(item)));

  function flip(item: LooseItem): void {
    const key = itemKey(item);
    setUnticked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else if (ticked.length > 1) next.add(key);
      return next;
    });
  }

  async function create(): Promise<void> {
    if (!validThreadName(name) || ticked.length === 0 || busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await onCreate({
      name: name.trim(),
      contentIds: ticked.filter((item) => item.kind === "content").map(itemId),
      noteIds: ticked.filter((item) => item.kind === "note").map(itemId),
    });
    setBusy(false);
    if (!ok) setFailed(true);
  }

  return (
    <Modal label="Create a thread" wide onClose={onClose}>
      <h2 className={people.modalTitle}>Create a thread</h2>
      {proposal ? <p className={styles.line}>These {countInWords(items.length)} look like one project.</p> : null}

      <label className={styles.field}>
        <Icon name="lasso" size={15} />
        <input
          value={name}
          maxLength={THREAD_NAME_CHARS + 20}
          aria-label="Name"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void create();
            }
          }}
        />
      </label>

      <h3 className={styles.moves}>Moves into it</h3>
      {unread ? (
        <p className={styles.state} role="alert">
          Couldn&apos;t load these
          <button type="button" className={people.ghost} onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      ) : proposal === null ? (
        <span className={pane.paneSpinner} role="status" aria-label="loading" />
      ) : (
        <ul className={styles.ticks}>
          {items.map((item) => {
            const on = !unticked.has(itemKey(item));
            const last = on && ticked.length === 1;
            return (
              <li key={itemKey(item)}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className={styles.tickRow}
                  disabled={last}
                  title={last ? "At least one thing moves into it" : undefined}
                  onClick={() => flip(item)}
                >
                  <span className={styles.box} data-on={on ? true : undefined}>
                    {on ? <Icon name="check" size={13} /> : null}
                  </span>
                  <Icon name={chipInfo(chipOf(item)).icon} size={15} className={styles.tickGlyph} />
                  <span className={styles.tickTitle}>{itemTitle(item)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {failed ? (
        <p className={styles.failed} role="alert">
          Couldn&apos;t create that
        </p>
      ) : null}
      <div className={people.modalActions}>
        <button type="button" className={people.ghost} onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={people.primary}
          disabled={busy || proposal === null || !validThreadName(name) || ticked.length === 0}
          onClick={() => void create()}
        >
          {failed ? "Try again" : "Create thread"}
        </button>
      </div>
    </Modal>
  );
}
