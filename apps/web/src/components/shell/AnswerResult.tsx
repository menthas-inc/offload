"use client";

// One read from an answer: the thread that holds the rows, the rows, one tail.
//
// A new part rather than `ContentRowView` with props bolted on. The thread page
// draws one thread and never needed to say which; an answer draws rows from
// anywhere and the thread is the header. Reusing the pane row would have meant
// carrying its swipe, its tools and its delete confirmation into a surface
// where none of them may exist.
//
// **Ticking is the only write a row here can do.** No delete, no archive, no
// rename. That is not tidiness: after 013 the model reads rows from every
// thread the asker is in, including text somebody else wrote, and the half of
// the defence that does not depend on the model behaving is that the surfaces
// it produces cannot destroy anything.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { DEFAULT_THREAD_ICON, foundMeta } from "@offload/widgets";
import { Icon } from "../Icon";
import { ThreadIcon } from "../ThreadIcon";
import { PhotoThumb } from "./PhotoThumb";
import { useClock } from "../../lib/clock";
import type { FoundResult, FoundRow, SliceNote } from "../../lib/dump";
import styles from "../../app/(shell)/answer.module.css";

/** This surface's default, passed in rather than reached for.
 *
 *  Eight on web, five on the phones, and the difference is measured rather than
 *  taste: the phones cap the conversation sheet at 78% of the screen, so eight
 *  rows plus a header and a control push the sentence that answers the question
 *  off the top edge. The web pane has roughly twice the height.
 *
 *  **It is a prop because the number belongs to the surface, not to the part.**
 *  A component that reaches for a module constant is one that cannot be drawn
 *  twice on a page, and the pane and the composer log are already two places
 *  with different room. The contract says `shown`, so this is the default and
 *  never the mechanism. */
export const ROWS_SHOWN = 8;

/** Which content types offer a tick.
 *
 *  A task is the thing somebody finishes. Ticking a note would be inventing a
 *  state the thread page does not have, and the row would then disagree with
 *  itself depending on where it was drawn. */
function tickable(type: string): boolean {
  return type === "task";
}

const TYPE_ICON: Record<string, string> = {
  task: "square-check-big",
  event: "calendar",
  link: "link",
  image: "image",
  screenshot: "image",
  voice: "mic",
  file: "paperclip",
  note: "text-quote",
};

export function AnswerResults({
  found,
  onToggle,
  shown = ROWS_SHOWN,
}: {
  found: FoundResult[];
  /** Absent draws the rows untickable, which is right for a fact. */
  onToggle?: (row: FoundRow) => void;
  /** Rows drawn before the tail. Defaults to this surface's number. */
  shown?: number;
}) {
  if (found.length === 0) return null;
  return (
    <div className={styles.results}>
      {found.map((result) => (
        <AnswerResult key={result.threadId} result={result} onToggle={onToggle} shown={shown} />
      ))}
    </div>
  );
}

/** One result, and since 052 one slice of a reply: the same card for a read
 *  and for where a dump landed. */
