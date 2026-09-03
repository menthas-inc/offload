"use client";

// The composer, under every pane and belonging to none of them.
//
// The kit says it plainly: "one composer, under both panes, spanning the
// window. It never belongs to a pane." The reason is in the readme rather than
// the kit: **the composer is a tool rather than a chat**, and any UI task in
// offload can be said instead of tapped. A place you can say things cannot be
// one tab, because then half the app has no way to be spoken to.
//
// Everything here was on Today until 005 gave the app a shell. The dump, the
// 👀 marker, the failed and partial states, the resume and the Undo all work
// exactly as 003 and 004 built them; what changed is where they live and that
// the reply now links to the threads offload actually wrote to.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  awaitAnswer,
  DumpTooLong,
  fetchCurrent,
  resumeDump,
  sendDump,
  undoTurn,
  type Answer,
  type MessageState,
  type TouchedThread,
} from "../../lib/dump";
import { Icon } from "../Icon";
import { FILL_COMPOSER } from "../panes/Today";
import styles from "../../app/(shell)/composer.module.css";

/** OFF-6 and the readme: eight seconds, up from four, because four is not
 *  enough time to read a toast, reach for a pointer or hear a screen reader
 *  announce it. */
const UNDO_WINDOW_MS = 8_000;

interface Turn {
  id: string;
  from: "you" | "offload";
  text: string;
  state?: MessageState;
  turnId?: string;
  /** Where offload actually filed things, from the record rather than from the
   *  sentence. This is what makes the reply's thread names clickable and what
   *  makes them true. */
  threads?: TouchedThread[];
}

interface Undoable {
  turnId: string;
  message: string;
}

