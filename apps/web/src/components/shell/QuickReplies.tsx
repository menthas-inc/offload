"use client";

// 018. The design system's QuickReplies, answering/QuickReplies.jsx: a question
// offload asked, answerable with a tap. Inside the bubble, where 012's calendar
// control sits, because it acts on the sentence above it.
//
// **Values, not words.** A chip's label is offload's wording of a value the
// server already holds, written by the server; the client sends the index back
// and never sees the value. The last option is always the way out, drawn plain.
// No option is a primary here: a choice among values is a choice offload does
// not know the answer to, and dark ink would say it did.
//
// Five chips at most, wrapping to further rows. One group, named by the
// sentence that asked, so a screen reader hears what the chips answer. Each
// chip is the Chip contract's shape: drawn 30 tall, a 44 hit area around it,
// and the hit area is cancelled by a negative margin so two wrapped lines sit
// 30 apart in ink and meet at 44 in target.
//
// **The way out is not one of the values, so it never shares their line.** The
// values wrap among themselves, then a spacer breaks the row, then the plain
// options. Which line the way out landed on was otherwise a property of the
// labels rather than a decision. It carries an x because it cancels the
// question rather than answering it, and without a mark a borderless chip
// beside bordered ones reads as a value whose border failed to draw.

import { Icon } from "../Icon";
import styles from "../../app/(shell)/composer.module.css";

export interface QuickReplyOption {
  label: string;
  kind: "value" | "plain";
}

/** At most five, and the way out is always the last one kept. */
function fiveOf(options: QuickReplyOption[]): QuickReplyOption[] {
  if (options.length <= 5) return options;
  return [...options.slice(0, 4), options[options.length - 1]!];
}

export function QuickReplies({
  options,
  label,
  onPick,
  disabled = false,
  trailing,
}: {
  options: QuickReplyOption[];
  /** The sentence that asked, as the group's accessible name. */
  label: string;
  onPick: (index: number) => void;
  disabled?: boolean;
  /** 027. A control at the end of the last line, after the way out: Today's
   *  clock, which puts the question off rather than answering it. */
  trailing?: React.ReactNode;
}) {
  if (options.length === 0) return null;
  const shown = fiveOf(options);
  const values = shown.filter((option) => option.kind !== "plain");
  const ways = shown.filter((option) => option.kind === "plain");
  const reply = (option: QuickReplyOption) => (
    <button
      key={`${options.indexOf(option)}-${option.label}`}
      type="button"
      className={styles.quickReply}
      onClick={() => onPick(options.indexOf(option))}
      disabled={disabled}
    >
      {option.kind === "plain" ? (
        <span className={styles.quickReplyPlain}>
          <Icon name="x" size={13} />
          {option.label}
        </span>
      ) : (
        <span className={styles.quickReplyPill}>{option.label}</span>
      )}
    </button>
  );
  return (
    <div className={styles.quickReplyRow} role="group" aria-label={label}>
      {values.map(reply)}
      {ways.length > 0 ? <span className={styles.quickReplyBreak} /> : null}
      {ways.map(reply)}
      {trailing}
    </div>
  );
}
