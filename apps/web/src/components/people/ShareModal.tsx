"use client";

// The share modal, and Add a connection as its step. 022.
//
// The web kit's `WShareModal`, as the 21 September design changed it: the
// people already in lifted to the top, each with an x; then your connections
// not in, each with a tick; New connection; the line a person reads before
// sharing; Done, or Share with whoever is ticked. No search field until the
// list is past eight. The row ticks and its mark opens the person. Pressing
// Share is the confirmation (OFF-6), and there is no Undo.
//
// Add a connection is the modal's second step, as the kit has it: one field,
// one full address, one account or none. Since 031 the step's body is
// `NewConnectionBody`, which My people also draws.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { Avatar } from "../Avatar";
import { Modal, ConfirmModal } from "./Modal";
import { NewConnectionBody } from "./NewConnectionBody";
import {
  dayMonth,
  SHARE_LINE,
  fetchShareSheet,
  firstNameOf,
  nameOf,
  shareThread,
  takeOut,
  type Person,
  type ShareRefusal,
  type ShareSheet,
} from "../../lib/people";
import styles from "./people.module.css";
import { useClock } from "../../lib/clock";

const SEARCH_PAST = 8;

function sinceLabel(iso: string, zone: string | null): string {
  return `in since ${dayMonth(iso, zone)}`;
}

const REFUSAL: Record<ShareRefusal, string> = {
  unknown_thread: "That didn't go through.",
  default_thread: "That didn't go through.",
  not_connected: "You are not connected any more.",
  already_in: "Already in.",
  waiting: "Already waiting.",
  too_many: "already has three waiting from you.",
};