export function Composer({ onFiled }: { onFiled: () => void }) {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false);
  const [tooLong, setTooLong] = useState<number | null>(null);
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const turnsBox = useRef<HTMLDivElement>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keyed by message, so a settled stream drops its own entry. A plain array
  // grew for the life of the tab.
  const cancels = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    const list = cancels.current;
    return () => {
      for (const cancel of list.values()) cancel();
      list.clear();
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  // A new turn scrolls the conversation to the bottom. Without it the reply
  // arrives below the fold and the composer looks like it did nothing, which is
  // the same failure as not delivering it at all.
  useEffect(() => {
    const box = turnsBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [turns]);

  // Today's examples fill the field rather than submitting it, and they reach
  // it through an event because the composer is nobody's child any more. One
  // message crosses this boundary; a store would be scaffolding for one
  // message, and building it before there is a second is how a codebase grows
  // machinery nobody needs.
  useEffect(() => {
    const fill = (event: Event) => {
      setDraft((event as CustomEvent<string>).detail);
      input.current?.focus();
    };
    window.addEventListener(FILL_COMPOSER, fill);
    return () => window.removeEventListener(FILL_COMPOSER, fill);
  }, []);

  // Rebuild the conversation on load and pick up anything still unanswered. A
  // dump sent just before the tab closed is in the database either way; this is
  // what makes it visible again.
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
      // No toast on hydration. The eight seconds belongs to the moment offload
      // answered, and a reload an hour later is not that moment.
      for (const message of messages) {
        if (message.role !== "person" || message.state !== "seen") continue;
        watch(message.id, message.turnId);
      }
    });
    return () => {
      live = false;
    };
    // Mount only, deliberately. This rebuilds the conversation once; rerunning
    // it on any dependency would refetch the tail and re-attach streams to
    // messages already being watched.
  }, []);

  function offerUndo(turnId: string | undefined, reply: string): void {
    if (!turnId) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoable({ turnId, message: reply });
    undoTimer.current = setTimeout(() => setUndoable(null), UNDO_WINDOW_MS);
  }

  /** Wait for one message's answer, wherever the waiting started.
   *
   *  Written once. This block existed twice, identical apart from the id it
   *  closed over, which is how the two would have drifted. */
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
                  threads: answer.threads,
                },
              ]
            : next;
        });
        // A dump can create a thread, so the sidebar is stale the moment this
        // lands.
        if (answer.threads && answer.threads.length > 0) onFiled();
        // Only a finished turn offers a way back. A partial one offers a way
        // forward, and both at once would ask somebody to choose between
        // finishing and undoing inside eight seconds.
        if (answer.state === "answered" && answer.reply) offerUndo(turnId, answer.reply);
      }),
    );
  }

  async function submit(): Promise<void> {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setTooLong(null);
    // Idempotency. A retry after the browser gave up on the response returns
    // the message the server already made rather than a second one.
    const clientKey = crypto.randomUUID();

    try {
      const sent = await sendDump(text, clientKey);
      setDraft("");
      setTurns((current) => [
        ...current,
        { id: sent.messageId, from: "you", text, state: sent.state, turnId: sent.turnId },
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
   *  they can see it. */
  function retry(messageId: string): void {
    const failed = turns.find((turn) => turn.id === messageId);
    if (!failed) return;
    setTurns((current) => current.filter((turn) => turn.id !== messageId));
    setDraft(failed.text);
    input.current?.focus();
  }

  /** Something landed and something did not. Ask offload to do the rest.
   *
   *  Not a re-send: part of it is already in a thread, and sending it again
   *  would file that part twice. */
  async function finish(messageId: string): Promise<void> {
    const sent = await resumeDump(messageId);
    if (!sent) return;
    setTurns((current) =>
      current
        .filter((turn) => turn.id !== `${messageId}-reply`)
        .map((turn) => (turn.id === messageId ? { ...turn, state: sent.state } : turn)),
    );
    watch(messageId, sent.turnId);
  }

  async function undo(): Promise<void> {
    if (!undoable) return;
    const { turnId } = undoable;
    setUndoable(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    // Optimistic, and safe to be: the rows are soft-deleted server-side and a
    // failed call leaves the conversation as the database has it on next load.
    setTurns((current) => current.filter((turn) => turn.turnId !== turnId));
    await undoTurn(turnId);
    onFiled();
  }

  const live = turns.length > 0;
  const waiting = turns.some((turn) => turn.from === "you" && turn.state === "seen");

  return (
    <div className={styles.composer}>
      {undoable ? (
        <div className={styles.toast} role="status">
          <span className={styles.toastMessage}>{undoable.message}</span>
          <button type="button" className={styles.toastAction} onClick={() => void undo()}>
            Undo
          </button>
        </div>
      ) : null}

      <div className={styles.card}>
      {live ? (
        <div className={styles.liveHead}>
          {/* The kit's header for an open conversation: what it is about, and
              two ways out of it. Without these the composer grows and there is
              no way to put it back. */}
          <Icon name="sparkles" size={15} className={styles.liveMark} />
          <b className={styles.liveTitle}>{conversationTitle(turns)}</b>
          <button
            type="button"
            className={styles.quiet}
            aria-label="Open full"
            title="A conversation of its own is not built yet"
            disabled
            aria-disabled="true"
          >
            <Icon name="maximize-2" size={16} />
          </button>
          <button
            type="button"
            className={styles.quiet}
            aria-label="Close this conversation"
            title="Close"
            onClick={() => setTurns([])}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      ) : null}
      {live ? (
        <div className={styles.turns} ref={turnsBox}>
          {turns.map((turn) =>
            turn.from === "you" ? (
              <div key={turn.id} className={styles.turnYou}>
                {turn.text}
                {turn.state === "seen" ? (
                  // 👀, ported from the mobile kit's StatusChip. The label is
                  // the readme's fuller string, because the marker has to say
                  // what it means to somebody who cannot see it.
                  <span className={styles.seen} aria-label="seen, not answered yet">
                    <span aria-hidden="true">👀</span>
                  </span>
                ) : null}
                {turn.state === "answered" ? (
                  // The kit's Done badge, in the same place. A different state
                  // rather than a second version of the same one: 👀 means
                  // offload has it, this means it finished.
                  <span className={styles.done}>
                    <Icon name="check" size={11} />
                    Done
                  </span>
                ) : null}
                {turn.state === "failed" ? (
                  <p className={styles.turnFailed} role="alert">
                    offload could not answer that one. Your dump is saved.{" "}
                    <button type="button" className={styles.retry} onClick={() => retry(turn.id)}>
                      Try again
                    </button>
                  </p>
                ) : null}
                {turn.state === "partial" ? (
                  // The same treatment as failed and for the same reason: a
                  // toast would take the only way forward with it. Different
                  // words, because some of this is already filed and saying so
                  // is what stops somebody re-sending and filing half twice.
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
                {/* Where it actually went, from the record rather than from the
                    sentence. offload naming a thread it did not write to is the
                    failure 004 exists to prevent, so these come from the
                    content rows and not from parsing the reply. */}
                {turn.threads && turn.threads.length > 0 ? (
                  <span className={styles.wentTo}>
                    {turn.threads.map((thread) => (
                      <Link
                        key={thread.id}
                        href={`/threads/${thread.id}`}
                        className={styles.threadLink}
                      >
                        <Icon name="lasso" size={13} />
                        {thread.name}
                      </Link>
                    ))}
                  </span>
                ) : null}
              </div>
            ),
          )}

          {/* One live region for the whole exchange, polite, announced once per
              transition rather than per frame. */}
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
        {/* Photo and voice, drawn and inert. Attachments are text-only until
            blobs exist, and the kit's composer is three affordances and a
            field: shipping one of them leaves a different object. */}
        <button
          type="button"
          className={styles.quiet}
          disabled
          aria-disabled="true"
          aria-label="Add a photo"
          title="Photos are not built yet"
        >
          <Icon name="camera" size={17} />
        </button>
        <button
          type="button"
          className={styles.quiet}
          disabled
          aria-disabled="true"
          aria-label="Record a voice note"
          title="Voice notes are not built yet"
        >
          <Icon name="mic" size={17} />
        </button>
        <button
          type="button"
          className={styles.send}
          disabled={draft.trim().length === 0 || sending}
          aria-label="Send"
          onClick={() => void submit()}
        >
          <Icon name="arrow-up" size={17} />
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

/** What this conversation is about, for the composer's own header.
 *
 *  The first thing you said, truncated. The kit shows a thread name because its
 *  fixture has one; a real conversation is not about a thread yet, and offload
 *  does not title conversations, so the honest label is your own opening line.
 *  When something names a conversation, this is where that name goes. */
function conversationTitle(turns: Turn[]): string {
  const first = turns.find((turn) => turn.from === "you");
  if (!first) return "This conversation";
  return first.text.length > 70 ? `${first.text.slice(0, 70)}…` : first.text;
}
