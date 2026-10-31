"use client";

// 037. Edit thread: the name, the icon and the colour in one popover, in
// place of the inline rename. From the handoff's item 6 and the standalone
// page's `.wpop`; the rules for what Save sends are `threadChange` in
// @offload/widgets, which the phones' sheet shares.
//
// 2026-10-07. The same popover is New thread, from the plus on My threads:
// a heading and an action of its own, hung from the right of what opened it.
//
// It holds the keyboard while it is open: Escape and a click outside close
// it, Tab stays inside, and closing puts focus back on what opened it.

import { useEffect, useRef, useState } from "react";
import { HUE_NAMES, LAYOUTS, LAYOUT_NAMES, THREAD_ICON_NAMES, previewThreadIcon, threadChange, threadIconLabel, type Layout, type ThreadLook } from "@offload/widgets";
import { Icon } from "../Icon";
import { ThreadIcon } from "../ThreadIcon";
import { LayoutTile } from "../LayoutTile";
import styles from "./EditThread.module.css";

const COLUMNS = 7;
const HUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export interface EditThreadProps {
  thread: ThreadLook & { id: string; layout?: Layout; layoutSetBy?: "offload" | "person" };
  /** What was clicked. The name puts the caret in the field; the icon does
   *  not; a notice's Change lands on the picked layout. */
  from: "icon" | "name" | "layout";
  /** The change to write, and what the head draws at the press. */
  onSave: (change: { name?: string; icon?: string; hue?: number; layout?: Layout }, shown: { name: string; icon: string; hue: number }) => void;
  onClose: () => void;
  /** New thread's words in place of Edit thread's. */
  heading?: string;
  action?: string;
  /** Which edge of what opened it the popover hangs from. */
  align?: "start" | "end";
}

/** Arrow keys over a radio group laid out as a grid: left and right by one,
 *  up and down by a row. Focus follows the pick, as a radio group's does. */
function step(key: string, index: number, count: number, columns: number): number | null {
  const next =
    key === "ArrowRight" ? index + 1 : key === "ArrowLeft" ? index - 1 : key === "ArrowDown" ? index + columns : key === "ArrowUp" ? index - columns : null;
  return next === null || next < 0 || next >= count ? null : next;
}

export function EditThread({ thread, from, onSave, onClose, heading = "Edit thread", action = "Save", align = "start" }: EditThreadProps) {
  const [name, setName] = useState(thread.name);
  const [picked, setPicked] = useState<string | null>(null);
  const [hue, setHue] = useState(thread.hue);
  const [layout, setLayout] = useState<Layout>(thread.layout ?? "default");
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const layouts = useRef<HTMLDivElement>(null);

  const icon = previewThreadIcon(thread, { name, icon: picked });
  const canSave = name.trim().length > 0;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (from === "name") {
      field.current?.focus();
      field.current?.select();
    } else if (from === "layout") {
      const tile = layouts.current?.querySelector<HTMLElement>('[tabindex="0"]');
      tile?.focus();
      tile?.scrollIntoView?.({ block: "nearest" });
    } else box.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [from]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !box.current) return;
      const stops = [...box.current.querySelectorAll<HTMLElement>('input, button:not([disabled]):not([tabindex="-1"])')];
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!first || !last) return;
      const at = document.activeElement;
      const leaving = !box.current.contains(at) || at === box.current || at === (event.shiftKey ? first : last);
      if (!leaving) return;
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    if (!canSave) return;
    const change: { name?: string; icon?: string; hue?: number; layout?: Layout } = threadChange(thread, { name, icon: picked, hue }) ?? {};
    // The layout rides the same Save, so one write and one Undo. threadChange
    // does not know it, so it is merged in when it moved.
    if (layout !== (thread.layout ?? "default")) change.layout = layout;
    if (Object.keys(change).length > 0) onSave(change, { name: name.trim(), icon, hue });
    onClose();
  }

  function arrows(event: React.KeyboardEvent, index: number, count: number, columns: number, pick: (index: number) => void) {
    const next = step(event.key, index, count, columns);
    if (next === null) return;
    event.preventDefault();
    pick(next);
    const group = event.currentTarget.parentElement;
    (group?.children[next] as HTMLElement | undefined)?.focus();
  }

  return (
    <>
      <div className={styles.scrim} onClick={onClose} />
      <div
        ref={box}
        className={`${styles.popover} ${align === "end" ? styles.popoverEnd : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
      >
        <div className={styles.head}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            Cancel
          </button>
          <b className={styles.title}>{heading}</b>
          <button type="button" className={styles.save} onClick={save} disabled={!canSave}>
            {action}
          </button>
        </div>

        <div className={styles.nameRow}>
          <ThreadIcon icon={icon} hue={hue} seed={thread.id} size={56} />
          <label className={styles.nameField}>
            <span className={styles.label}>Name</span>
            <input
              ref={field}
              className={styles.input}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
              }}
            />
          </label>
        </div>

        <div className={styles.label} id="edit-thread-icon">
          Icon
        </div>
        <div className={styles.well}>
          <div className={styles.grid} role="radiogroup" aria-label="Icon">
            {THREAD_ICON_NAMES.map((one, index) => (
              <button
                key={one}
                type="button"
                role="radio"
                aria-checked={one === icon}
                aria-label={threadIconLabel(one)}
                tabIndex={one === icon || (index === 0 && !THREAD_ICON_NAMES.includes(icon)) ? 0 : -1}
                className={styles.cell}
                onClick={() => setPicked(one)}
                onKeyDown={(event) => arrows(event, index, THREAD_ICON_NAMES.length, COLUMNS, (next) => setPicked(THREAD_ICON_NAMES[next]!))}
              >
                <Icon name={one} size={22} />
              </button>
            ))}
          </div>
        </div>

        <div className={styles.label}>Colour</div>
        <div className={styles.hues} role="radiogroup" aria-label="Colour">
          {HUES.map((one, index) => (
            <button
              key={one}
              type="button"
              role="radio"
              aria-checked={one === hue}
              aria-label={HUE_NAMES[index]}
              tabIndex={one === hue ? 0 : -1}
              className={styles.hue}
              onClick={() => setHue(one)}
              onKeyDown={(event) => arrows(event, index, HUES.length, HUES.length, (next) => setHue(HUES[next]!))}
            >
              <ThreadIcon icon={icon} hue={one} seed={thread.id} size={26} round bare />
            </button>
          ))}
        </div>

        <div className={styles.label}>Layout</div>
        <div ref={layouts} role="radiogroup" aria-label="Layout" className={styles.layouts}>
          {LAYOUTS.map((one, index) => (
            <LayoutTile
              key={one}
              layout={one}
              selected={one === layout}
              tabIndex={one === layout ? 0 : -1}
              onPress={() => setLayout(one)}
              onKeyDown={(event) => arrows(event, index, LAYOUTS.length, LAYOUTS.length, (next) => setLayout(LAYOUTS[next]!))}
            />
          ))}
        </div>
        {thread.layoutSetBy === "offload" && (thread.layout ?? "default") !== "default" ? (
          <div className={styles.picked}>
            <Icon name="sparkles" size={14} />
            <span>offload picked {LAYOUT_NAMES[thread.layout ?? "default"]} when it made this thread.</span>
          </div>
        ) : null}
      </div>
    </>
  );
}
