"use client";

// The design system's Switch, forms/Switch.jsx: a 44 by 26 track that is ink
// when on, a paper knob, 200ms. The same contract, the same four props.
//
// **A native checkbox underneath, drawn over.** The kit's version is a span
// that listens for clicks, which a keyboard cannot reach and a screen reader
// announces as nothing. The input here is visually hidden and does the whole
// job of being a control: Space toggles it, Tab finds it, and it is announced
// as a switch with its state. The track is aria-hidden and only draws.
//
// **A label only when asked for one.** With `label` this is a whole settings
// row, as the kit's prompt note shows. Without it, it is a bare control for a
// row that already carries the title, and that row wraps it in the label that
// names it. Rendering a label of its own in that case would nest two, which
// is not HTML.

import styles from "./switch.module.css";

export function Switch({
  checked = false,
  onChange,
  disabled = false,
  label,
}: {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  /** Optional label rendered before the track; it flexes to fill a row. */
  label?: string;
}) {
  const control = (
    <>
      <input
        type="checkbox"
        role="switch"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
    </>
  );

  if (label) {
    return (
      <label className={styles.switch} data-disabled={disabled || undefined}>
        <span className={styles.label}>{label}</span>
        {control}
      </label>
    );
  }
  return (
    <span className={styles.switch} data-disabled={disabled || undefined}>
      {control}
    </span>
  );
}
