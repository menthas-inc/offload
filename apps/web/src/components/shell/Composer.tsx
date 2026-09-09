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
  answerPending,
  DumpTooLong,
  endConversation,
  fetchCurrent,
  resumeDump,
  sendDump,
  undoTurn,
  type Answer,
  type FoundResult,
  type FoundRow,
  type MessageState,
  type TouchedThread,
} from "../../lib/dump";
import { Icon } from "../Icon";
import { AnswerResults } from "./AnswerResult";
import { completeContent } from "../../lib/threads";
import { Logo } from "../Logo";
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
  /** A calendar write offload proposed and nobody has answered yet. The reply
   *  carries the control that answers it, for the same reason it carries its
   *  own thread links and its own retry: a sentence cannot be clicked. */
  waiting?: { id: string; because: string } | null;
  /** Whether the turn actually did something, as opposed to answering.
   *
   *  From the same record the reply's links come from, never from the reply
   *  text: a sentence saying it did something is exactly what this exists to
   *  check rather than to trust. */
  did?: boolean;
  /** What an answer showed.
   *
   *  Only ever set on an answering turn, and empty on a dump. Resolved by the
   *  server on every read, so a row ticked or deleted elsewhere is never stale
   *  inside a reply from last week. */
  found?: FoundResult[];
}

interface Undoable {
  turnId: string;
  message: string;
}

