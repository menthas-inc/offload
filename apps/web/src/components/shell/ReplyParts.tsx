"use client";

// 052. A turn's reply beside its words: where the dump landed, as slices, then
// what it left out as pills, where it read, and the way back.
//
// **Drawn from the turn's record, never from the sentence.** The server sends
// ids and kinds resolved as the reader, now; every word here comes from
// `@offload/widgets` or the rows as stored (AC-23). Order is fixed: slices,
// the Also line, the turn's labels, pills, the source line, the undo line.
// The question, when there is one, is the composer's, after all of it.
//
// It replaces `TurnFooter`. The Done mark said that something happened; the
// slices show what.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  UNDO_MS,
  alsoLine,
  calendarColour,
  directionsUrl,
  memoryKind,
  pillLabel,
  shownText,
  sourceLine,
  summaryWords,
  type Pill,
  type ReplySummary,
} from "@offload/widgets";
import { Icon } from "../Icon";
import { LabelMark } from "../labels/LabelMark";
import { AnswerResult } from "./AnswerResult";
import { CalendarSlice } from "./CalendarSlice";
import { UndoLine } from "./UndoLine";
import { LineAt } from "./InPlace";
import { webHref } from "../../lib/links";
import { fetchOne } from "../../lib/threads";
import type { FoundRow, Parts, Slice, SliceThread, Source } from "../../lib/dump";
import answer from "../../app/(shell)/answer.module.css";
import composer from "../../app/(shell)/composer.module.css";
import styles from "../../app/(shell)/reply-parts.module.css";

/** The undo line's state, held by the composer. */
export interface TurnUndo {
  /** Undo is drawn: the turn is the conversation's latest, and its own. */
  open: boolean;
  /** When the result arrived here, so the first eight seconds carry the clock. */
  since: number;
  /** The Undo did not land: the turn is back and the line offers Retry. */
  failed?: boolean;
  /** A late Undo landed: the slices fold to this line. */
  undone?: string | null;
  /** A late Undo asks first: the outward line, with its yes and its no. */
  ask?: string | null;
}

const MAX_SLICES = 3;
const MAX_PILLS = 2;
/** The turn's labels, three and then a count, as the footer drew them. */
const MAX_LABELS = 3;

const SUMMARY_ICON: Record<ReplySummary["kind"], string> = {
  new: "plus",
  added: "plus",
  started: "plus",
  filed: "lasso",
  moved: "lasso",
  ticked: "check",
  changed: "pencil",
  remembered: "brain",
};

const PILL_ICON: Record<Pill["kind"], string> = {
  date: "calendar",
  calendar: "calendar",
  remind: "bell",
  share: "user-plus",
  directions: "map-pin",
};

