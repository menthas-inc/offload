"use client";

// A photo waiting in the composer, from ui_kits/mobile_app/Composer.jsx.
//
// The web kit's composer draws no chips, so this is the phones' chip borrowed
// whole: the image glyph, the name clipped at twenty characters, and a remove
// control that is a plain glyph rather than an IconButton, because a 44px hit
// area inside a 28px chip bleeds its hover pill past the chip's own edge.
// One line under it when the photo was refused on the device, the failure
// table's own words, with the remove control as the way forward.
//
// Ink blue with white words, and a photo shows a little of itself where the
// glyph was (owner, 2026-10-16: it should stand out against the field). A
// refused file keeps the quiet chip, so its line stays readable.

import { useEffect, useState } from "react";
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
  file,
  kind = "image",
  error,
  disabled,
  onRemove,
}: {
  name: string;
  /** The draft's own file, drawn small in place of the glyph. */
  file: File;
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
  const preview = usePreview(pdf || error ? null : file);
  return (
    <span
      className={styles.chip}
      data-error={error ? true : undefined}
      role="group"
      aria-label={`${pdf ? "PDF" : "Photo"}, ${name}`}
    >
      {preview ? (
        <img className={styles.chipThumb} src={preview} alt="" />
      ) : (
        <span className={styles.chipGlyph} aria-hidden="true">
          <Icon name={pdf ? "paperclip" : "image"} size={13} />
        </span>
      )}
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

/** An object URL for the photo while the chip is up, let go with it. */
function usePreview(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);
  return url;
}
