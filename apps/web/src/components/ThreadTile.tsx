"use client";

// 2026-10-29. A thread on My threads, as a tile: its ground and wash, all
// text white (`APPLY-2026-10-29-threads-grid.md`, section 3). Since
// 2026-11-17 the name leads, large, with its line under it, and the people
// and a large glyph sit at the foot, so tiles tell apart at a glance; the
// back glyph went with that.
//
// The tile draws; My threads owns pressing, dragging and the menu, so this
// takes its handlers and its state as given.

import { forwardRef } from "react";
import { DEFAULT_THREAD_ICON, isThreadIcon, threadSeed, threadWash, tileLabel } from "@offload/widgets";
import { Icon } from "./Icon";
import type { ThreadRow } from "../lib/threads";
import styles from "./ThreadTile.module.css";

export interface ThreadTileProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  thread: ThreadRow;
  /** Lifted under the pointer or picked up by the keyboard. */
  lifted?: boolean;
}

export const ThreadTile = forwardRef<HTMLButtonElement, ThreadTileProps>(function ThreadTile({ thread, lifted, className, style, ...rest }, ref) {
  const seed = threadSeed(thread.id);
  const wash = threadWash(seed);
  const glyph = isThreadIcon(thread.icon) ? thread.icon : DEFAULT_THREAD_ICON;
  const faces = thread.faces ?? [];
  return (
    <button
      ref={ref}
      type="button"
      className={className ? `${styles.tile} ${className}` : styles.tile}
      data-lifted={lifted || undefined}
      aria-label={tileLabel(thread)}
      // Its menu opens on a right click, or the keyboard's context menu key.
      aria-haspopup="menu"
      style={
        {
          "--ground": `var(--thread-ground-${Number.isInteger(thread.hue) && thread.hue >= 1 && thread.hue <= 10 ? thread.hue : 1})`,
          "--px": `${wash.x}%`,
          "--py": `${wash.y}%`,
          "--r": `${wash.angle}deg`,
          ...style,
        } as React.CSSProperties
      }
      {...rest}
    >
      <span className={styles.text} aria-hidden="true">
        <span className={styles.name}>{thread.name}</span>
        {thread.meta ? <span className={styles.meta}>{thread.meta}</span> : null}
      </span>
      <span className={styles.foot} aria-hidden="true">
        {faces.length > 0 ? (
          <span className={styles.faces}>
            {faces.slice(0, 2).map((face) => (
              <span key={face.accountId} className={styles.face}>
                {face.initials}
              </span>
            ))}
            {faces.length > 2 ? <span className={styles.more}>+{faces.length - 2}</span> : null}
          </span>
        ) : null}
        <span className={styles.glyph}>
          <Icon name={glyph} style={{ width: "100%", height: "100%" }} />
        </span>
      </span>
    </button>
  );
});
