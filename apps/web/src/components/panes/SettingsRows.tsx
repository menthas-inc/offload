"use client";

// The two pieces every settings page is made of, on web.
//
// **The same vocabulary as the phones and deliberately not the same shape.**
// `SettingsDetail.jsx` draws boxed, fill-backed cards with inset dividers,
// which is what a phone list looks like; `WSettings.jsx` draws open blocks with
// a section label and no container at all, which is what the rest of this
// shell looks like. Forcing the phones' cards onto web would be a divergence
// from the kit dressed up as consistency.
//
// Two pieces, not the kits' five: the toggle, the danger tone and the radio
// group have no caller here, because every page that uses them is out of this
// feature's scope.

import Link from "next/link";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";

export function Group({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <section className={styles.settingsBlock}>
      {label ? <h2 className={styles.settingsLabel}>{label}</h2> : null}
      <div>{children}</div>
    </section>
  );
}

interface RowProps {
  title: string;
  note?: string | undefined;
  /** The current state, on the right. Absent rather than invented. */
  value?: string | undefined;
  icon?: string | undefined;
  /** A row that goes somewhere. Omit for one that only states something. */
  href?: string | undefined;
  last?: boolean;
}

export function Row({ title, note, value, icon, href, last }: RowProps) {
  const body = (
    <>
      {icon ? (
        <span className={styles.settingsIcon} aria-hidden="true">
          <Icon name={icon} size={15} />
        </span>
      ) : null}

      <span className={styles.settingsText}>
        <span className={styles.settingsTitle}>{title}</span>
        {note ? <span className={styles.settingsNote}>{note}</span> : null}
      </span>

      {value ? <span className={styles.settingsValue}>{value}</span> : null}
      {href ? (
        <span className={styles.settingsChevron} aria-hidden="true">
          <Icon name="chevron-right" size={15} />
        </span>
      ) : null}
    </>
  );

  const className = `${styles.settingsRow} ${last ? styles.settingsRowLast : ""}`;

  if (!href) {
    return <div className={className}>{body}</div>;
  }

  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}
