"use client";

// One choice of a few, drawn as the range picker is: a filter, a sort.

import styles from "../../admin.module.css";

export function Choice<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** What is being chosen, for a screen reader. */
  label: string;
  options: ReadonlyArray<{ value: Value; label: string }>;
  value: Value;
  onChange: (next: Value) => void;
}) {
  return (
    <span className={styles.seg} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={styles.segOption}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}
