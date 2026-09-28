"use client";

// `components/core/Chip.jsx` for the web: a 30px pill in a 44px target. With
// `label` it is a label's filter chip: neutral with the label's dot at rest,
// and the label's own solid when selected, so two picked read as two.

import styles from "./labels.module.css";
import { Icon } from "../Icon";
import { LabelDot } from "./LabelMark";

export function Chip({
  children,
  icon,
  label,
  selected = false,
  tone = "neutral",
  disabled = false,
  onClick,
  className,
}: {
  children: React.ReactNode;
  icon?: string;
  /** Which of the ten label colours, when this is a label's chip. */
  label?: number | undefined;
  selected?: boolean;
  tone?: "neutral" | "outline";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${styles.chipHit}${className ? ` ${className}` : ""}`}
      aria-pressed={onClick ? selected : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <span
        className={styles.chip}
        data-tone={tone}
        data-selected={selected && !disabled ? true : undefined}
        data-disabled={disabled ? true : undefined}
        data-colour={label}
      >
        {label ? <LabelDot colour={label} /> : null}
        {icon ? <Icon name={icon} size={14} /> : null}
        {children}
      </span>
    </button>
  );
}
