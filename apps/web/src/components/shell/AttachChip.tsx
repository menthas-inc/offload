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
import { clipMiddle } from "../../lib/dump";
import styles from "../../app/(shell)/composer.module.css";

export type ChipError = "too_big" | "not_a_photo" | "locked_pdf" | null;

const LINES: Record<Exclude<ChipError, null>, string> = {
  too_big: "Too big to send.",
  not_a_photo: "Only photos and PDFs.",
  // 041.
  locked_pdf: "Only unlocked PDFs.",
};

export function AttachChip({
  name,
  kind = "image",
  error,
  disabled,
  onRemove,
}: {
  name: string;
  /** 041. A PDF draws the paperclip, clips its name in the middle so its end
   *  survives, and says it is a PDF to a screen reader. */
  kind?: "image" | "pdf";
  error: ChipError;
  /** While the send is out: a chip removed then would still go. */
  disabled?: boolean;
  onRemove: () => void;
}) {
  const pdf = kind === "pdf";
  const shown = pdf ? clipMiddle(name) : name.length > 20 ? `${name.slice(0, 20)}…` : name;
  return (
    <span
      className={styles.chip}
      data-error={error ? true : undefined}
      role="group"
      aria-label={`${pdf ? "PDF" : "Photo"}, ${name}`}
    >
      <span className={styles.chipGlyph} aria-hidden="true">
        <Icon name={pdf ? "paperclip" : "image"} size={13} />
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
