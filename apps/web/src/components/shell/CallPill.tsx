"use client";

// 2026-11-02 (the owner). A phone number in a photo's details, as one pill in
// the viewer, as on the phones. The number is on the pill, so where the tap
// leads shows before it. Not a pasted scheme (security review L22): the href
// is built here from the digits phoneIn read out of the caption, and from
// nothing else.

import { phoneIn, photoCaption } from "@offload/widgets";
import { Icon } from "../Icon";
import styles from "./callPill.module.css";

export function CallPill({ text }: { text: string | null | undefined }) {
  const phone = phoneIn(photoCaption(text));
  if (!phone) return null;
  return (
    <a className={styles.pill} href={phone.tel}>
      <Icon name="phone" size={13} className={styles.glyph} />
      Call {phone.shown}
    </a>
  );
}
