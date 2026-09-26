"use client";

// 025. # picks a label, as @ picks a person: the thread's labels filtered as
// you type, three rows, each a dot, the name and its count. A # that matches
// no label by name offers one more row, New label "…", made when the message
// is sent. On Today there is no thread yet, so there is no list: the #word
// stays in the words and is applied where offload files it.

import styles from "../people/people.module.css";
import { LabelDot } from "./LabelMark";
import { Icon } from "../Icon";
import type { Label } from "../../lib/labels";

const NAME_CHARS = 24;

export function HashList({
  labels,
  query,
  onPick,
  onNew,
}: {
  labels: Label[];
  query: string;
  onPick: (label: Label) => void;
  onNew: (name: string) => void;
}) {
  const needle = query.trim().toLowerCase();
  const shown = labels.filter((label) => !needle || label.name.toLowerCase().includes(needle)).slice(0, 3);
  const exact = labels.some((label) => label.name.toLowerCase() === needle);
  const offerNew = needle.length > 0 && !exact && labels.length < 10 && [...query].length <= NAME_CHARS;
  if (shown.length === 0 && !offerNew) return null;
  return (
    <div className={styles.mentions} role="listbox" aria-label="Labels">
      {shown.map((label) => (
        <button
          key={label.id}
          type="button"
          role="option"
          aria-selected={false}
          className={styles.mentionRow}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(label)}
        >
          <LabelDot colour={label.colour} />
          <span style={{ flex: "1 1 auto" }}>{label.name}</span>
          <span style={{ color: "var(--text-tertiary)" }}>{label.count}</span>
        </button>
      ))}
      {offerNew ? (
        <button
          type="button"
          role="option"
          aria-selected={false}
          className={styles.mentionRow}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onNew(query.trim())}
        >
          <Icon name="plus" size={14} />
          <span>New label &ldquo;{query.trim()}&rdquo;</span>
        </button>
      ) : null}
    </div>
  );
}
