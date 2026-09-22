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
// one full address, one account or none.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { Avatar } from "../Avatar";
import { Modal, ConfirmModal } from "./Modal";
import { refreshMe } from "../../lib/use-me";
import {
  dayMonth,
  SHARE_LINE,
  answerRequest,
  fetchShareSheet,
  firstNameOf,
  lookup,
  nameOf,
  requestConnection,
  shareThread,
  takeOut,
  type Found,
  type Person,
  type ShareRefusal,
  type ShareSheet,
} from "../../lib/people";
import styles from "./people.module.css";

const SEARCH_PAST = 8;

function sinceLabel(iso: string): string {
  return `in since ${dayMonth(iso)}`;
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
  onClose,
  onChanged,
}: {
  threadId: string;
  threadName: string;
  viewerId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"list" | "new">("list");
  const [sheet, setSheet] = useState<ShareSheet | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [x, setX] = useState<{ person: Person; member: boolean; added?: { count: number; titles: string[] } } | null>(null);
  const [xBusy, setXBusy] = useState(false);
  const [xFailed, setXFailed] = useState(false);

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
    ...others.map((m) => ({ key: m.accountId, person: m, kind: "member" as const, meta: sinceLabel(m.since), added: m.added })),
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

type State =
  | { kind: "empty" }
  | { kind: "looking" }
  | { kind: "found"; found: Found; line?: string; answered?: "dismissed" }
  | { kind: "none" }
  | { kind: "failed" };

function since(iso: string | null): string {
  if (!iso) return "Pending";
  return `Pending since ${dayMonth(iso)}`;
}

/** Add a connection: the modal's second step. */
export function NewConnection({ onBack, onClose, onAsked }: { onBack: () => void; onClose: () => void; onAsked?: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "empty" });
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);

  async function look() {
    const address = email.trim();
    if (!address.includes("@")) return;
    setState({ kind: "looking" });
    setSendFailed(false);
    const result = await lookup(address);
    if (result.kind === "found") setState(result.found ? { kind: "found", found: result.found } : { kind: "none" });
    else setState({ kind: "failed" });
  }

  async function ask(found: Found) {
    setSending(true);
    setSendFailed(false);
    const outcome = await requestConnection(found.accountId);
    setSending(false);
    if (outcome.ok) {
      setState({ kind: "found", found: { ...found, relation: "you_asked", requestId: outcome.requestId, since: outcome.since } });
      onAsked?.();
      return;
    }
    if (outcome.error === "connected") setState({ kind: "found", found: { ...found, relation: "connected" } });
    else if (outcome.error === "pending") setState({ kind: "found", found: { ...found, relation: "you_asked", requestId: outcome.requestId ?? null } });
    // A request to this person ended in the last week: what is refused is
    // said, and the row keeps its control for when the week is up.
    else if (outcome.error === "too_soon") setState({ kind: "found", found, line: "You asked recently. Try again in a week." });
    else if (outcome.error === "asked_you") setState({ kind: "found", found: { ...found, relation: "asked_you", requestId: outcome.requestId ?? null } });
    else if (outcome.error === "not_found") setState({ kind: "none" });
    else setSendFailed(true);
  }

  async function answer(found: Found, which: "accept" | "dismiss") {
    if (!found.requestId) return;
    setSending(true);
    const ok = await answerRequest(found.requestId, which);
    setSending(false);
    if (!ok) {
      setSendFailed(true);
      return;
    }
    void refreshMe();
    onAsked?.();
    // Not now leaves their request standing on their side, so the row says
    // so rather than offering Request, which the server would refuse.
    setState(which === "accept" ? { kind: "found", found: { ...found, relation: "connected" } } : { kind: "found", found, answered: "dismissed" });
  }

  const found = state.kind === "found" ? state.found : null;
  const dismissed = state.kind === "found" && state.answered === "dismissed";
  const line = state.kind === "found" ? state.line : undefined;
  const first = found ? firstNameOf(found) : "";

  return (
    <Modal label="Add a connection" onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        <button type="button" className={styles.x} onClick={onBack} aria-label="Back">
          <Icon name="chevron-left" size={16} />
        </button>
        <h2 className={styles.modalTitle}>Add a connection</h2>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void look();
        }}
      >
        <input
          className={styles.field}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (state.kind !== "empty") setState({ kind: "empty" });
          }}
          placeholder="Their email address"
          aria-label="Their email address"
          type="email"
          autoComplete="off"
          autoFocus
        />
      </form>
      {state.kind === "empty" || state.kind === "looking" ? (
        <>
          <p className={styles.emptyTitle} style={{ marginTop: 0 }}>You need their offload email</p>
          <p className={styles.emptyBody}>
            Sharing does not invite anyone in, so there is nobody to look up who is not already here. Ask them which email they signed up with.
          </p>
        </>
      ) : null}
      {state.kind === "none" ? (
        <>
          <p className={styles.emptyTitle} style={{ marginTop: 0 }}>No offload account for that</p>
          <p className={styles.emptyBody}>Check the spelling. If they are not on offload, there is nothing here that can add them.</p>
        </>
      ) : null}
      {state.kind === "failed" ? (
        <p className={styles.failed} role="alert" style={{ marginTop: 0 }}>
          That didn&rsquo;t go through.{" "}
          <button type="button" className={styles.ghost} onClick={() => void look()} style={{ minHeight: 28, padding: 0, color: "var(--text-accent)" }}>
            Try again
          </button>
        </p>
      ) : null}
      {found ? (
        <>
          <div className={`${styles.pickRow} ${styles.pickRowLast}`} style={{ margin: 0, padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-md)", background: "var(--surface-fill)" }}>
            <button
              type="button"
              className={styles.door}
              aria-label={nameOf(found)}
              onClick={() => {
                if (found.relation === "you") return;
                onClose();
                router.push(`/people/${found.accountId}`);
              }}
            >
              <Avatar uid={found.accountId} initials={found.initials} name={found.displayName ?? undefined} size={36} />
            </button>
            <span className={styles.personText}>
              <span className={styles.personName}>{nameOf(found)}</span>
              <span className={styles.personNote}>{found.email}</span>
            </span>
            {dismissed ? <span className={styles.personValue}>Not now</span> : null}
            {!dismissed && found.relation === "you" ? <span className={styles.personValue}>That&rsquo;s you</span> : null}
            {!dismissed && found.relation === "connected" ? <span className={styles.personValue}>Already connected</span> : null}
            {!dismissed && found.relation === "you_asked" ? <span className={styles.personValue}>{since(found.since)}</span> : null}
            {!dismissed && found.relation === "asked_you" ? (
              <span className={styles.cardChips}>
                <button type="button" className={styles.chip} onClick={() => void answer(found, "accept")} disabled={sending}>
                  {sendFailed ? "Try again" : "Accept"}
                </button>
                <button type="button" className={styles.chipOutlined} onClick={() => void answer(found, "dismiss")} disabled={sending}>
                  Not now
                </button>
              </span>
            ) : null}
            {found.relation === "none" ? (
              <button type="button" className={styles.chip} onClick={() => void ask(found)} disabled={sending}>
                {sendFailed ? "Try again" : "Request"}
              </button>
            ) : null}
          </div>
          {line ? (
            <p className={styles.failed} role="alert">
              {line}
            </p>
          ) : null}
          {!dismissed && (found.relation === "none" || found.relation === "you_asked") ? (
            <p className={styles.modalHint}>
              {first} decides whether to accept. Until then you cannot share anything with them, and they are not told what you wanted to share.
            </p>
          ) : null}
          {sendFailed ? (
            <p className={styles.failed} role="alert">
              That didn&rsquo;t go through.
            </p>
          ) : null}
        </>
      ) : null}
      <div className={styles.modalActions}>
        <button type="button" className={styles.ghost} onClick={onBack}>
          Back
        </button>
      </div>
    </Modal>
  );
}