export function ShareModal({
  threadId,
  threadName,
  viewerId,
  preselect,
  onClose,
  onChanged,
}: {
  threadId: string;
  threadName: string;
  viewerId: string | null;
  /** 052. A reply's Share with: that connection ticked, nothing sent until Share. */
  preselect?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"list" | "new">("list");
  const [sheet, setSheet] = useState<ShareSheet | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set(preselect ? [preselect] : []));
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [x, setX] = useState<{ person: Person; member: boolean; added?: { count: number; titles: string[] } } | null>(null);
  const [xBusy, setXBusy] = useState(false);
  const [xFailed, setXFailed] = useState(false);
  const { zone } = useClock();

  const load = useCallback(async () => {
    const next = await fetchShareSheet(threadId);
    if (next) {
      setSheet(next);
      setFailed(false);
    } else setFailed(true);
  }, [threadId]);
  useEffect(() => {
    void load();
  }, [load]);

  const others = useMemo(() => (sheet?.members ?? []).filter((m) => m.accountId !== viewerId), [sheet, viewerId]);
  const shownConnections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (sheet?.connections ?? []).filter((c) => !needle || nameOf(c).toLowerCase().includes(needle));
  }, [sheet, query]);
  const searchable = (sheet?.connections.length ?? 0) > SEARCH_PAST;
  const chosen = (sheet?.connections ?? []).filter((c) => picked.has(c.accountId));

  async function share() {
    if (chosen.length === 0) return;
    setSending(true);
    setLine(null);
    const outcomes = await shareThread(
      threadId,
      chosen.map((c) => c.accountId),
    );
    setSending(false);
    if (!outcomes) {
      setLine("That didn't go through.");
      return;
    }
    const refused = outcomes.find((o) => !o.ok);
    if (refused?.error) {
      const who = chosen.find((c) => c.accountId === refused.accountId);
      setLine(refused.error === "too_many" ? `${who ? firstNameOf(who) : "Someone"} ${REFUSAL.too_many}` : REFUSAL[refused.error]);
    }
    onChanged();
    if (outcomes.every((o) => o.ok)) onClose();
    else {
      setPicked(new Set());
      await load();
    }
  }

  async function runX() {
    if (!x) return;
    setXBusy(true);
    setXFailed(false);
    const result = await takeOut(threadId, x.person.accountId);
    setXBusy(false);
    if (!result) {
      setXFailed(true);
      return;
    }
    setX(null);
    onChanged();
    await load();
  }

  function footerLabel(): string {
    const names = chosen.map(firstNameOf);
    if (names.length === 1) return `Share with ${names[0]}`;
    if (names.length === 2) return `Share with ${names[0]} and ${names[1]}`;
    return `Share with ${names[0]}, ${names[1]} and ${names.length - 2} more`;
  }

  if (step === "new") {
    return <NewConnection onBack={() => setStep("list")} onClose={onClose} onAsked={() => void load()} />;
  }

  const lifted = [
    ...others.map((m) => ({ key: m.accountId, person: m, kind: "member" as const, meta: sinceLabel(m.since, zone), added: m.added })),
    ...(sheet?.waiting ?? []).map((w) => ({ key: w.memberId, person: w, kind: "waiting" as const, meta: "waiting", added: undefined })),
  ];
  const rows = [
    ...lifted,
    ...shownConnections.map((c) => ({ key: c.accountId, person: c, kind: "connection" as const, meta: undefined, added: undefined })),
  ];

  return (
    <>
      <Modal label={`Share ${threadName}`} onClose={onClose}>
        <h2 className={styles.modalTitle}>Share {threadName}</h2>
        <p className={styles.modalBody} style={{ marginTop: "var(--space-3)" }}>
          Everyone in here sees everything in it.
        </p>

        {failed && !sheet ? (
          <p className={styles.failed} role="alert">
            That didn&rsquo;t go through.{" "}
            <button type="button" className={styles.ghost} onClick={() => void load()} style={{ minHeight: 28, padding: 0, color: "var(--text-accent)" }}>
              Try again
            </button>
          </p>
        ) : null}

        {searchable ? (
          <div className={styles.find}>
            <Icon name="search" size={15} />
            <input
              className={styles.findInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your connections"
              aria-label="Search your connections"
              autoFocus
            />
          </div>
        ) : null}

        {sheet ? (
          <ul className={styles.pickList}>
            {rows.length === 0 && !query ? (
              <li>
                <p className={styles.emptyTitle} style={{ marginTop: 0 }}>You have no connections yet</p>
                <p className={styles.emptyBody}>A connection is somebody already on offload. You need the email they signed up with.</p>
              </li>
            ) : null}
            {rows.length === 0 && query ? <li className={styles.emptyBody}>Nothing by that name.</li> : null}
            {rows.map((row, i) => {
              const on = picked.has(row.person.accountId);
              const last = i === rows.length - 1 && Boolean(query);
              return (
                <li key={row.key}>
                  <div
                    className={`${styles.pickRow} ${last ? styles.pickRowLast : ""}`}
                    data-pick={row.kind === "connection" ? "" : undefined}
                    role={row.kind === "connection" ? "checkbox" : undefined}
                    aria-checked={row.kind === "connection" ? on : undefined}
                    tabIndex={row.kind === "connection" ? 0 : undefined}
                    onClick={
                      row.kind === "connection"
                        ? () =>
                            setPicked((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.person.accountId)) next.delete(row.person.accountId);
                              else next.add(row.person.accountId);
                              return next;
                            })
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      className={styles.door}
                      aria-label={nameOf(row.person)}
                      onClick={(event) => {
                        event.stopPropagation();
                        onClose();
                        router.push(`/people/${row.person.accountId}`);
                      }}
                    >
                      <Avatar uid={row.person.accountId} initials={row.person.initials} name={row.person.displayName ?? undefined} size={36} />
                    </button>
                    <span className={styles.personText}>
                      <span className={styles.personName}>{nameOf(row.person)}</span>
                      {row.meta ? <span className={styles.personNote}>{row.meta}</span> : null}
                    </span>
                    {row.kind === "connection" ? (
                      <span className={styles.tick} data-on={on ? "" : undefined} aria-hidden="true">
                        {on ? <Icon name="check" size={14} /> : null}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.x}
                        aria-label={row.kind === "member" ? `Take ${firstNameOf(row.person)} out` : `Withdraw the share with ${firstNameOf(row.person)}`}
                        onClick={() => {
                          setXFailed(false);
                          setX({ person: row.person, member: row.kind === "member", ...(row.added ? { added: row.added } : {}) });
                        }}
                      >
                        <Icon name="x" size={15} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
            {query ? null : (
              <li>
                <button type="button" className={`${styles.pickRow} ${styles.pickRowLast}`} data-pick="" onClick={() => setStep("new")}>
                  <span className={styles.plusLead} aria-hidden="true">
                    <Icon name="plus" size={16} />
                  </span>
                  <span className={styles.personText}>
                    <span className={styles.personName}>New connection</span>
                  </span>
                  <span className={styles.personChevron} aria-hidden="true">
                    <Icon name="chevron-right" size={15} />
                  </span>
                </button>
              </li>
            )}
          </ul>
        ) : null}

        <p className={styles.line}>{SHARE_LINE}</p>
        {line ? (
          <p className={styles.failed} role="alert">
            {line}
          </p>
        ) : null}

        <div className={styles.modalActions}>
          <button type="button" className={styles.ghost} onClick={onClose}>
            {chosen.length > 0 ? "Cancel" : "Done"}
          </button>
          {chosen.length > 0 ? (
            <button type="button" className={styles.primary} onClick={() => void share()} disabled={sending}>
              {line ? "Try again" : footerLabel()}
            </button>
          ) : null}
        </div>
      </Modal>

      {x ? (
        <ConfirmModal
          title={x.member ? `Take ${firstNameOf(x.person)} out of ${threadName}?` : `Withdraw the share with ${firstNameOf(x.person)}?`}
          body={
            x.member
              ? `${firstNameOf(x.person)} loses the thread. What ${firstNameOf(x.person)} added stays, because a shared thread belongs to everyone who was in it.`
              : `${firstNameOf(x.person)} will not see it any more, and nothing tells them it was there.`
          }
          rows={x.added ? x.added.titles.map((title) => ({ title, meta: `${firstNameOf(x.person)} added it` })) : []}
          rowCount={x.added?.count}
          action={x.member ? "Take out" : "Withdraw"}
          danger={x.member}
          busy={xBusy}
          failed={xFailed}
          onConfirm={() => void runX()}
          onClose={() => setX(null)}
        />
      ) : null}
    </>
  );
}

/** Add a connection: the modal's second step. The field, its states and the
 *  found row are `NewConnectionBody`, which My people draws inline (031). */
export function NewConnection({ onBack, onClose, onAsked }: { onBack: () => void; onClose: () => void; onAsked?: () => void }) {
  return (
    <Modal label="Add a connection" onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        <button type="button" className={styles.x} onClick={onBack} aria-label="Back">
          <Icon name="chevron-left" size={16} />
        </button>
        <h2 className={styles.modalTitle}>Add a connection</h2>
      </div>
      <NewConnectionBody onAsked={onAsked} onLeave={onClose} />
      <div className={styles.modalActions}>
        <button type="button" className={styles.ghost} onClick={onBack}>
          Back
        </button>
      </div>
    </Modal>
  );
}
