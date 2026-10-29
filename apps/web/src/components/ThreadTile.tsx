"use client";

// 2026-10-29. A thread on My threads, as a tile: its ground and wash, the
// glyph small at the top left, the people at the top right, the name and its
// line at the foot, all white, and the glyph again behind them at 190%,
// square-stroked, so each tile shows a different part of it. Measurements are
// the handoff's (`APPLY-2026-10-29-threads-grid.md`, section 3).
//
// The tile draws; My threads owns pressing, dragging and the menu, so this
// takes its handlers and its state as given.

import { forwardRef, useEffect, useState } from "react";
import { DEFAULT_THREAD_ICON, backGlyph, isThreadIcon, threadSeed, threadWash, tileLabel } from "@offload/widgets";
import { Icon } from "./Icon";
import type { ThreadRow } from "../lib/threads";
import styles from "./ThreadTile.module.css";

type Shape = { tag: "path" | "circle" | "rect" | "line" | "polyline" | "polygon" | "ellipse"; attrs: Record<string, string> };
const TAGS = new Set<Shape["tag"]>(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"]);
const READ = ["d", "cx", "cy", "r", "x", "y", "width", "height", "x1", "y1", "x2", "y2", "points", "rx", "ry"];
const shapes = new Map<string, Promise<Shape[]>>();

/** A glyph's drawable elements, read once from the vendored SVG the Icon masks
 *  with. A rect's corner goes: the back glyph is hardened. */
function shapesOf(name: string): Promise<Shape[]> {
  let kept = shapes.get(name);
  if (!kept) {
    kept = fetch(`/icons/${name}.svg`)
      .then((response) => (response.ok ? response.text() : ""))
      .then((text) =>
        [...new DOMParser().parseFromString(text, "image/svg+xml").querySelectorAll("svg > *")].flatMap((el): Shape[] => {
          const tag = el.tagName.toLowerCase() as Shape["tag"];
          if (!TAGS.has(tag)) return [];
          const attrs: Record<string, string> = {};
          for (const key of READ) {
            const value = el.getAttribute(key);
            if (value !== null && !(tag === "rect" && (key === "rx" || key === "ry"))) attrs[key] = value;
          }
          return [{ tag, attrs }];
        }),
      )
      .catch(() => []);
    shapes.set(name, kept);
  }
  return kept;
}

function BackGlyph({ name, seed }: { name: string; seed: number }) {
  const [drawn, setDrawn] = useState<Shape[]>([]);
  useEffect(() => {
    let live = true;
    void shapesOf(name).then((made) => live && setDrawn(made));
    return () => {
      live = false;
    };
  }, [name]);
  const at = backGlyph(seed);
  return (
    <svg
      className={styles.back}
      style={{ "--bx": `${at.left}%`, "--by": `${at.top}%`, "--bt": `${at.turn}deg` } as React.CSSProperties}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {drawn.map(({ tag: Tag, attrs }, i) => (
        <Tag key={i} {...attrs} />
      ))}
    </svg>
  );
}

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
      <BackGlyph name={glyph} seed={seed} />
      <span className={styles.head} aria-hidden="true">
        <Icon name={glyph} size={26} />
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
      </span>
      <span className={styles.foot} aria-hidden="true">
        <span className={styles.name}>{thread.name}</span>
        {thread.meta ? <span className={styles.meta}>{thread.meta}</span> : null}
      </span>
    </button>
  );
});
