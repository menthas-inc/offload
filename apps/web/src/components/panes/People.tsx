"use client";

// My people, and the Blocked page behind its last row. 022.
//
// `WSettings.jsx`'s people page predates the 21 September design and draws
// neither marks, Pending nor Blocked, and its receiving pick is the setting
// that is out of scope, so this is `SettingsDetail.jsx`'s page in the web's
// open blocks: the cards on top, Connected with the shared threads as the
// note and "Nothing shared yet", Pending with Withdraw as its value, and
// Blocked.

import { useCallback, useEffect, useState } from "react";
import { Group, Row } from "./SettingsRows";
import { PersonRow } from "../people/PersonRow";
import { RequestCard } from "../people/RequestCard";
import { ConfirmModal } from "../people/Modal";
import { refreshMe } from "../../lib/use-me";
import {
  dayMonth,
  answerRequest,
  fetchPeople,
  firstNameOf,
  unblockPerson,
  withdrawRequest,
  type ConnectionRow,
  type PeoplePage as Page,
  type RequestCard as Card,
} from "../../lib/people";
import pane from "../../app/(shell)/shell.module.css";
import styles from "../people/people.module.css";

export function sinceLabel(iso: string): string {
  return `Pending since ${dayMonth(iso)}`;
}

function sharedNote(row: ConnectionRow): string {
  if (row.threadCount === 0) return "Nothing shared yet";
  const names = row.threads.map((t) => t.name).join(", ");
  const more = row.threadCount - row.threads.length;
  return more > 0 ? `${names} and ${more} more` : names;
}

function usePeople() {
  const [page, setPage] = useState<Page | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const next = await fetchPeople();
    if (next) {
      setPage(next);
      setFailed(false);
    } else setFailed(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { page, failed, load };
}

export function PeoplePane() {
  const { page, failed, load } = usePeople();
  const [withdrawing, setWithdrawing] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [withdrawFailed, setWithdrawFailed] = useState(false);

  async function answerCard(requestId: string, answer: "accept" | "dismiss"): Promise<boolean> {
    const ok = await answerRequest(requestId, answer);
    if (ok) {
      await load();
      void refreshMe();
    }
    return ok;
  }

  async function withdraw() {
    if (!withdrawing) return;
    setBusy(true);
    const ok = await withdrawRequest(withdrawing.id);
    setBusy(false);
    if (!ok) {
      setWithdrawFailed(true);
      return;
    }
    setWithdrawing(null);
    setWithdrawFailed(false);
    await load();
  }

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>My people</h1>
        </div>
      </div>
      <div className={pane.paneBody}>
        {failed && !page ? (
          <p className={pane.signOutFailed} role="alert">
            That didn&rsquo;t go through.{" "}
            <button type="button" className={pane.retryQuiet} onClick={() => void load()}>
              Try again
            </button>
          </p>
        ) : null}
        {page ? (
          <>
            {page.requestsForYou.map((card) => (
              <RequestCard key={card.id} card={card} onAnswer={(answer) => answerCard(card.id, answer)} />
            ))}
            <Group label="Connected">
              {page.connections.length === 0 ? (
                <p className={styles.emptyBody} style={{ margin: 0, padding: "var(--space-3) 0" }}>
                  Nobody yet. A connection is somebody already on offload; open a thread and click Share to ask.
                </p>
              ) : (
                page.connections.map((row, i) => (
                  <PersonRow key={row.accountId} person={row} note={sharedNote(row)} last={i === page.connections.length - 1} />
                ))
              )}
            </Group>
            {page.pending.length > 0 ? (
              <Group label="Pending">
                {page.pending.map((card, i) => (
                  <PersonRow
                    key={card.id}
                    person={card}
                    note={sinceLabel(card.since)}
                    value="Withdraw"
                    onClick={() => {
                      setWithdrawFailed(false);
                      setWithdrawing(card);
                    }}
                    last={i === page.pending.length - 1}
                  />
                ))}
              </Group>
            ) : null}
            {/* The kit puts Blocked under Defaults, whose toggles are not
                drawn; alone, the row needs no label over it saying the same. */}
            <Group>
              <Row title="Blocked" value={page.blocked.length > 0 ? String(page.blocked.length) : "None"} href="/settings/people/blocked" last />
            </Group>
          </>
        ) : null}
      </div>
      {withdrawing ? (
        <ConfirmModal
          title={`Withdraw the request to ${firstNameOf(withdrawing)}?`}
          body="They will not see it any more, and nothing tells them it was there."
          action="Withdraw"
          busy={busy}
          failed={withdrawFailed}
          onConfirm={() => void withdraw()}
          onClose={() => setWithdrawing(null)}
        />
      ) : null}
    </>
  );
}

export function BlockedPane() {
  const { page, load } = usePeople();
  const [unblocking, setUnblocking] = useState<string | null>(null);
  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>Blocked</h1>
        </div>
      </div>
      <div className={pane.paneBody}>
        {page && page.blocked.length === 0 ? <p className={styles.emptyBody}>Nobody is blocked.</p> : null}
        {page && page.blocked.length > 0 ? (
          <Group>
            {page.blocked.map((person, i) => (
              <PersonRow
                key={person.accountId}
                person={person}
                value={unblocking === person.accountId ? "Unblocking" : "Unblock"}
                onClick={() => {
                  setUnblocking(person.accountId);
                  void unblockPerson(person.accountId).then(async () => {
                    setUnblocking(null);
                    await load();
                  });
                }}
                last={i === page.blocked.length - 1}
              />
            ))}
          </Group>
        ) : null}
      </div>
    </>
  );
}
