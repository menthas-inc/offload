"use client";

// My people, and the Blocked page behind its last row. 022.
//
// `WSettings.jsx`'s people page predates the 21 September design and draws
// neither marks, Pending nor Blocked, and its receiving pick is the setting
// that is out of scope, so this is `SettingsDetail.jsx`'s page in the web's
// open blocks.
//
// 031: five sections. Waiting on you, the cards; Connect with someone, the
// Share modal's step drawn inline, because connecting used to start only from
// a thread and on day one this page was a sentence and a Blocked row;
// Connected; Asked by you, renamed from Pending, with Withdraw as a pill; and
// Blocked. The first and the fourth are not drawn when they are empty.

import { useCallback, useEffect, useState } from "react";
import { Group, Row } from "./SettingsRows";
import { PersonRow } from "../people/PersonRow";
import { RequestCard } from "../people/RequestCard";
import { NewConnectionBody } from "../people/NewConnectionBody";
import { ConfirmModal } from "../people/Modal";
import { useChanged } from "../shell/threads-context";
import { refreshMe } from "../../lib/use-me";
import { peopleSummary } from "../../lib/settings";
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
import { useClock } from "../../lib/clock";

export function sinceLabel(iso: string, zone: string | null): string {
  return `Pending since ${dayMonth(iso, zone)}`;
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
  // 048. A connection, a request or a thread invitation changed elsewhere.
  useChanged(["people", "invitation"], () => void load());
  return { page, failed, load };
}

export function PeoplePane() {
  const { page, failed, load } = usePeople();
  const { zone } = useClock();
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

  const summary = page ? peopleSummary(page.connections.length, page.requestsForYou.length) : undefined;

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>My people</h1>
          {summary ? <p className={pane.paneSub}>{summary}</p> : null}
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
            {page.requestsForYou.length > 0 ? (
              <Group label="Waiting on you" icon="bell" count={String(page.requestsForYou.length)}>
                <div className={styles.waiting}>
                  {page.requestsForYou.map((card) => (
                    <RequestCard key={card.id} card={card} onAnswer={(answer) => answerCard(card.id, answer)} />
                  ))}
                </div>
              </Group>
            ) : null}

            <Group label="Connect with someone" icon="user-plus">
              {/* A request sent here reads the page again, so it lands in
                  Asked by you without leaving. */}
              <NewConnectionBody inline onAsked={() => void load()} />
            </Group>

            <Group
              label="Connected"
              icon="users"
              count={page.connections.length > 0 ? String(page.connections.length) : undefined}
              caption="Who you can share a thread with."
            >
              {page.connections.length === 0 ? (
                <Row
                  title="Nobody yet"
                  note="A connection is somebody already on offload. Find them above, or open a thread and click Share."
                  last
                />
              ) : (
                page.connections.map((row, i) => (
                  <PersonRow key={row.accountId} person={row} note={sharedNote(row)} last={i === page.connections.length - 1} />
                ))
              )}
            </Group>

            {page.pending.length > 0 ? (
              <Group label="Asked by you" icon="clock" count={String(page.pending.length)}>
                {page.pending.map((card, i) => (
                  <PersonRow
                    key={card.id}
                    person={card}
                    note={sinceLabel(card.since, zone)}
                    pill="Withdraw"
                    onClick={() => {
                      setWithdrawFailed(false);
                      setWithdrawing(card);
                    }}
                    last={i === page.pending.length - 1}
                  />
                ))}
              </Group>
            ) : null}

            <Group label="Blocked" icon="ban">
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
  const { page, failed, load } = usePeople();
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [unblockFailed, setUnblockFailed] = useState(false);
  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>Blocked</h1>
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
        {unblockFailed ? (
          <p className={pane.signOutFailed} role="alert">
            That didn&rsquo;t go through. Click Unblock again.
          </p>
        ) : null}
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
                  setUnblockFailed(false);
                  void unblockPerson(person.accountId).then(async (ok) => {
                    setUnblocking(null);
                    if (ok) await load();
                    else setUnblockFailed(true);
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
