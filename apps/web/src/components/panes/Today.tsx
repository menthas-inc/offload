"use client";

// Today, as a pane inside the shell.
//
// Was a standalone page until 005 gave the app a shell. What changed is the
// wrapper and nothing else: the composer, the live conversation, the seen
// marker, the failed and partial states and their Undo all work exactly as 003
// and 004 built them.
//
// **The composer is still here rather than in the shell**, and the kit says
// otherwise: "one composer, under both panes, spanning the window. It never
// belongs to a pane." That is right and it is not done, because moving it is a
// change to the working dump loop for no gain in what 005 is for. Logged in the
// design system's decisions.md rather than left as a silent difference. The
// consequence to live with: you go back to Today to dump something.
//
// Today, on day one, with a composer that answers.
//
// The empty state is not a zero and not an illustration of one. It is an
// invitation in offload's own voice plus three dashed examples, and tapping an
// example fills the composer rather than submitting it. The first thing that
// lands in an account should be something the person meant, not a sample.
//
// Once something is sent the composer grows into a conversation, which is the
// kit's live state: the turns sit above the field, in the same box, and the
// field stays where it was so nothing moves under the cursor.
//
// **The composer lives on this page, not in the app shell.** The kit's own note
// says it belongs under both panes and never to one, and that is right; there
// is nowhere else to navigate to yet, so lifting it now would be carrying a
// layout for a screen that does not exist. Stated as a limitation in the spec
// rather than left to be discovered: there is no conversation list and no full
// pane, so the live composer is the only way back to a conversation.

import { useEffect, useRef, useState } from "react";
import { AdminLink } from "../AdminLink";
import { useMe } from "../../lib/use-me";
import {
  awaitAnswer,
  DumpTooLong,
  fetchCurrent,
  resumeDump,
  sendDump,
  undoTurn,
  type Answer,
  type MessageState,
} from "../../lib/dump";
import styles from "../../app/(app)/auth.module.css";

// The kit's three, verbatim, and the same three both phones show from
// apps/mobile/lib/gate.ts. Web had invented its own set and its own
// invitation line, which is the drift the shared copy on mobile exists to
// stop, except nothing shared it with web. Until there is one source both
// clients read, these have to be kept identical by hand.
const EXAMPLES = [
  "Book the Alfama flat for the 14th",
  "Ana can only travel the 14th to the 17th",
  "Oak brackets, 30cm, matte black",
] as const;

const DAY_ONE_INVITATION =
  "Dump anything and offload will sort it. You do not need to pick a place for it, or name it, or come back and tidy it up.";

interface Turn {
  id: string;
  from: "you" | "offload";
  text: string;
  state?: MessageState;
  /** The undo unit. Every row in one turn carries the same one. */
  turnId?: string;
}

/** What the toast offers to take back.
 *
 *  Eight seconds, per OFF-6 and the readme, up from four because four is not
 *  enough time to read a toast, reach for a pointer or hear a screen reader
 *  announce it. */
const UNDO_WINDOW_MS = 8_000;

interface Undoable {
  turnId: string;
  message: string;
}