export function AnswerResult({
  result,
  onToggle,
  shown = ROWS_SHOWN,
  count,
  marked,
  notes = [],
  eyebrow,
  onOpen,
}: {
  result: FoundResult;
  onToggle?: (row: FoundRow) => void;
  /** 052. A reply's row opens its edit modal, as the phones open its sheet. */
  onOpen?: (row: FoundRow) => void;
  shown?: number;
  /** 052. The thread's open count; not drawn at zero. Absent counts the rows. */
  count?: number;
  /** 052. The rows and notes that take the change mark: only when the turn's
   *  result arrived on this screen, never on a load. */
  marked?: ReadonlySet<string>;
  /** 052. What the turn wrote about the thread, under Notes, in offload's voice. */
  notes?: SliceNote[];
  /** 052. Over the name: New thread, for a thread the turn started. */
  eyebrow?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { zone, today } = useClock();
  const drawn = expanded ? result.rows : result.rows.slice(0, shown);
  // The honest remainder of what actually arrived, never of what exists. A
  // truncated read did not fetch the rest, so there is nothing to expand into
  // and the tail becomes the thread instead.
  const more = result.rows.length - drawn.length;
  // 028. What is not in a thread is never named as one: no lasso, its own
  // words, and the full list where the thread would open.
  const loose = result.threadName === null;
  const href = loose ? "/threads/loose" : `/threads/${result.threadId}`;
  const counted = count ?? result.rows.length;
  const mark = (id: string) => (marked?.has(id) ? { "data-marked": true, className: styles.marked } : null);

  return (
    <div className={styles.card}>
      <Link href={href} className={styles.head}>
        {loose ? null : <ThreadIcon icon={result.threadIcon ?? DEFAULT_THREAD_ICON} hue={result.threadHue ?? 1} seed={result.threadId} size={18} round />}
        {eyebrow ? (
          <span className={styles.headStack}>
            <span className={styles.eyebrow}>{eyebrow}</span>
            <b className={styles.headNameNew}>{result.threadName}</b>
          </span>
        ) : (
          <b className={styles.headName}>{loose ? "Not in a thread" : result.threadName}</b>
        )}
        {counted > 0 ? <span className={styles.headCount}>{counted}</span> : null}
      </Link>

      {drawn.map((row) => (
        <div
          key={row.contentId}
          className={`${styles.row} ${row.done ? styles.done : ""} ${mark(row.contentId)?.className ?? ""}`}
          data-row
          data-marked={mark(row.contentId)?.["data-marked"]}
        >
          {onToggle && tickable(row.type) ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={row.done}
              // The name carries the thread. On the thread page a checkbox can
              // rely on the page for context; in an answer the rows come from
              // anywhere, and "checkbox, not checked" says nothing at all.
              aria-label={`${row.title}, ${row.threadName ?? "Not in a thread"}`}
              className={styles.tick}
              onClick={() => onToggle(row)}
            >
              <span className={styles.tickBox}>
                {row.done ? <Icon name="check" size={13} /> : null}
              </span>
            </button>
          ) : row.photo ? (
            // 020. The picture itself, where the thread page draws it.
            <PhotoThumb
              blobId={row.photo.blobId}
              ready={row.photo.ready}
              alt=""
              className={styles.tilePhoto}
              fallback={
                <span className={styles.tile} aria-hidden="true">
                  <Icon name={TYPE_ICON[row.type] ?? "image"} size={16} />
                </span>
              }
            />
          ) : (
            <span className={styles.tile} aria-hidden="true">
              <Icon name={TYPE_ICON[row.type] ?? "text-quote"} size={16} />
            </span>
          )}
          <Body className={styles.body} onOpen={onOpen ? () => onOpen(row) : undefined}>
            <b className={styles.title}>{row.title}</b>
            {/* 2026-10-13. The date under the title, in the chip's words: eight
                rows called Glass blowing class are told apart by nothing else. */}
            {foundMeta(row, zone, today) ? (
              <span className={styles.meta} data-meta>
                {foundMeta(row, zone, today)}
              </span>
            ) : null}
          </Body>
        </div>
      ))}

      {notes.length > 0 ? (
        <div data-notes>
          <span className={styles.section}>Notes</span>
          {notes.map((note) => (
            <p
              key={note.id}
              className={`${styles.note} ${mark(note.id)?.className ?? ""}`}
              data-marked={mark(note.id)?.["data-marked"]}
            >
              {note.text}
            </p>
          ))}
        </div>
      ) : null}

      {/* Whichever tail is true, never both. There is more in hand, or the read
          hit its page and what was not read was not sent, so there is nothing
          to expand into and the thread is where the rest lives. */}
      {loose && (result.truncated || more > 0) ? (
        // 028. Not in a thread has no rest to expand into on this card: the
        // full list is where the rest lives, as it is on the phones.
        <Link href={href} className={styles.inThread}>
          <em className={styles.inThreadText}>
            {result.truncated ? "The rest of the answer is in the list." : `${more} more not in a thread.`}
          </em>
          <Icon name="chevron-right" size={15} className={styles.accent} />
        </Link>
      ) : result.truncated ? (
        <Link href={href} className={styles.inThread}>
          <ThreadIcon icon={result.threadIcon ?? DEFAULT_THREAD_ICON} hue={result.threadHue ?? 1} seed={result.threadId} size={18} round />
          <em className={styles.inThreadText}>The rest of the answer is in the thread.</em>
          <Icon name="chevron-right" size={15} className={styles.accent} />
        </Link>
      ) : more > 0 ? (
        <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
          <Icon name="chevron-down" size={15} />
          Show {more} more
        </button>
      ) : null}
    </div>
  );
}

/** A row's words: a button when the row opens, plain text otherwise. */
function Body({ className, onOpen, children }: { className: string; onOpen: (() => void) | undefined; children: ReactNode }) {
  return onOpen ? (
    <button type="button" className={`${className} ${styles.open}`} onClick={onOpen}>
      {children}
    </button>
  ) : (
    <span className={className}>{children}</span>
  );
}
