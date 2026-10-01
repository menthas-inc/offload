"use client";

// 026. A forwarded email in the conversation, drawn as the person's own
// message since they sent it: the mail glyph, the subject as its first line
// and "Forwarded" as its meta, then the note they typed above it, kept to a
// few lines. Never the forwarded header: the rows it filed hold the email.

import { Icon } from "../Icon";
import styles from "../../app/(shell)/composer.module.css";

export function SentMail({ subject, note }: { subject: string; note: string }) {
  return (
    <>
      <span className={styles.mailHead}>
        <Icon name="mail" size={14} />
        <span className={styles.mailSubject}>{subject || "An email"}</span>
        <span className={styles.mailMeta}>Forwarded</span>
      </span>
      {note ? <span className={styles.mailBody}>{note}</span> : null}
    </>
  );
}
