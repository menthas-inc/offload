"use client";

// The widgets a thread earns, and the filter inside them.
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
// **It filters, it does not group.** This grouped into headed sections until 5
// September 2026, when the divergence was put back to the product owner and
// answered the other way: a screen whose promise is that nothing needs filing
// should not lead with structure somebody has to read, and a filter answers
// "show me the receipts" in one tap. The group heading and the bare "Everything
// else" heading went with it.

import { useState } from "react";
import styles from "../../app/(shell)/shell.module.css";
import { filtersFor, matching, widgetsFor, type Widget } from "../../lib/widgets";
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
  // Null is All, which is also where a row carrying no tag in this dimension
  // lives. Local rather than stored: a filter is what you are looking at now,
  // not a preference about the thread.
  const [only, setOnly] = useState<string | null>(null);
  const filters = filtersFor(widget.rows, dimension);
  const shown = matching(widget.rows, dimension, only);

  return (
    <section>
      <h2 className={styles.section}>
        {HEADINGS[widget.kind]}
        <em className={styles.sectionCount}>{widget.rows.length}</em>
      </h2>

      {widget.kind === "map" ? <Pins rows={shown} /> : null}

      {/* One row of chips, single select, All first. Below two values there is
          nothing to choose between, so it does not draw. */}
      {filters.length > 1 ? (
        <div className={styles.filterRow} role="group" aria-label={`Filter ${HEADINGS[widget.kind]}`}>
          <FilterChip label="All" count={widget.rows.length} on={only === null} onPick={() => setOnly(null)} />
          {filters.map((filter) => (
            <FilterChip
              key={filter.value}
              label={filter.value}
              count={filter.count}
              on={only === filter.value}
              onPick={() => setOnly(filter.value)}
            />
          ))}
        </div>
      ) : null}

      {shown.map((row) => (
        <Row key={row.id} row={row} widget={widget.kind} onToggle={onToggle} />
      ))}
    </section>
  );
}

/** A chip from the contract: 30px pill, selection inverts to ink, and the count
 *  rides inside the label rather than in a second element. */
function FilterChip({
  label,
  count,
  on,
  onPick,
}: {
  label: string;
  count: number;
  on: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${on ? styles.chipOn : ""}`}
      aria-pressed={on}
      onClick={onPick}
    >
      {label} {count}
    </button>
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
