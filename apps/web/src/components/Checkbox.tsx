"use client";

// The design system's Checkbox, forms/Checkbox.jsx: a 20px box, ink with a
// stroked tick when ticked, inside a 44px target. A native checkbox
// underneath, drawn over, for the same reason `Switch` does it: the kit's span
// is reachable by nothing, and the input here is the whole control.
//
// **The label is the row's, not the box's.** Every caller wraps this in the
// `<label>` that names it, so the box carries `aria-label` only when it is
// drawn alone.

import styles from "./checkbox.module.css";

export function Checkbox({
  checked = false,
  onChange,
  disabled = false,
  label,
}: {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  /** The accessible name when nothing wraps the box in a label. */
  label?: string;
}) {
  return (
    <span className={styles.checkbox} data-disabled={disabled || undefined}>
      <input
        type="checkbox"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span className={styles.box} aria-hidden="true">
        {checked ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : null}
      </span>
    </span>
  );
}
