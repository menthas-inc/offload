"use client";

// 028. Where a thing could go, on its row: one button and a cross.
//
// From `LooseSuggestion` in ui_kits/mobile_app/LooseParts.jsx. *Move to* an
// existing thread on the moss soft ground with `lasso`, or *Create* a new one
// on paper with a dashed moss outline, `plus` and *new thread*. The whole
// button accepts. The thread's name inside is a label and never a link: the
// button's accessible name is the action, and the name is hidden from
// assistive tech so it is not read twice.

import { Icon } from "../Icon";
import { Faces } from "./Faces";
import { suggestionName, type Suggestion as Wire } from "../../lib/loose";
import styles from "./loose.module.css";

export function Suggestion({
  title,
  suggestion,
  onAccept,
  onDismiss,
}: {
  /** The row's title, for the button's name. */
  title: string;
  suggestion: Wire;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const move = suggestion.kind === "move";
  const name = move ? suggestion.thread.name : suggestion.proposal.name;
  return (
    <span className={styles.suggestion}>
      <button
        type="button"
        className={styles.suggest}
        data-kind={suggestion.kind}
        aria-label={suggestionName(title, suggestion)}
        onClick={onAccept}
      >
        <Icon name="sparkles" size={13} className={styles.spark} />
        <span>{move ? "Move to" : "Create"}</span>
        <span className={styles.name} aria-hidden="true">
          <Icon name={move ? "lasso" : "plus"} size={12} />
          <span className={styles.nameText}>{name}</span>
        </span>
        {move ? <Faces faces={suggestion.faces} more={suggestion.more} /> : <span>new thread</span>}
      </button>
      <button type="button" className={styles.dismiss} aria-label="Dismiss suggestion" onClick={onDismiss}>
        <Icon name="x" size={14} />
      </button>
    </span>
  );
}
