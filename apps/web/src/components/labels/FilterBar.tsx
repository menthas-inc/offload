"use client";

// 025. The filter bar under the pane head: All, each label with its count,
// No label, and a plus pinned to the trailing edge. Either logic: two picked
// shows anything carrying one or both. The pick is the device's and lives
// with the page; this draws it and reports presses. Only once the thread has a
// label: before that, the way in is the tag among the pane head's tools
// (2026-09-29), where the Group with labels chip took a row of its own.
//
// **Holding a chip opens its list** on the phones. The web has three ways to
// the same place: the chip's context menu (a right click, the context menu
// key or Shift+F10), a long press for a touch screen, and on a picked chip a
// trailing pencil, so a keyboard and a mouse both reach Rename and Delete.
//
// **A deleted label keeps its chip** for its Undo line, pill-shaped, the bar
// with it when it was the last one (2026-10-18).

import { useRef } from "react";
import { InPlace } from "../shell/InPlace";
import { useUndoEntries } from "../../lib/undo";
import { isAll, toggleLabel, toggleUnlabelled, pickAll, type LabelPick } from "@offload/widgets";
import styles from "./labels.module.css";
import { Chip } from "./Chip";
import { Icon } from "../Icon";
import type { Label } from "../../lib/labels";

const HOLD_MS = 500;

export function FilterBar({
  labels,
  unlabelled,
  pick,
  onPick,
  onNew,
  onOpen,
  floating = false,
}: {
  /** 030. Over the map on Map: raised chips with no counts and no plus. */
  floating?: boolean;
  labels: Label[];
  unlabelled: number;
  pick: LabelPick;
  onPick: (pick: LabelPick) => void;
  onNew: () => void;
  onOpen: (labelId: string) => void;
}) {
  const seen = useRef(new Set<string>());
  for (const label of labels) seen.current.add(label.id);
  const entries = useUndoEntries();
  const lineHere = [...entries.keys()].some((id) => seen.current.has(id));
  if (labels.length === 0 && !lineHere) return null;

  return (
    <div className={floating ? styles.barFloating : styles.bar} role="group" aria-label="Filter by label">
      <div className={styles.barScroll}>
        <Chip selected={isAll(pick)} onClick={() => onPick(pickAll())}>
          All
        </Chip>
        <span className={styles.chipSlots}>
          <InPlace items={labels} idOf={(label) => label.id} radius="var(--radius-pill)">
            {(label) => (
              <LabelChip
                label={label}
                picked={pick.labels.includes(label.id)}
                counted={!floating}
                onPress={() => onPick(toggleLabel(pick, label.id))}
                onOpen={() => onOpen(label.id)}
              />
            )}
          </InPlace>
        </span>
        <Chip tone="outline" selected={pick.none} onClick={() => onPick(toggleUnlabelled(pick))}>
          No label{unlabelled > 0 && !floating ? ` ${unlabelled}` : ""}
        </Chip>
      </div>
      {/* The plus is an icon with a name, so it is a button with a label
          rather than a Chip with words. Not over the map, where a new label
          has nothing to hold. */}
      {floating ? null : (
        <button type="button" className={`${styles.chipHit} ${styles.barPlus}`} aria-label="New label" onClick={onNew}>
          <span className={styles.chip}>
            <Icon name="plus" size={14} />
          </span>
        </button>
      )}
    </div>
  );
}

function LabelChip({
  label,
  picked,
  counted,
  onPress,
  onOpen,
}: {
  label: Label;
  picked: boolean;
  counted: boolean;
  onPress: () => void;
  onOpen: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center" }}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpen();
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") return;
        held.current = false;
        timer.current = setTimeout(() => {
          held.current = true;
          onOpen();
        }, HOLD_MS);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onClickCapture={(event) => {
        // A hold that opened the list is not also a press.
        if (held.current) {
          event.stopPropagation();
          held.current = false;
        }
      }}
    >
      <Chip label={label.colour} selected={picked} onClick={onPress}>
        {label.name}
        {counted && label.count > 0 ? ` ${label.count}` : ""}
      </Chip>
      {picked ? (
        <button
          type="button"
          className={styles.chipEdit}
          data-colour={label.colour}
          aria-label={`Edit ${label.name}`}
          title="Rename, colour, or delete"
          onClick={onOpen}
        >
          <Icon name="pencil" size={13} />
        </button>
      ) : null}
    </span>
  );
}
