"use client";

// The widgets a thread earns, and the groups inside them.
//
// From ui_kits/android_app/M3ThreadWidgets.jsx, whose own comment is the rule
// this implements: "widgets a thread earns from its own contents: a map when it
// has places, a timeline when it has dated steps, a file grid when it has
// assets."
//
// **A widget is a view, never a store.** Every row here is a row in "Everything
// in here", filtered. Nothing is fetched per widget: the page has one content
// page and these are `filter` calls over it, which is what keeps the thread
// read a fixed number of queries however many widgets a thread earns.
//
// **The kit filters where this groups.** `ChipRow` is a single-select filter
// above a flat list; the product owner asked for grouping, which is headed
// sections. Both may eventually be wanted and only one is drawn, so this is a
// divergence logged in the design system's decisions.md rather than a
// reinterpretation.

import styles from "../../app/(shell)/shell.module.css";
import { groupBy, widgetsFor, type Widget } from "../../lib/widgets";
import type { ContentRow } from "../../lib/threads";

const HEADINGS: Record<string, string> = {
  map: "Places",
  todo: "To do",
  timeline: "Timeline",
  files: "Files",
};

interface Props {
  rows: ContentRow[];
  preference: { widgets?: string[]; groupBy?: Record<string, string> };
  onToggle: (row: ContentRow) => void;
}

export function Widgets({ rows, preference, onToggle }: Props) {
  const widgets = widgetsFor(rows, preference.widgets);
  if (widgets.length === 0) return null;

  return (
    <>
      {widgets.map((widget) => (
        <WidgetBlock
          key={widget.kind}
          widget={widget}
          dimension={preference.groupBy?.[widget.kind] ?? null}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

function WidgetBlock({
  widget,
  dimension,
  onToggle,
}: {
  widget: Widget<ContentRow>;
  dimension: string | null;
  onToggle: (row: ContentRow) => void;
}) {
  const groups = groupBy(widget.rows, dimension);

  return (
    <section>
      <h2 className={styles.section}>
        {HEADINGS[widget.kind]}
        <em className={styles.sectionCount}>{widget.rows.length}</em>
      </h2>

      {widget.kind === "map" ? <Pins rows={widget.rows} /> : null}

      {groups.map((group) => (
        <div key={group.value ?? "__untagged"}>
          {/* A group heading is new surface. The design system has
              `SectionHeader`, 21px over a rule and far too heavy for a
              sub-group, and `Chip`, which the kit already uses with
              tone="accent" and a sparkles glyph for anything offload derived.
              This is built from that vocabulary.

              The unnamed group has no heading at all: it holds rows carrying no
              tag in this dimension, and "Other" would be a label offload
              invented for content nobody categorised. */}
          {group.value ? (
            <p className={styles.groupHeading}>
              <span aria-hidden="true">✦</span>
              {group.value}
              <em className={styles.sectionCount}>{group.rows.length}</em>
            </p>
          ) : groups.length > 1 ? (
            <p className={styles.groupHeadingBare}>Everything else</p>
          ) : null}

          {group.rows.map((row) => (
            <Row key={row.id} row={row} widget={widget.kind} onToggle={onToggle} />
          ))}
        </div>
      ))}
    </section>
  );
}

/** Pins on a plain surface, exactly as the kit draws it: "map surface, drawn
 *  from real coordinates". No tiles and no provider, so nothing about where
 *  somebody has been leaves for a map company to render a background. */
function Pins({ rows }: { rows: ContentRow[] }) {
  const placed = rows.filter((row) => row.place?.lat != null && row.place?.lng != null);
  if (placed.length === 0) return null;

  const lats = placed.map((row) => row.place!.lat!);
  const lngs = placed.map((row) => row.place!.lng!);
  const span = (values: number[]) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    // A single pin, or several in one spot, would divide by zero. Give it a
    // small box so it lands in the middle rather than nowhere.
    return max - min < 0.0005 ? { min: min - 0.01, size: 0.02 } : { min, size: max - min };
  };
  const y = span(lats);
  const x = span(lngs);

  return (
    <div className={styles.mapSurface} aria-hidden="true">
      <span className={styles.mapNote}>drawn from real coordinates</span>
      {placed.map((row, index) => (
        <span
          key={row.id}
          className={styles.pin}
          style={{
            left: `${((row.place!.lng! - x.min) / x.size) * 80 + 10}%`,
            // Latitude runs the other way from a screen's y axis.
            top: `${(1 - (row.place!.lat! - y.min) / y.size) * 70 + 15}%`,
          }}
        >
          {index + 1}
        </span>
      ))}
    </div>
  );
}

function Row({
  row,
  widget,
  onToggle,
}: {
  row: ContentRow;
  widget: string;
  onToggle: (row: ContentRow) => void;
}) {
  const done = row.doneAt !== null;

  if (widget === "todo") {
    return (
      <label className={`${styles.check} ${done ? styles.checkDone : ""}`}>
        <input type="checkbox" checked={done} onChange={() => onToggle(row)} />
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{row.title}</span>
          <Meta row={row} />
        </span>
      </label>
    );
  }

  return (
    <div className={styles.row}>
      <span className={styles.rowIcon} aria-hidden="true">
        {widget === "map" ? "◉" : widget === "timeline" ? "◷" : "▤"}
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{row.title}</span>
        <Meta row={row} />
      </span>
    </div>
  );
}

/** One line under a title, built from whatever the row actually has.
 *
 *  Every date label is derived from the date rather than written down, which is
 *  the kit's own rule and the reason a weekday can never disagree with the
 *  calendar. */
function Meta({ row }: { row: ContentRow }) {
  const parts: string[] = [];

  const when = row.occursAt ?? row.dueAt;
  if (when) {
    parts.push(
      new Date(when).toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    );
  }
  if (row.isReminder) parts.push("reminder");
  if (row.place?.address) parts.push(row.place.address);
  // Bare tags only. A namespaced one is probably what the list is grouped by,
  // and repeating the group's own name on every row in it is noise.
  for (const tag of row.tags) if (!tag.includes(":")) parts.push(tag);

  if (parts.length === 0) return null;
  return <span className={styles.rowMeta}>{parts.join(" · ")}</span>;
}
