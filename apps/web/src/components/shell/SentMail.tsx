"use client";

// 026. A forwarded email in the conversation, drawn as the person's own
// message since they sent it: the mail glyph, the subject as its first line
// and "Forwarded" as its meta, then the email's text, which the bubble keeps
// to a few lines. The whole email is on the rows it filed.

import { Icon } from "../Icon";
import styles from "../../app/(shell)/composer.module.css";

export function SentMail({ subject, text }: { subject: string; text: string }) {
  return (
    <>
      <span className={styles.mailHead}>
        <Icon name="mail" size={14} />
        <span className={styles.mailSubject}>{subject || "An email"}</span>
        <span className={styles.mailMeta}>Forwarded</span>
      </span>
      {text ? <span className={styles.mailBody}>{text}</span> : null}
    </>
  );
}
