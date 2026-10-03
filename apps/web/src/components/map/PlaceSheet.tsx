"use client";

// 030. The place sheet, reached only from the map's callout. Read-only, and
// every line in it is offload's own: the row's title, an event's location,
// a link's domain. Nothing Google named, and nothing somebody wrote is drawn
// as anything but text.

import { useEffect, useRef } from "react";
import { directionsUrl } from "@offload/widgets";
import { domainOf, type Point } from "../../lib/threads";
import { webHref } from "../../lib/links";
import { Icon } from "../Icon";
import { LabelMark } from "../labels/LabelMark";
import { rowIcon } from "../panes/rowIcon";
import { kindWord } from "./Point";
import { kindLine } from "./Callout";
import styles from "./map.module.css";

function whenLine(when: NonNullable<Point["when"]>): string {
  const at = new Date(when.at);
  if (when.allDay) return at.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return at.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function PlaceSheet({
  point,
  threadName,
  labels,
  members,
  onClose,
  onEdit,
}: {
  point: Point;
  threadName: string;
  labels: { id: string; name: string; colour: number }[];
  members: { accountId: string | null; displayName: string; isYou: boolean }[];
  onClose: () => void;
  onEdit: (point: Point) => void;
}) {
  const calendar = point.source === "calendar";
  // Only an http link opens, as everywhere else: the guard is the device's
  // too, for the day the server forgets.
  const href = webHref(point.url);
  const kind = calendar ? (point.calendarName ?? "Calendar") : kindWord(point.type);
  const carried = labels.filter((label) => point.labelIds.includes(label.id));
  const author = point.authorId ? members.find((m) => m.accountId === point.authorId) : undefined;
  const address = point.approximate ? (point.address ? `Approximate, ${point.address}` : "Approximate") : point.address;
  const rows: { key: string; icon: string; label: string; value: React.ReactNode }[] = [];
  if (point.when) rows.push({ key: "when", icon: "calendar", label: "When", value: whenLine(point.when) });
  if (address) rows.push({ key: "address", icon: "map-pin", label: "Address", value: address });
  if (point.url) rows.push({ key: "link", icon: "link", label: "Link", value: domainOf(point.url) ?? point.url });
  if (!calendar) {
    rows.push({
      key: "labels",
      icon: "tag",
      label: "Labels",
      value: carried.length ? carried.map((l) => <LabelMark key={l.id} color={l.colour}>{l.name}</LabelMark>) : "None",
    });
  }
  if (!calendar && author) rows.push({ key: "added", icon: "users", label: "Added by", value: author.isYou ? "You" : author.displayName });

  // A keyboard lands in the sheet it opened, on its close, and Escape leaves.
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), [point.key]);

  return (
    <aside
      className={styles.sheet}
      aria-label={point.title}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className={styles.sheetHead}>
        <span className={styles.sheetTile}>
          {point.imageUrl ? <img src={point.imageUrl} alt="" referrerPolicy="no-referrer" /> : <Icon name={rowIcon(point.type)} size={20} />}
        </span>
        <div className={styles.sheetTitle}>
          <h3>{point.title}</h3>
          <div className={styles.sheetKind}>
            {kindLine(point, kind)} · {threadName}
          </div>
        </div>
        <button ref={close} type="button" className={styles.close} aria-label="Close" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className={styles.rows}>
        {rows.map((row) => (
          <div key={row.key} data-row={row.key} className={styles.row}>
            <Icon name={row.icon} size={16} />
            <span className={styles.rowKey}>{row.label}</span>
            <span className={styles.rowValue}>{row.value}</span>
          </div>
        ))}
      </div>
      <div className={styles.foot} data-one={calendar || (point.url !== null && !href)}>
        <a
          className={`${styles.button} ${styles.buttonPrimary}`}
          href={directionsUrl({ lat: point.lat, lng: point.lng, googlePlaceId: point.googlePlaceId })}
          target="_blank"
          rel="noreferrer noopener"
        >
          <Icon name="compass" size={16} />
          Directions
        </a>
        {calendar ? null : point.url ? (
          href ? (
            <a className={styles.button} href={href} target="_blank" rel="noreferrer noopener">
              <Icon name="arrow-up-right" size={16} />
              Open link
            </a>
          ) : null
        ) : (
          <button type="button" className={styles.button} onClick={() => onEdit(point)}>
            <Icon name="pencil" size={16} />
            Edit
          </button>
        )}
      </div>
    </aside>
  );
}
