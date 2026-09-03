"use client";

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
import { AdminLink } from "../../../components/AdminLink";
import { useMe } from "../../../lib/use-me";
import { awaitAnswer, DumpTooLong, sendDump, type MessageState } from "../../../lib/dump";
import styles from "../auth.module.css";

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
}

export default function TodayPage() {
  const state = useMe("shell");
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false);
  const [tooLong, setTooLong] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const cancels = useRef<Array<() => void>>([]);

  // An EventSource left open holds a connection the server pays to keep alive,
  // and React mounts twice in development.
  useEffect(() => {
    const list = cancels.current;
    return () => {
      for (const cancel of list) cancel();
    };
  }, []);

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
        { id: sent.messageId, from: "you", text, state: sent.state },
      ]);

      cancels.current.push(
        awaitAnswer(sent.messageId, (answer) => {
          setTurns((current) => {
            const next = current.map((turn) =>
              turn.id === sent.messageId ? { ...turn, state: answer.state } : turn
            );
            return answer.reply
              ? [...next, { id: `${sent.messageId}-reply`, from: "offload" as const, text: answer.reply }]
              : next;
          });
        })
      );
    } catch (error) {
      if (error instanceof DumpTooLong) setTooLong(error.maxChars);
      else setTooLong(null);
    } finally {
      setSending(false);
      input.current?.focus();
    }
  }

  async function retry(messageId: string): Promise<void> {
    const failed = turns.find((turn) => turn.id === messageId);
    if (!failed) return;
    setTurns((current) => current.filter((turn) => turn.id !== messageId));
    setDraft(failed.text);
    input.current?.focus();
  }

  if (state.status === "loading") return <main className={styles.todayScreen} />;

  const live = turns.length > 0;
  const waiting = turns.some((turn) => turn.from === "you" && turn.state === "seen");

  return (
    <main className={styles.todayScreen}>
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
                    <span className={styles.seen} aria-label="seen, not answered yet">
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
                      <button type="button" className={styles.retry} onClick={() => void retry(turn.id)}>
                        Try again
                      </button>
                    </p>
                  ) : null}
                </div>
              ) : (
                <div key={turn.id} className={styles.turnOffload}>
                  {turn.text}
                </div>
              )
            )}

            {/* One live region for the whole exchange, polite, announced once
                per transition rather than per frame. Without it the thinking
                state and the answer are silent changes to a screen reader. */}
            <p className={styles.srOnly} role="status" aria-live="polite">
              {waiting ? "offload is thinking" : turns.at(-1)?.from === "offload" ? "offload answered" : ""}
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
    </main>
  );
}
