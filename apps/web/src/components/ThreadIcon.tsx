// 037. A thread's icon: its glyph on a wash of its hue.
//
// The design calls this the thread's mark. The name here is `ThreadIcon`
// because on the phones a mark is already a person's picture. Measurements are
// the handoff's (`APPLY-2026-10-03-thread-marks.md`, item 3); the colours are
// mixed in the stylesheet from the hue set here.

import { DEFAULT_THREAD_ICON, isThreadIcon, threadSeed, threadWash } from "@offload/widgets";
import { Icon } from "./Icon";
import styles from "./ThreadIcon.module.css";

export interface ThreadIconProps {
  /** One of the seventy, or lasso. A name this build does not know draws lasso. */
  icon: string;
  /** One of the ten label hues. */
  hue: number;
  /** The thread's id: where the wash sits, the same on every visit. */
  seed: string;
  size: number;
  /** A circle, for inside a pill. */
  round?: boolean;
  /** The wash alone, with no glyph: a hue in Edit thread. */
  bare?: boolean;
  className?: string;
}

export function ThreadIcon({ icon, hue, seed, size, round = false, bare = false, className }: ThreadIconProps) {
  const wash = threadWash(threadSeed(seed));
  const style = {
    "--hue": `var(--label-${Number.isInteger(hue) && hue >= 1 && hue <= 10 ? hue : 1})`,
    "--k": `${size}px`,
    "--px": `${wash.x}%`,
    "--py": `${wash.y}%`,
    "--r": `${wash.angle}deg`,
  } as React.CSSProperties;
  return (
    // Hidden from a screen reader: the thread's name is always beside it.
    <span aria-hidden="true" className={className ? `${styles.icon} ${className}` : styles.icon} data-round={round || undefined} style={style}>
      {bare ? null : <Icon name={isThreadIcon(icon) ? icon : DEFAULT_THREAD_ICON} size={size / 2} />}
    </span>
  );
}
