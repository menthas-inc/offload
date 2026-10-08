"use client";

// 025. The label sheet, as the web draws it: a popover beside the tag tool or
// the mark that opened it. The thread's labels with their dots, names and
// counts, a tick each for this row, and New label, which opens a name field in
// place and adds the label ticked. Done is one write and a toast with Undo;
// Cancel writes nothing, a label made in here included.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { foldDraft, LABEL_NAME_CHARS } from "@offload/widgets";
import styles from "./labels.module.css";
import people from "../people/people.module.css";
import { Icon } from "../Icon";
import { LabelDot } from "./LabelMark";
import type { Label } from "../../lib/labels";

const LIMIT = 10;

export interface LabelChoice {
  /** Existing labels the row should carry. */
  ids: string[];
  /** Names typed with New label, to be made on Done. */
  made: string[];
}

export function LabelPopover({
  anchor,
  title,
  labels,
  carried,
  made: madeBefore = [],
  align = "end",
  onDone,
  onClose,
}: {
  anchor: HTMLElement;
  title: string;
  labels: Label[];
  carried: string[];
  /** Names already typed with New label and not made yet, when the popover
   *  opens again from the edit dialog. */
  made?: string[];
  /** Which edge of what opened it the popover lines up with: the end for a
   *  row's tag tool, the start for the edit dialog's Labels. */
  align?: "start" | "end";
  onDone: (choice: LabelChoice) => void;
  onClose: () => void;
}) {
  const [ticked, setTicked] = useState<string[]>(carried);
  const [made, setMade] = useState<string[]>(madeBefore);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [line, setLine] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  // Beside what opened it, kept on screen.
  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const width = box.current?.offsetWidth ?? 300;
    const height = box.current?.offsetHeight ?? 320;
    const left = Math.max(12, Math.min(align === "start" ? rect.left : rect.right - width, window.innerWidth - width - 12));
    const below = rect.bottom + 8;
    const top = below + height > window.innerHeight - 12 ? Math.max(12, rect.top - height - 8) : below;
    setAt({ top, left });
  }, [anchor, naming, made.length, align]);

  // Focus in, Escape out, focus back to the control that opened it.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("button, input")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      before?.focus();
    };
  }, [anchor, onClose]);

  const full = labels.length + made.length >= LIMIT;

  function addName(): void {
    const folded = foldDraft(draft, made, labels.map((l) => l.name));
    if ("line" in folded) return setLine(folded.line);
    setMade(folded.made);
    setDraft("");
    setNaming(false);
    setLine(null);
  }

  /** Done takes in a name still in the field: the press can arrive before the
   *  field's blur has added it. */
  function done(): void {
    const folded = naming ? foldDraft(draft, made, labels.map((l) => l.name)) : { made };
    if ("line" in folded) return setLine(folded.line);
    onDone({ ids: ticked, made: folded.made });
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={box}
      className={styles.popover}
      role="dialog"
      aria-label={`Labels for ${title}`}
      style={at ? { top: at.top, left: at.left } : { visibility: "hidden", top: 0, left: 0 }}
    >
      <h2 className={styles.popoverTitle}>Labels</h2>
      <p className={styles.popoverSub}>{title}</p>
      <ul className={styles.options}>
        {labels.map((label) => {
          const on = ticked.includes(label.id);
          return (
            <li key={label.id}>
              <button
                type="button"
                className={styles.option}
                role="checkbox"
                aria-checked={on}
                onClick={() => setTicked((current) => (on ? current.filter((id) => id !== label.id) : [...current, label.id]))}
              >
                <LabelDot colour={label.colour} />
                <span className={styles.optionName}>{label.name}</span>
                {label.count > 0 ? <span className={styles.optionCount}>{label.count}</span> : null}
                <span className={styles.tick} data-on={on ? true : undefined}>
                  {on ? <Icon name="check" size={13} /> : null}
                </span>
              </button>
            </li>
          );
        })}
        {made.map((name) => (
          <li key={`new:${name}`}>
            <button
              type="button"
              className={styles.option}
              role="checkbox"
              aria-checked
              onClick={() => setMade((current) => current.filter((one) => one !== name))}
            >
              <Icon name="plus" size={13} />
              <span className={styles.optionName}>{name}</span>
              <span className={styles.tick} data-on>
                <Icon name="check" size={13} />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {naming ? (
        <div className={styles.nameField} style={{ marginTop: "var(--space-4)" }}>
          <input
            value={draft}
            maxLength={LABEL_NAME_CHARS + 4}
            placeholder="Name it"
            aria-label="New label's name"
            autoFocus
            onChange={(event) => {
              setDraft(event.target.value);
              setLine(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addName();
              }
              if (event.key === "Escape") {
                event.stopPropagation();
                setNaming(false);
              }
            }}
            onBlur={addName}
          />
        </div>
      ) : (
        <button type="button" className={styles.newLabel} disabled={full} onClick={() => setNaming(true)}>
          <Icon name="plus" size={15} />
          New label
        </button>
      )}
      {full && !naming ? <p className={styles.hint}>A thread holds ten labels.</p> : null}
      {line ? <p className={styles.line}>{line}</p> : null}

      <div className={styles.actions}>
        <button type="button" className={people.ghost} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={people.primary} onClick={done}>
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}
