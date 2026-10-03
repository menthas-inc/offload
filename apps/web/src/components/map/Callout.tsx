"use client";

// 030. The callout over a picked point: the row's own title, its kind and
// labels, then Directions to Google Maps and Open. Live HTML inside the map's
// own marker, so both actions press on their own.

import { useEffect, useRef } from "react";
import { directionsUrl } from "@offload/widgets";
import type { Point } from "../../lib/threads";
import { Icon } from "../Icon";
import { LabelMark } from "../labels/LabelMark";
import { kindWord } from "./Point";
import styles from "./map.module.css";

export function Callout({
  point,
  labels,
  onOpen,
  onClose,
}: {
  point: Point;
  labels: { id: string; name?: string; colour: number }[];
  onOpen: (point: Point) => void;
  onClose: () => void;
}) {
  // A keyboard lands on the callout's first action, and Escape closes it.
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => first.current?.focus({ preventScroll: true }), [point.key]);
  const carried = labels.filter((label) => point.labelIds.includes(label.id));
  const kind = point.source === "calendar" ? (point.calendarName ?? "Calendar") : kindWord(point.type);
  return (
    <div
      data-callout
      role="group"
      aria-label={point.title}
      className={styles.callout}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <b className={styles.calloutTitle}>{point.title}</b>
      <span className={styles.calloutKind}>
        <span>{kindLine(point, kind)}</span>
        {carried.map((label) => (
          <LabelMark key={label.id} color={label.colour}>
            {label.name ?? ""}
          </LabelMark>
        ))}
      </span>
      <span className={styles.calloutActions}>
        <a
          ref={first}
          className={`${styles.pill} ${styles.pillPrimary}`}
          href={directionsUrl({ lat: point.lat, lng: point.lng, googlePlaceId: point.googlePlaceId })}
          target="_blank"
          rel="noreferrer noopener"
        >
          <Icon name="compass" size={13} />
          Directions
        </a>
        <button type="button" className={styles.pill} aria-label={`Open ${point.title}`} onClick={() => onOpen(point)}>
          Open
        </button>
      </span>
    </div>
  );
}

/** A kind word takes a capital to start the line; a calendar's name is
 *  somebody's own text and is drawn as they wrote it. */
export function kindLine(point: Point, kind: string): string {
  return point.source === "calendar" ? kind : kind.charAt(0).toUpperCase() + kind.slice(1);
}
