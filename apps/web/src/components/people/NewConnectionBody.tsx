"use client";

// Add a connection's body: the field, every state the lookup can end in, and
// the found row with its one control. 022 drew it as the Share modal's second
// step; 031 put it on My people as Connect with someone, so it is one piece in
// two frames and a change to it reaches both.
//
// **A refused lookup has its own line.** The server caps lookups, and a 429
// fell into "That didn't go through. Try again", which offered a retry the
// server would refuse again. It is a fact the server stated, so it is said,
// with nothing to press (owner, 2026-10-02).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { Avatar } from "../Avatar";
import { refreshMe } from "../../lib/use-me";
import {
  LOOKUP_LIMITED,
  answerRequest,
  dayMonth,
  firstNameOf,
  lookup,
  nameOf,
  requestConnection,
  stateOfLookup,
  stateOfRequest,
  type Found,
} from "../../lib/people";
import styles from "./people.module.css";
import { useClock } from "../../lib/clock";

type State =
  | { kind: "empty" }
  | { kind: "looking" }
  | { kind: "found"; found: Found; line?: string; answered?: "dismissed" }
  | { kind: "none" }
  | { kind: "limited" }
  | { kind: "failed" };

function since(iso: string | null, zone: string | null): string {
  if (!iso) return "Pending";
  return `Pending since ${dayMonth(iso, zone)}`;
}

export function NewConnectionBody({
  inline = false,
  onAsked,
  onLeave,
}: {
  /** My people's frame: the search glyph, Find, and the line under them. The
   *  modal keeps its own field and the explanation before a lookup. */
  inline?: boolean;
  /** A request sent or answered here, so the frame can read its lists again. */
  onAsked?: (() => void) | undefined;
  /** Called before the found row's mark opens the person: the modal closes. */
  onLeave?: (() => void) | undefined;
}) {
  const router = useRouter();
  const { zone } = useClock();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "empty" });
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);

  async function look() {
    const address = email.trim();
    if (!address.includes("@")) return;
    setState({ kind: "looking" });
    setSendFailed(false);
    setState(stateOfLookup(await lookup(address)));
  }

  async function ask(found: Found) {
    setSending(true);
    setSendFailed(false);
    const outcome = await requestConnection(found.accountId);
    setSending(false);
    const next = stateOfRequest(found, outcome);
    if (next.kind === "failed") setSendFailed(true);
    else setState(next);
    if (outcome.ok) onAsked?.();
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
    // so rather than offering Ask to connect, which the server would refuse.
    setState(which === "accept" ? { kind: "found", found: { ...found, relation: "connected" } } : { kind: "found", found, answered: "dismissed" });
  }

  const found = state.kind === "found" ? state.found : null;
  const dismissed = state.kind === "found" && state.answered === "dismissed";
  const line = state.kind === "found" ? state.line : undefined;
  const first = found ? firstNameOf(found) : "";

  const input = (
    <input
      className={inline ? styles.addInput : styles.field}
      value={email}
      onChange={(event) => {
        setEmail(event.target.value);
        if (state.kind !== "empty") setState({ kind: "empty" });
      }}
      placeholder="Their email address"
      aria-label="Their email address"
      type="email"
      autoComplete="off"
      autoFocus={!inline}
    />
  );

  return (
    <>
      <form
        className={inline ? styles.add : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          void look();
        }}
      >
        {inline ? (
          <>
            <label className={styles.addField}>
              <Icon name="search" size={16} />
              {input}
            </label>
            {/* Not pressable until there is an address to look up, so a
                press is never silently dead. */}
            <button
              type="submit"
              className={`${styles.primary} ${styles.addFind}`}
              disabled={state.kind === "looking" || !email.includes("@")}
            >
              Find
            </button>
          </>
        ) : (
          input
        )}
      </form>
      {inline ? (
        <p className={styles.addCap}>They need to be on offload already. You can also share a thread and ask from there.</p>
      ) : null}

      {!inline && (state.kind === "empty" || state.kind === "looking") ? (
        <>
          <p className={styles.stepTitle}>You need their offload email</p>
          <p className={styles.emptyBody}>
            Sharing does not invite anyone in, so there is nobody to look up who is not already here. Ask them which email they signed up with.
          </p>
        </>
      ) : null}
      {state.kind === "none" ? (
        <div className={inline ? styles.addResult : undefined}>
          <p className={styles.stepTitle}>No offload account for that</p>
          <p className={styles.emptyBody}>Check the spelling. If they are not on offload, there is nothing here that can add them.</p>
        </div>
      ) : null}
      {state.kind === "limited" ? (
        <p className={inline ? styles.failed : styles.stepFailed} role="alert">
          {LOOKUP_LIMITED}
        </p>
      ) : null}
      {state.kind === "failed" ? (
        <p className={inline ? styles.failed : styles.stepFailed} role="alert">
          That didn&rsquo;t go through.{" "}
          <button type="button" className={styles.retryLink} onClick={() => void look()}>
            Try again
          </button>
        </p>
      ) : null}
      {found ? (
        <div className={inline ? styles.addResult : undefined}>
          <div className={styles.foundRow}>
            <button
              type="button"
              className={styles.door}
              aria-label={nameOf(found)}
              onClick={() => {
                if (found.relation === "you") return;
                onLeave?.();
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
            {!dismissed && found.relation === "you_asked" ? <span className={styles.personValue}>{since(found.since, zone)}</span> : null}
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
                {sendFailed ? "Try again" : "Ask to connect"}
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
        </div>
      ) : null}
    </>
  );
}
