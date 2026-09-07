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

import { useEffect, useRef, useState } from "react";
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

/** A row whose value you can change. 011.
 *
 *  **It edits in place.** The kit draws a tappable Name row and does not say
 *  what tapping it opens; a dialog or a sixth route would both be more screen
 *  than one field needs, and the row already has somewhere to put it.
 *
 *  The empty case is caught here rather than by the server, so the message is
 *  the specific one (`AC-6`) instead of a generic failure. Everything else the
 *  server refuses gets the house failure line: one short clause and a control
 *  that acts on it, never a diagnosis. */
export function EditableRow({
  title,
  value,
  placeholder,
  maxLength,
  label,
  onSave,
  last,
}: {
  title: string;
  value: string | null;
  placeholder: string;
  maxLength: number;
  label: string;
  onSave: (next: string) => Promise<boolean>;
  last?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  function open() {
    setDraft(value ?? "");
    setError(null);
    setEditing(true);
  }

  function close() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    const next = draft.trim();
    if (next.length === 0) {
      setError("A name cannot be empty.");
      return;
    }
    if (next === value) {
      close();
      return;
    }

    setSaving(true);
    const saved = await onSave(next);
    setSaving(false);
    if (saved) close();
    else setError("That did not go through. Try again.");
  }

  const className = `${styles.settingsRow} ${last && !error ? styles.settingsRowLast : ""}`;

  if (!editing) {
    return (
      <div className={className}>
        <span className={styles.settingsText}>
          <span className={styles.settingsTitle}>{title}</span>
        </span>
        <span className={styles.settingsValue}>{value ?? "Not set"}</span>
        <button type="button" className={styles.settingsEditText} onClick={open}>
          {value ? "Change" : "Set"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={className}>
        <span className={styles.settingsText}>
          <span className={styles.settingsTitle}>{title}</span>
        </span>

        <span className={styles.settingsEdit}>
          <input
            ref={field}
            className={styles.settingsInput}
            type="text"
            value={draft}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-label={label}
            disabled={saving}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
              if (event.key === "Escape") close();
            }}
          />
          <button
            type="button"
            className={styles.settingsEditButton}
            onClick={() => void save()}
            disabled={saving}
          >
            Save
          </button>
          <button type="button" className={styles.settingsEditText} onClick={close}>
            Cancel
          </button>
        </span>
      </div>

      {error ? (
        <p className={styles.settingsRowError} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
