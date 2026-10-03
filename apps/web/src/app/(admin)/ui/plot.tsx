"use client";

// A plot, drawn here and by no library: one series, in ink, with the
// attention colour for the one state that needs somebody. Bars or a line. No
// legend, no entry animation, and every figure is reachable as text and by
// keyboard: the plot is one tab stop, the arrow keys move between its points,
// and the point in focus says its label and its value.
//
// A split is small multiples of this on one scale, or a table with a share
// bar; it is never a second series in here.

import { useState } from "react";
import styles from "../admin.module.css";

export interface Point {
  /** What the point is: a day, an hour. Said with the value. */
  label: string;
  value: number;
  /** The one state that needs somebody: a day the cap was reached. */
  tone?: "attention";
}

const WIDTH = 600;
const HEIGHT = 96;

export function Plot({
  label,
  points,
  kind = "bars",
  format = String,
  max,
  caption,
  startsAt,
  empty = "Nothing in this range.",
}: {
  /** What the plot shows, for a screen reader. */
  label: string;
  points: Point[];
  kind?: "bars" | "line";
  format?: (value: number) => string;
  /** The top of the scale. Small multiples pass the same one to each. */
  max?: number;
  /** Under the plot, between its first and last labels. */
  caption?: React.ReactNode;
  /** Said when history is shorter than the range asked for. */
  startsAt?: string;
  empty?: string;
}) {
  const [at, setAt] = useState<number | null>(null);
  // The point Tab lands on: the last one the keyboard was on, the first until
  // then. Ninety days of bars is one stop, not ninety.
  const [stop, setStop] = useState(0);
  if (points.length === 0) return <p className={styles.empty}>{empty}</p>;

  const top = Math.max(max ?? 0, ...points.map((point) => point.value), 0) || 1;
  const step = WIDTH / points.length;
  const gap = Math.min(4, step * 0.2);
  const y = (value: number) => HEIGHT - (Math.max(0, value) / top) * HEIGHT;
  const said = (point: Point) => `${point.label}: ${format(point.value)}`;
  const focused = at === null ? null : points[at];
  const current = Math.min(stop, points.length - 1);

  const onKey = (event: React.KeyboardEvent<SVGGElement>, index: number) => {
    const to =
      event.key === "ArrowRight"
        ? Math.min(index + 1, points.length - 1)
        : event.key === "ArrowLeft"
          ? Math.max(index - 1, 0)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? points.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    setStop(to);
    event.currentTarget.parentElement?.querySelectorAll<SVGGElement>("[data-point]")[to]?.focus();
  };

  return (
    <figure className={styles.plot}>
      <svg className={styles.plotArea} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={label}>
        {kind === "line" ? (
          <polyline
            className={styles.plotLine}
            points={points.map((point, index) => `${index * step + step / 2},${y(point.value)}`).join(" ")}
          />
        ) : null}
        {points.map((point, index) => (
          <g
            key={index}
            data-point
            data-tone={point.tone}
            className={styles.plotPoint}
            tabIndex={index === current ? 0 : -1}
            role="img"
            aria-label={said(point)}
            onKeyDown={(event) => onKey(event, index)}
            onFocus={() => {
              setAt(index);
              setStop(index);
            }}
            onBlur={() => setAt(null)}
            onMouseEnter={() => setAt(index)}
            onMouseLeave={() => setAt(null)}
          >
            {/* The whole column takes the pointer, so a day with nothing is
                still a day somebody can ask about. */}
            <rect className={styles.plotHit} x={index * step} y={0} width={step} height={HEIGHT} />
            {kind === "line" ? (
              <circle className={styles.plotMark} cx={index * step + step / 2} cy={y(point.value)} r={3} />
            ) : (
              <rect
                className={styles.plotMark}
                x={index * step + gap / 2}
                y={y(point.value)}
                width={Math.max(1, step - gap)}
                height={HEIGHT - y(point.value)}
              />
            )}
          </g>
        ))}
      </svg>
      <figcaption className={styles.plotFoot}>
        <span>{points[0]!.label}</span>
        {/* The caption is always there to be read. The point under the pointer
            or in focus takes its place on screen, in a line of its own that
            is announced as it changes. */}
        <span>
          <span className={focused ? styles.srOnly : undefined}>{caption}</span>
          <span aria-live="polite">{focused ? said(focused) : ""}</span>
        </span>
        <span>{points[points.length - 1]!.label}</span>
      </figcaption>
      {startsAt ? <p className={styles.plotNote}>{startsAt}</p> : null}
    </figure>
  );
}

/** A share of a total, drawn as one bar. For a table that splits a figure. */
export function ShareBar({ value, total, tone }: { value: number; total: number; tone?: "attention" }) {
  const share = total > 0 ? Math.max(2, Math.round((value / total) * 100)) : 0;
  return (
    <span className={styles.share}>
      <span className={styles.shareFill} data-tone={tone} style={{ width: `${share}%` }} />
    </span>
  );
}
