"use client";

// A photo waiting in the composer, from ui_kits/mobile_app/Composer.jsx.
//
// The web kit's composer draws no chips, so this is the phones' chip borrowed
// whole: the image glyph, the name clipped at twenty characters, and a remove
// control that is a plain glyph rather than an IconButton, because a 44px hit
// area inside a 26px chip bleeds its hover pill past the chip's own edge.
// One line under it when the photo was refused on the device, the failure
// table's own words, with the remove control as the way forward.

import { Icon } from "../Icon";
import styles from "../../app/(shell)/composer.module.css";

export type ChipError = "too_big" | "not_a_photo" | null;

const LINES: Record<Exclude<ChipError, null>, string> = {
  too_big: "Too big to send.",
  not_a_photo: "Only photos.",
};

export function AttachChip({
  name,
  error,
  disabled,
  onRemove,
}: {
  name: string;
  error: ChipError;
  /** While the send is out: a chip removed then would still go. */
  disabled?: boolean;
  onRemove: () => void;
}) {
  const shown = name.length > 20 ? `${name.slice(0, 20)}…` : name;
  return (
    <span className={styles.chip} data-error={error ? true : undefined}>
      <span className={styles.chipGlyph} aria-hidden="true">
        <Icon name="image" size={13} />
      </span>
      <span className={styles.chipName} title={name}>
        {shown}
      </span>
      {error ? (
        <span className={styles.chipLine} role="alert">
          {LINES[error]}
        </span>
      ) : null}
      <button
        type="button"
        className={styles.chipRemove}
        aria-label={`Remove ${name}`}
        title={`Remove ${name}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <Icon name="x" size={12} />
      </button>
    </span>
  );
}
