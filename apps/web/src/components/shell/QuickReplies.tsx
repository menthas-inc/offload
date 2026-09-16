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
// Five chips at most, wrapping to further rows. The kit drew three and the
// decision log records the change. One group, named by the sentence that
// asked, so a screen reader hears what the chips answer. Each chip is the
// Chip contract's shape: drawn 30 tall, a 44 hit area around it.

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
}: {
  options: QuickReplyOption[];
  /** The sentence that asked, as the group's accessible name. */
  label: string;
  onPick: (index: number) => void;
  disabled?: boolean;
}) {
  if (options.length === 0) return null;
  return (
    <div className={styles.quickReplyRow} role="group" aria-label={label}>
      {fiveOf(options).map((option, index) => (
        <button
          key={`${index}-${option.label}`}
          type="button"
          className={option.kind === "plain" ? styles.quickReplyPlain : styles.quickReply}
          onClick={() => onPick(options.indexOf(option))}
          disabled={disabled}
        >
          {option.kind === "plain" ? (
            option.label
          ) : (
            <span className={styles.quickReplyPill}>{option.label}</span>
          )}
        </button>
      ))}
    </div>
  );
}