export function Today() {
  const state = useMe("shell");
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false);
  const [tooLong, setTooLong] = useState<number | null>(null);
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Keyed by message, so a settled stream drops its own entry. A plain array
  // grew for the life of the tab: harmless per call, since closing a closed
  // EventSource is a no-op, but an unbounded pile of closures on a page
  // somebody leaves open all day.
  const cancels = useRef<Map<string, () => void>>(new Map());

  // An EventSource left open holds a connection the server pays to keep alive,
  // and React mounts twice in development.
  useEffect(() => {
    const list = cancels.current;
    return () => {
      for (const cancel of list.values()) cancel();
      list.clear();
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  /** Offer the way back, for eight seconds.
   *
   *  The message names the threads from offload's own reply, so what the toast
   *  says and what the conversation says come from one source and cannot
   *  disagree. */
  function offerUndo(turnId: string | undefined, reply: string): void {
    if (!turnId) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoable({ turnId, message: reply });
    undoTimer.current = setTimeout(() => setUndoable(null), UNDO_WINDOW_MS);
  }

  // Rebuild the conversation on load, and pick up waiting on anything that is
  // still unanswered. A dump sent just before the tab closed is in the database
  // either way; this is what makes it visible again, and what makes a reload
  // mid-answer resume rather than lose the thread.
  useEffect(() => {
    let live = true;

    void fetchCurrent().then((messages) => {
      if (!live || messages.length === 0) return;

      setTurns(
        messages.map((message) => ({
          id: message.id,
          from: message.role === "person" ? "you" : "offload",
          text: message.text ?? "",
          state: message.state,
          turnId: message.turnId,
        })),
      );

      // No toast on hydration, deliberately. The eight seconds belongs to the
      // moment offload answered, and a reload an hour later is not that moment.
      for (const message of messages) {
        if (message.role !== "person" || message.state !== "seen") continue;
        watch(message.id, message.turnId);
      }
    });

    return () => {
      live = false;
    };
  }, []);

  /** Wait for one message's answer, wherever the waiting started.
   *
   *  Written once. This block existed twice, identical apart from the id it
   *  closed over: once for a dump just sent and once for a dump found still
   *  unanswered on load. Undo would have landed in one of them. */
  function watch(messageId: string, turnId: string | undefined): void {
    cancels.current.set(
      messageId,
      awaitAnswer(messageId, (answer: Answer) => {
        cancels.current.delete(messageId);
        setTurns((current) => {
          const next = current.map((turn) =>
            turn.id === messageId ? { ...turn, state: answer.state } : turn,
          );
          return answer.reply
            ? [
                ...next,
                {
                  id: `${messageId}-reply`,
                  from: "offload" as const,
                  text: answer.reply,
                  turnId,
                },
              ]
            : next;
        });
        // Only a finished turn offers a way back. A partial one offers a way
        // forward instead, and putting both on screen at once would ask
        // somebody to choose between finishing and undoing in eight seconds.
        if (answer.state === "answered" && answer.reply) offerUndo(turnId, answer.reply);
      }),
    );
  }

  async function submit(): Promise<void> {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setTooLong(null);
    // Idempotency. If this request is retried after the browser gave up on the
    // response, the server returns the message it already made rather than a
    // second one.
    const clientKey = crypto.randomUUID();

    try {
      const sent = await sendDump(text, clientKey);
      setDraft("");
      setTurns((current) => [
        ...current,
        {
          id: sent.messageId,
          from: "you",
          text,
          state: sent.state,
          turnId: sent.turnId,
        },
      ]);

      watch(sent.messageId, sent.turnId);
    } catch (error) {
      if (error instanceof DumpTooLong) setTooLong(error.maxChars);
      else setTooLong(null);
    } finally {
      setSending(false);
      input.current?.focus();
    }
  }

  /** Nothing landed, so there is nothing to resume. Put the text back where
   *  they can see it and let them send it again. */
  function retry(messageId: string): void {
    const failed = turns.find((turn) => turn.id === messageId);
    if (!failed) return;
    setTurns((current) => current.filter((turn) => turn.id !== messageId));
    setDraft(failed.text);
    input.current?.focus();
  }

  /** Something landed and something did not. Ask offload to do the rest.
   *
   *  Not a re-send: the dump is still where it was and part of it is already in
   *  a thread. Sending it again would file that part twice. */
  async function finish(messageId: string): Promise<void> {
    const sent = await resumeDump(messageId);
    if (!sent) return;
    setTurns((current) =>
      current
        // The partial reply goes. It described a turn that is being finished,
        // and leaving it above the new one reads as two separate answers.
        .filter((turn) => turn.id !== `${messageId}-reply`)
        .map((turn) =>
          turn.id === messageId ? { ...turn, state: sent.state } : turn,
        ),
    );
    watch(messageId, sent.turnId);
  }

  async function undo(): Promise<void> {
    if (!undoable) return;
    const { turnId } = undoable;
    setUndoable(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    // Optimistic, and safe to be: the rows are soft-deleted server-side and a
    // failed call leaves the conversation exactly as the database has it on the
    // next load. Waiting would leave the turn on screen for a round trip after
    // somebody asked for it to go.
    setTurns((current) => current.filter((turn) => turn.turnId !== turnId));
    await undoTurn(turnId);
  }

  if (state.status === "loading")
    return <div className={styles.todayPane} />;

  const live = turns.length > 0;
  const waiting = turns.some(
    (turn) => turn.from === "you" && turn.state === "seen",
  );

  return (
    <div className={styles.todayPane}>
      <AdminLink />

      {live ? null : (
        <div className={styles.today}>
          <p className={styles.emptyTitle}>{DAY_ONE_INVITATION}</p>

          <div className={styles.examples}>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className={styles.example}
                onClick={() => {
                  setDraft(example);
                  input.current?.focus();
                }}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.composer}>
        {live ? (
          <div className={styles.turns}>
            {turns.map((turn) =>
              turn.from === "you" ? (
                <div key={turn.id} className={styles.turnYou}>
                  {turn.text}
                  {turn.state === "seen" ? (
                    // 👀, ported from the mobile kit's StatusChip: the web kit
                    // draws a chip for done and has no branch for seen at all.
                    // The label is the readme's fuller string, not the kit's
                    // shorter "Seen", because the marker has to say what it
                    // means to somebody who cannot see it.
                    <span
                      className={styles.seen}
                      aria-label="seen, not answered yet"
                    >
                      <span aria-hidden="true">👀</span>
                    </span>
                  ) : null}
                  {turn.state === "failed" ? (
                    // Invented here. No kit draws a failed message, and this is
                    // inline and persistent rather than a toast: a toast clears
                    // itself after eight seconds and the person who stepped
                    // away would never learn their dump went unanswered.
                    <p className={styles.turnFailed} role="alert">
                      offload could not answer that one. Your dump is saved.{" "}
                      <button
                        type="button"
                        className={styles.retry}
                        onClick={() => retry(turn.id)}
                      >
                        Try again
                      </button>
                    </p>
                  ) : null}
                  {turn.state === "partial" ? (
                    // The same treatment as failed, and for the same reason: a
                    // toast would take the only way forward with it. Different
                    // words because the situations differ. Some of this is
                    // already filed, so the offer is to finish rather than to
                    // start again, and saying so is what stops somebody
                    // re-sending and filing half of it twice.
                    <p className={styles.turnFailed} role="alert">
                      offload did not finish that one.{" "}
                      <button
                        type="button"
                        className={styles.retry}
                        onClick={() => void finish(turn.id)}
                      >
                        Finish it
                      </button>
                    </p>
                  ) : null}
                </div>
              ) : (
                <div key={turn.id} className={styles.turnOffload}>
                  {turn.text}
                </div>
              ),
            )}

            {/* One live region for the whole exchange, polite, announced once
                per transition rather than per frame. Without it the thinking
                state and the answer are silent changes to a screen reader. */}
            <p className={styles.srOnly} role="status" aria-live="polite">
              {waiting
                ? "offload is thinking"
                : turns.at(-1)?.from === "offload"
                  ? "offload answered"
                  : ""}
            </p>

            {waiting ? (
              <div className={styles.writing} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>
        ) : null}

        {undoable ? (
          // The design system's Toast: ink bar, one action, floated above the
          // composer. role="status" rather than "alert", so it is announced
          // without interrupting, which is what a confirmation is.
          <div className={styles.toast} role="status">
            <span className={styles.toastMessage}>{undoable.message}</span>
            <button
              type="button"
              className={styles.toastAction}
              onClick={() => void undo()}
            >
              Undo
            </button>
          </div>
        ) : null}

        <div className={styles.composerInner}>
          <input
            ref={input}
            className={styles.composerInput}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Dump anything"
            aria-label="Dump anything"
            disabled={sending}
          />
          <button
            type="button"
            className={styles.send}
            disabled={draft.trim().length === 0 || sending}
            aria-label="Send"
            onClick={() => void submit()}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {tooLong ? (
          <p className={styles.composerError} role="alert">
            That is longer than offload can take in one go. The limit is{" "}
            {tooLong.toLocaleString()} characters.
          </p>
        ) : null}
      </div>
    </div>
  );
}
