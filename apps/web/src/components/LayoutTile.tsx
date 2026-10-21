// The option a thread's layout is picked by, in Edit thread and New thread.
// Six abstract marks, each saying how a layout arranges a page, never what is
// in this thread. There is no 045 kit in the repo yet (see decisions.md,
// 2026-10-19); this is the code's own drawing until one lands.
// The geometry lives in the CSS module (px in a module is the
// system's own drawing, not spacing a screen lays out).

import type { Layout } from "@offload/widgets";
import { LAYOUT_NAMES } from "@offload/widgets";
import styles from "./LayoutTile.module.css";

type Mark = "bar" | "accent" | "box" | "dot" | "solid" | "outline" | "block";

const MARKS: Record<Layout, Mark[]> = {
  default: ["bar", "accent", "bar", "bar"],
  todo: ["box", "bar", "box", "bar", "box", "bar", "box", "bar"],
  events: ["solid", "solid", "outline", "outline"],
  gallery: ["block", "block", "block", "block"],
  project: ["accent", "accent", "accent", "bar", "bar", "bar", "bar", "bar"],
  timeline: ["dot", "bar", "dot", "bar", "dot", "bar"],
};

export interface LayoutTileProps {
  layout: Layout;
  size?: "sm" | "md";
  selected?: boolean;
  onPress?: () => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  tabIndex?: number;
}

export function LayoutTile({ layout, size = "md", selected = false, onPress, onKeyDown, tabIndex }: LayoutTileProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={LAYOUT_NAMES[layout]}
      onClick={onPress}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      className={styles.tile}
      data-size={size}
      data-selected={selected || undefined}
    >
      <span className={styles.mark} data-layout={layout} aria-hidden="true">
        {MARKS[layout].map((kind, i) => (
          <i key={i} className={styles.cell} data-kind={kind} />
        ))}
      </span>
      <span>{LAYOUT_NAMES[layout]}</span>
    </button>
  );
}