export function ReplyParts({
  turnId,
  parts,
  sources = [],
  labels = [],
  live = false,
  undo,
  onUndo,
  onAsk,
  onToggle,
  onOpen,
  onPill,
  onChanged,
}: {
  turnId: string;
  parts: Parts;
  sources?: Source[];
  labels?: { id: string; name: string; colour: number }[];
  /** The result arrived on this screen: the change mark plays. */
  live?: boolean;
  undo: TurnUndo;
  onUndo: () => void;
  onAsk: (yes: boolean) => void;
  onToggle?: (row: FoundRow) => void;
  onOpen?: (row: FoundRow) => void;
  /** True when the pill did its job and can go. */
  onPill: (pill: Pill) => Promise<boolean>;
  /** A row was ticked inside a calendar slice. */
  onChanged?: () => void;
}) {
  const [used, setUsed] = useState<ReadonlySet<Pill["kind"]>>(new Set());

  if (undo.undone) {
    // A late Undo kept the dump and took back the filing: one line, in place
    // of everything the filing drew.
    return (
      <div className={styles.parts}>
        <p className={styles.undone} data-part="undone" role="status">
          {undo.undone}
        </p>
      </div>
    );
  }

  // 028. What is not in a thread is never named as one.
  const also = alsoLine(parts.also.map((thread) => ({ id: thread.id, name: thread.name ?? "Not in a thread", loose: thread.name === null })));
  const pills = parts.pills.filter((pill) => !used.has(pill.kind)).slice(0, MAX_PILLS);
  const source = sourceLine(sources);
  const marks = labels.slice(0, MAX_LABELS);

  return (
    <div className={styles.parts}>
      {parts.slices.slice(0, MAX_SLICES).map((slice, at) => (
        <div key={at} data-part="slice">
          <SliceView slice={slice} live={live} onToggle={onToggle} onOpen={onOpen} onChanged={onChanged} />
        </div>
      ))}

      {also ? (
        <p className={styles.also} data-part="also">
          {also.lead}{" "}
          {also.threads.map((thread, at) => (
            <span key={thread.id}>
              {at > 0 ? ", " : null}
              <Link href={thread.loose ? "/threads/loose" : `/threads/${thread.id}`} className={styles.alsoLink}>
                {thread.name}
              </Link>
            </span>
          ))}
        </p>
      ) : null}

      {/* 025. What the turn applied: slice rows do not carry labels. */}
      {marks.length > 0 ? (
        <div className={styles.labels} data-part="labels">
          {marks.map((label) => (
            <LabelMark key={label.id} color={label.colour} size={30}>
              {label.name}
            </LabelMark>
          ))}
          {labels.length > marks.length ? <span className={styles.more}>and {labels.length - marks.length} more</span> : null}
        </div>
      ) : null}

      {pills.length > 0 ? (
        <div className={composer.quickReplyRow} data-part="pills">
          {pills.map((pill) =>
            pill.kind === "directions" ? (
              <DirectionsPill key={pill.kind} rowId={pill.rowId} />
            ) : (
              <button
                key={pill.kind}
                type="button"
                className={composer.quickReply}
                onClick={() => {
                  void onPill(pill).then((done) => {
                    if (done) setUsed((now) => new Set(now).add(pill.kind));
                  });
                }}
              >
                <span className={`${composer.quickReplyPill} ${styles.pill}`}>
                  {pill.kind === "calendar" && calendarColour(pill.calendar?.colour) ? (
                    <span className={styles.dot} style={{ background: calendarColour(pill.calendar?.colour)! }} aria-hidden="true" />
                  ) : (
                    <Icon name={PILL_ICON[pill.kind]} size={13} className={styles.pillGlyph} />
                  )}
                  {pillLabel(pill)}
                </span>
              </button>
            ),
          )}
        </div>
      ) : null}
      {/* A pill's own eight seconds, under the pills. */}
      <LineAt id={`pill:${turnId}`} />

      {/* An anchor rather than a control, because this one leaves the app,
          and **the only external link in the conversation**: a domain from
          the record of what was read, never a word the page chose (016). */}
      {source ? (
        <p className={styles.sources} data-part="sources">
          <Icon name="link" size={12} />
          {source.shown.map((one, at) => (
            <span key={one.url}>
              {at > 0 ? ", " : null}
              <a href={webHref(one.url)} target="_blank" rel="noreferrer noopener" className={styles.source}>
                {one.domain}
              </a>
            </span>
          ))}
          {source.more ? <span> {source.more}</span> : null}
        </p>
      ) : null}

      {parts.summary ? <TurnLine turnId={turnId} summary={parts.summary} undo={undo} onUndo={onUndo} onAsk={onAsk} /> : null}
    </div>
  );
}