export function Composer({
  onFiled,
}: {
  /** Called with the threads the turn actually wrote to, from the content rows
   *  it produced rather than from parsing the reply. The shell reloads the
   *  sidebar and hands the ids down so a screen already showing one of those
   *  threads updates itself instead of going stale behind a truthful reply. */
  onFiled: (threadIds: string[]) => void;
}) {
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
          const filed = (answer.threads?.length ?? 0) > 0;
          const next = current.map((turn) =>
            turn.id === messageId ? { ...turn, state: answer.state, did: filed } : turn,
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
                  found: answer.found,
                },
              ]
            : next;
        });
        // A dump can create a thread, so the sidebar is stale the moment this
        // lands. **`changed`, not `threads`**: a turn that moved a piece out of
        // the thread you are looking at changed it without filing anything into
        // it, and `threads` is only where things went. That gap is why a move
        // left the page showing a row that was not in it any more.
        if (answer.changed && answer.changed.length > 0) onFiled(answer.changed);
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
  /** Tick a row from inside an answer.
   *
   *  The ordinary per-row endpoint, not the turn Undo: the model wrote nothing
   *  and a person tapped a checkbox. Permission is re-checked on the server at
   *  the tap, so a result that has gone stale is refused rather than trusted.
   *
   *  Optimistic, and put back if the server refuses. A checkbox that waits for
   *  a round trip before moving reads as broken on a slow connection, and this
   *  is the one write an answer can do.
   */
  async function tick(turnId: string, row: FoundRow): Promise<void> {
    const next = !row.done;
    const apply = (done: boolean) =>
      setTurns((current) =>
        current.map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                found: turn.found?.map((result) => ({
                  ...result,
                  rows: result.rows.map((r) =>
                    r.contentId === row.contentId ? { ...r, done } : r,
                  ),
                })),
              }
            : turn,
        ),
      );

    apply(next);
    const ok = await completeContent(row.contentId, next);
    if (!ok) apply(row.done);
    // The thread pane beside this one is now stale. The same invalidation a
    // dump fires, for the same reason: a screen already showing that thread
    // updates itself instead of quietly disagreeing with the answer.
    else onFiled([row.threadId]);
  }

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
    // Undo touches the same threads the turn did, and the screen showing one
    // of them has to lose the rows again. The ids are not carried on the undo
    // itself, so this asks every open screen to refetch rather than naming
    // them: an empty list is "something changed, work out what".
    onFiled([]);
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
              no way to put it back.

              The mark rather than the kit's sparkles. This is offload talking,
              and sparkles is the glyph for anything offload derived, which is a
              different claim: it belongs on a tag it inferred, not on the
              product saying something. */}
          <Logo variant="mark" size={15} />
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
            onClick={() => {
              // Closing is a statement, not a tidy-up: this subject is over,
              // so the next dump starts a conversation rather than joining
              // this one however soon it arrives.
              setTurns([]);
              void endConversation();
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      ) : null}
      {live ? (
        <div className={styles.turns} ref={turnsBox}>
          {turns.map((turn) =>
            turn.from === "you" ? (
              <div
                key={turn.id}
                className={styles.turnYou}
                // The failure is carried by the turn itself, so the message you
                // wrote takes the clay border and the line sits under it.
                data-failed={
                  turn.state === "failed" || turn.state === "partial" ? true : undefined
                }
              >
                {turn.text}
                {turn.state === "seen" ? (
                  // 👀, ported from the mobile kit's StatusChip. The label is
                  // the readme's fuller string, because the marker has to say
                  // what it means to somebody who cannot see it.
                  <span className={styles.seen} aria-label="seen, not answered yet">
                    <span aria-hidden="true">👀</span>
                  </span>
                ) : null}
                {turn.state === "answered" && turn.did ? (
                  // The kit's Done badge, in the same place. A different state
                  // rather than a second version of the same one: 👀 means
                  // offload has it, this means it finished.
                  //
                  // **Done means something was done.** It used to mean the turn
                  // ended, so a question that got an answer and a request that
                  // was refused both wore a tick: "delete the EU with fam
                  // thread" came back "threads can't be deleted" under a green
                  // Done. Gated on the same record the Undo toast uses, which
                  // is what offload actually wrote rather than what it said.
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
              <div key={turn.id} className={styles.turn}>
              <div className={styles.turnOffload}>
                {turn.text}
                {/* A calendar write offload has not made yet. Without this the
                    proposal is announced and expires an hour later having done
                    nothing, which is the dead end this closes. */}
                {turn.waiting ? (
                  <Waiting
                    waiting={turn.waiting}
                    onAnswered={() =>
                      setTurns((current) =>
                        current.map((t) => (t.id === turn.id ? { ...t, waiting: null } : t))
                      )
                    }
                  />
                ) : null}
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
              {/* **Below the bubble, not inside it.** A row's hover fill bleeds
                  to its pane's padded edge by one space step, and a turn's own
                  horizontal padding is that same step, so inside a bubble the
                  two cancel and a square fill runs out under an 18px corner.
                  012's confirmation stays inside because it is one fixed
                  control; this is an unbounded list with a surface of its own. */}
              {turn.found && turn.found.length > 0 ? (
                <AnswerResults found={turn.found} onToggle={(row) => void tick(turn.id, row)} />
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

/** Confirm or decline a calendar write offload proposed.
 *
 *  **Names who finds out and nothing else.** The two controls beside it are the
 *  answer to "why is it asking", so a paragraph explaining would be offload
 *  diagnosing itself, which it does not do. */
function Waiting({
  waiting,
  onAnswered,
}: {
  waiting: { id: string; because: string };
  onAnswered: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function answer(choice: "confirm" | "decline") {
    if (busy) return;
    setBusy(true);
    const ok = await answerPending(waiting.id, choice);
    setBusy(false);
    if (ok) onAnswered();
    // What happened, next to the control that retries it. Never why: this
    // cannot tell an expired proposal from a dropped connection.
    else setFailed(true);
  }

  return (
    <span className={styles.waiting}>
      <span className={styles.waitingLine}>{waiting.because}</span>
      {failed ? (
        <span className={styles.waitingFailed} role="alert">
          That did not go through. Try again.
        </span>
      ) : null}
      <span className={styles.waitingControls}>
        <button
          type="button"
          className={styles.waitingConfirm}
          onClick={() => void answer("confirm")}
          disabled={busy}
        >
          Add it
        </button>
        <button
          type="button"
          className={styles.waitingDecline}
          onClick={() => void answer("decline")}
          disabled={busy}
        >
          Not now
        </button>
      </span>
    </span>
  );
}
