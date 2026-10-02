"use client";

// 030. One point on a thread's map: 16px, a ring in --paper, its label colours
// split down the middle, ink with no label; an event is a rounded square. A
// button inside a 44px target, named by its title and kind.

import styles from "./map.module.css";

export function PointDot({
  a,
  b,
  shape,
  picked,
  hovered,
}: {
  a: number | null;
  b: number | null;
  shape: "dot" | "square";
  picked: boolean;
  hovered: boolean;
}) {
  const first = a === null ? "var(--text-primary)" : `var(--label-${a})`;
  const second = b === null ? first : `var(--label-${b})`;
  return (
    <span
      data-point=""
      data-shape={shape}
      data-picked={picked}
      data-hover={hovered}
      className={styles.point}
      style={{ "--a": first, "--b": second } as React.CSSProperties}
    />
  );
}

/** What a kind of row is called beside its title, for assistive tech and the
 *  callout. The vocabulary's words, never "item" or "thing". */
export function kindWord(type: string): string {
  switch (type) {
    case "location":
      return "place";
    case "event":
      return "event";
    case "link":
      return "link";
    case "task":
      return "to-do";
    default:
      return type;
  }
}
