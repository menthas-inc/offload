"use client";

// 028. Where an entry could go, on its row: one button and a cross.
//
// From `LooseSuggestion` in ui_kits/mobile_app/LooseParts.jsx. *Move to* an
// existing thread on the moss soft ground with the thread's own icon, or *Create* a new one
// on paper with a dashed moss outline, `plus` and *new thread*. The whole
// button accepts. The thread's name inside is a label and never a link: the
// button's accessible name is the action, and the name is hidden from
// assistive tech so it is not read twice. The faces are hidden too, so a move
// into a shared thread is described by who will see it, in the phones' words.
//
// The button is the 44px target and draws nothing; the pill inside it is 32
// high, as `Chip` draws its 30 in 44.

import { useId } from "react";
import { Icon } from "../Icon";
import { ThreadIcon } from "../ThreadIcon";
import { Faces } from "./Faces";
import { sharedHint, suggestionName, type Suggestion as Wire } from "../../lib/loose";
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
  const hint = move ? sharedHint(suggestion) : undefined;
  const hintId = useId();
  return (
    <span className={styles.suggestion}>
      <button
        type="button"
        className={styles.suggestHit}
        data-kind={suggestion.kind}
        aria-label={suggestionName(title, suggestion)}
        aria-describedby={hint ? hintId : undefined}
        onClick={onAccept}
      >
        <span className={styles.suggest}>
          <Icon name="sparkles" size={13} className={styles.spark} />
          <span>{move ? "Move to" : "Create"}</span>
          <span className={styles.name} aria-hidden="true">
            {move ? <ThreadIcon icon={suggestion.thread.icon} hue={suggestion.thread.hue} seed={suggestion.thread.id} size={16} round /> : <Icon name="plus" size={12} />}
            <span className={styles.nameText}>{name}</span>
          </span>
          {move ? <Faces faces={suggestion.faces} more={suggestion.more} /> : <span>new thread</span>}
        </span>
      </button>
      {hint ? (
        <span id={hintId} hidden>
          {hint}
        </span>
      ) : null}
      <button type="button" className={styles.dismiss} aria-label="Dismiss suggestion" onClick={onDismiss}>
        <Icon name="x" size={14} />
      </button>
    </span>
  );
}
