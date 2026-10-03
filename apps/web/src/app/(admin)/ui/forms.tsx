"use client";

// What a page asks with: a field that knows its bounds, the confirm dialog,
// a change written as old to new, and the range a plot covers. From the kit's
// `AField` and `AConfirm`.

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "../admin.module.css";
import { count, outOfBounds } from "./format";

/** One value. With `min` or `max` it refuses, on the field itself, a number
 *  outside them, and names them. `error` is one the server gave. `onReset`
 *  offers the default back. */
export function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  min,
  max,
  error,
  onReset,
  width = 140,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  prefix?: string;
  suffix?: string;
  hint?: React.ReactNode;
  min?: number;
  max?: number;
  error?: string | null;
  onReset?: () => void;
  width?: number | string;
  type?: "text" | "email";
}) {
  const id = useId();
  const bounds =
    outOfBounds(value, min, max) && min !== undefined && max !== undefined ? `Between ${count(min)} and ${count(max)}.` : null;
  const problem = error ?? bounds;
  return (
    <span className={styles.field} style={{ width }}>
      <span className={styles.fieldTop}>
        <label htmlFor={id} className={styles.fieldLabel}>
          {label}
        </label>
        {onReset ? (
          <button type="button" className={styles.reset} onClick={onReset}>
            Reset
          </button>
        ) : null}
      </span>
      <span className={styles.fieldBox} data-invalid={problem ? true : undefined}>
        {prefix ? <span className={styles.fieldAffix}>{prefix}</span> : null}
        <input
          id={id}
          type={type}
          className={styles.fieldInput}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : hint ? `${id}-hint` : undefined}
        />
        {suffix ? <span className={styles.fieldAffix}>{suffix}</span> : null}
      </span>
      {problem ? (
        <span id={`${id}-problem`} className={styles.fieldError} role="alert">
          {problem}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className={styles.fieldHint}>
          {hint}
        </span>
      ) : null}
    </span>
  );
}

/** Each change as old to new, in words: no arrow to mistake for a dash. */
export function Diff({ changes }: { changes: Array<{ label: string; from: string; to: string }> }) {
  return (
    <ul className={styles.diff}>
      {changes.map((change) => (
        <li key={change.label} className={styles.diffRow}>
          <span className={styles.diffLabel}>{change.label}</span>
          <span className={styles.diffFrom}>{change.from}</span>
          <span className={styles.quiet}>to</span>
          <b className={styles.diffTo}>{change.to}</b>
        </li>
      ))}
    </ul>
  );
}

const FIELDS = "input:not([disabled]), select:not([disabled]), textarea:not([disabled])";
const STOPS = `${FIELDS}, button:not([disabled]), a[href]`;

/** Anything that cannot be quietly undone asks first, and says what happens.
 *  With `confirmWord` the word has to be typed back: somebody doing ten of
 *  these in a row will otherwise do the eleventh out of habit.
 *
 *  It holds the keyboard while it is open: focus goes to its first field, or
 *  to the confirm button when it has none, Tab stays inside, and closing it
 *  puts focus back on whatever opened it. */
export function Confirm({
  title,
  body,
  confirmLabel = "Confirm",
  confirmWord,
  danger,
  busy,
  ready = true,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  confirmWord?: string;
  danger?: boolean;
  busy?: boolean;
  /** False while the dialog's own form is not yet something to send. */
  ready?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** A form the dialog carries, between the body and the buttons. */
  children?: React.ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const titleId = useId();
  const canAct = ready && !busy && (!confirmWord || typed.trim() === confirmWord);
  const dialog = useRef<HTMLDivElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const box = dialog.current;
    const first = box?.querySelector<HTMLElement>(FIELDS) ?? (confirm.current && !confirm.current.disabled ? confirm.current : box);
    first?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog.current) return;
      const stops = [...dialog.current.querySelectorAll<HTMLElement>(STOPS)];
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!first || !last) return;
      const at = document.activeElement;
      // Off the end goes round to the other end, and so does anything that
      // has ended up outside.
      const leaving = !dialog.current.contains(at) || at === dialog.current || at === (event.shiftKey ? first : last);
      if (!leaving) return;
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className={styles.scrim} onClick={onClose} />
      <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div id={titleId} className={styles.dialogTitle}>
          {title}
        </div>
        <div className={styles.dialogBody}>{body}</div>
        {children ? <div className={styles.dialogForm}>{children}</div> : null}
        {confirmWord ? (
          <div className={styles.dialogForm}>
            <Field label={`Type ${confirmWord} to confirm`} value={typed} onChange={setTyped} width="100%" />
          </div>
        ) : null}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.ghost} onClick={onClose}>
            Cancel
          </button>
          <button
            ref={confirm}
            type="button"
            className={danger ? styles.dangerSolid : styles.primary}
            disabled={!canAct}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

export const RANGES = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
] as const;

export type Range = (typeof RANGES)[number]["value"];

/** The range in the address, so a link lands on the same view. Anything else
 *  there reads as 30 days. */
export function useRange(): Range {
  const value = useSearchParams().get("range");
  return RANGES.some((range) => range.value === value) ? (value as Range) : "30d";
}

/** The four ranges every plot offers, kept in the address. */
export function RangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = useRange();
  return (
    <span className={styles.seg} role="radiogroup" aria-label="Range">
      {RANGES.map((range) => (
        <button
          key={range.value}
          type="button"
          role="radio"
          aria-checked={range.value === current}
          className={styles.segOption}
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            next.set("range", range.value);
            router.replace(`${pathname}?${next.toString()}`);
          }}
        >
          {range.label}
        </button>
      ))}
    </span>
  );
}