function SliceView({
  slice,
  live,
  onToggle,
  onOpen,
  onChanged,
}: {
  slice: Slice;
  live: boolean;
  onToggle?: ((row: FoundRow) => void) | undefined;
  onOpen?: ((row: FoundRow) => void) | undefined;
  onChanged?: (() => void) | undefined;
}) {
  switch (slice.kind) {
    case "list":
      return (
        <AnswerResult
          result={asResult(slice.thread, slice.rows, slice.truncated)}
          count={slice.openCount}
          marked={live ? new Set([...slice.marked, ...slice.notes.filter((n) => n.marked).map((n) => n.id)]) : undefined}
          notes={slice.notes}
          {...(onToggle ? { onToggle } : {})}
          {...(onOpen ? { onOpen } : {})}
        />
      );
    case "newThread":
      return (
        <AnswerResult
          result={asResult(slice.thread, slice.rows, false)}
          count={0}
          eyebrow="New thread"
          // Everything in a thread the turn started is the turn's.
          marked={live ? new Set([...slice.rows.map((r) => r.contentId), ...slice.notes.map((n) => n.id)]) : undefined}
          notes={slice.notes}
          {...(onToggle ? { onToggle } : {})}
          {...(onOpen ? { onOpen } : {})}
        />
      );
    case "memories": {
      const kind = memoryKind(slice.memoryKind);
      return (
        <div className={answer.card}>
          <Link href="/memories" className={answer.head}>
            <Icon name={kind?.glyph ?? "cloudy"} size={16} />
            <b className={answer.headName}>{kind ? `Memories, ${kind.name}` : "Memories"}</b>
          </Link>
          <div className={styles.chips}>
            {slice.memories.map((memory) => (
              <span
                key={memory.id}
                className={`${styles.memory} ${live && memory.marked ? answer.marked : ""}`}
                data-marked={live && memory.marked ? true : undefined}
              >
                {shownText(memory.text)}
              </span>
            ))}
          </div>
        </div>
      );
    }
    case "calendar":
      return <CalendarSlice slice={slice} live={live} {...(onChanged ? { onChanged } : {})} />;
    case "removed":
      return <p className={styles.removed}>Since removed</p>;
  }
}

/** A slice's thread and rows in the shape the answer card reads. */
function asResult(thread: SliceThread, rows: FoundRow[], truncated: boolean) {
  return { threadId: thread.id, threadName: thread.name, threadIcon: thread.icon, threadHue: thread.hue, truncated, rows };
}

/** Directions to the one entry's place, which the pill does not carry: read
 *  once, and drawn as the link once it is known. */
function DirectionsPill({ rowId }: { rowId: string | undefined }) {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (!rowId) return;
    let live = true;
    void fetchOne(rowId).then((row) => {
      const at = row?.place;
      if (live && at && at.lat !== null && at.lng !== null) setHref(directionsUrl({ lat: at.lat, lng: at.lng, googlePlaceId: null }));
    });
    return () => {
      live = false;
    };
  }, [rowId]);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={composer.quickReply}>
      <span className={`${composer.quickReplyPill} ${styles.pill}`}>
        <Icon name="map-pin" size={13} className={styles.pillGlyph} />
        Directions
      </span>
    </a>
  );
}

/** The undo line's `turn` form: what the turn did, and Undo until the next
 *  dump, with 043's clock for its first eight seconds. */
function TurnLine({
  turnId,
  summary,
  undo,
  onUndo,
  onAsk,
}: {
  turnId: string;
  summary: ReplySummary;
  undo: TurnUndo;
  onUndo: () => void;
  onAsk: (yes: boolean) => void;
}) {
  const left = UNDO_MS - (Date.now() - undo.since);
  const [late, setLate] = useState(left <= 0);
  useEffect(() => {
    if (late) return;
    const timer = setTimeout(() => setLate(true), Math.max(0, left));
    return () => clearTimeout(timer);
  }, [late, left]);

  if (undo.ask) {
    return (
      <span className={`${composer.waiting} ${styles.ask}`} data-part="undo">
        <span className={composer.waitingLine}>{undo.ask}</span>
        <span className={composer.waitingControls}>
          <button type="button" className={composer.waitingConfirm} onClick={() => onAsk(true)}>
            Remove it
          </button>
          <button type="button" className={composer.waitingDecline} onClick={() => onAsk(false)}>
            Not now
          </button>
        </span>
      </span>
    );
  }

  return (
    <div data-part="undo">
      <UndoLine
        form="turn"
        clock={undo.open && !late}
        entry={{
          id: `turn:${turnId}`,
          message: undo.failed ? "Couldn't put that back" : summaryWords(summary),
          icon: SUMMARY_ICON[summary.kind],
          form: "under",
          failed: undo.failed === true,
          startedAt: undo.since,
          ...(undo.open ? { action: { label: undo.failed ? "Retry" : "Undo", onPress: onUndo } } : {}),
        }}
      />
    </div>
  );
}
