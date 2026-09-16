"use client";

// The widgets a thread earns, and the filter inside them.
//
// From ui_kits/android_app/M3ThreadWidgets.jsx, whose own comment is the rule
// this implements: "widgets a thread earns from its own contents: a map when it
// has places, a file grid when it has assets." *The timeline was one of these
// and is 015's rail now, above this.*
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
import { Icon } from "../Icon";
import { ContentRowView, type RowHandlers } from "./ContentRowView";
import {
  DONE_SHOWN,
  filtersFor,
  matching,
  splitDone,
  widgetsFor,
  type Widget,
} from "../../lib/widgets";
import { QUICK_ADD_CHARS, quickAdd } from "../../lib/threads";
import type { ContentRow } from "../../lib/threads";

const HEADINGS: Record<string, string> = {
  map: "Places",
  todo: "To do",
  files: "Files",
};

interface Props {
  threadId: string;
  rows: ContentRow[];
  preference: { widgets?: string[]; groupBy?: Record<string, string>; hideDone?: boolean };
  /** The same object the list below uses, so a row offers the same controls
   *  wherever it is drawn. A task in To do could be ticked and nothing else
   *  until this was shared: renaming it meant finding it again further down. */
  handlers: RowHandlers;
  /** Something was typed straight in. The page reloads to pick up the row,
   *  which the server has already written. */
  onAdded: () => void;
  onToggle: (row: ContentRow) => void;
  /** The To do fold moved. The page owns the preference, so it writes it. */
  onFold: (next: boolean) => void;
}

export function Widgets({ threadId, rows, preference, handlers, onAdded, onToggle, onFold }: Props) {
  const widgets = widgetsFor(rows, preference.widgets);
  if (widgets.length === 0) return null;

  return (
    <>
      {widgets.map((widget) => (
        <WidgetBlock
          key={widget.kind}
          widget={widget}
          dimension={preference.groupBy?.[widget.kind] ?? null}
          hideDone={preference.hideDone === true}
          threadId={threadId}
          handlers={handlers}
          onAdded={onAdded}
          onToggle={onToggle}
          onFold={onFold}
        />
      ))}
    </>
  );
}

function WidgetBlock({
  widget,
  dimension,
  hideDone,
  threadId,
  handlers,
  onAdded,
  onToggle,
  onFold,
}: {
  widget: Widget<ContentRow>;
  dimension: string | null;
  hideDone: boolean;
  threadId: string;
  handlers: RowHandlers;
  onAdded: () => void;
  onToggle: (row: ContentRow) => void;
  onFold: (next: boolean) => void;
}) {
  // Null is All, which is also where a row carrying no tag in this dimension
  // lives. Local rather than stored: a filter is what you are looking at now,
  // not a preference about the thread.
  const [only, setOnly] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  const [adding, setAdding] = useState(false);
  // Only To do earns the fold: `doneAt` is only ever set on a task, so a map
  // or a files section has nothing to hide and never draws the control.
  //
  // **A preference of the thread, not a state of the screen**, so it arrives
  // as a prop and leaves through `onFold`. It was local state seeded from the
  // prop for an hour, and a thread that loaded after the first render kept
  // the seed: folded on the server, open on the screen.
  const filters = filtersFor(widget.rows, dimension);
  const { left, done } = splitDone(matching(widget.rows, dimension, only));

  return (
    <section>
      <h2 className={styles.section}>
        {HEADINGS[widget.kind]}
        <em className={styles.sectionCount}>{widget.rows.length}</em>
        <div className={styles.sectionControls}>
          {widget.kind === "todo" && done.length > 0 ? (
            <>
              {/* One control, count and chevron together: "5 done" is the
                  label of the thing that opens them, and pressing the words
                  used to do nothing. The count is only said out loud once the
                  rows themselves are gone: while they are showing, the
                  finished rows are the count. */}
              <button
                type="button"
                className={styles.sectionDone}
                aria-pressed={hideDone}
                aria-label={
                  hideDone
                    ? `Show ${done.length} finished, currently hidden`
                    : "Hide finished, currently shown"
                }
                title={hideDone ? "Show finished" : "Hide finished"}
                onClick={() => onFold(!hideDone)}
              >
                {hideDone ? (
                  <span className={styles.sectionDoneCount}>{done.length} done</span>
                ) : null}
                <Icon name={hideDone ? "chevron-right" : "chevron-down"} size={15} />
              </button>
            </>
          ) : null}
          {/* Straight into the section, without going through the composer.
              The same model reads it, grounded in this thread, and it leaves no
              trace in the conversation: adding a task to a list is not talking
              to offload. */}
          <button
            type="button"
            className={styles.sectionAdd}
            aria-label={`Add to ${HEADINGS[widget.kind]}`}
            title="Add"
            onClick={() => setAdding(true)}
          >
            <Icon name="plus" size={15} />
          </button>
        </div>
      </h2>

      {adding ? (
        <QuickAdd
          threadId={threadId}
          section={widget.kind}
          onDone={() => {
            setAdding(false);
            onAdded();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {widget.kind === "map" ? <Pins rows={[...left, ...done]} /> : null}

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

      {left.map((row) => (
        <Row key={row.id} row={row} widget={widget.kind} handlers={handlers} onToggle={onToggle} />
      ))}

      {/* A finished task keeps its place and sinks below everything
          outstanding. Past five, the list shows the most recent and offers the
          rest: a long-running thread stays about what is left without hiding
          that the work happened. The heading toggle above hides this whole
          block; "Show all" is the separate, narrower question of whether to
          see all of them once they are already showing. */}
      {!hideDone ? (
        <>
          {(allDone ? done : done.slice(0, DONE_SHOWN)).map((row) => (
            <Row key={row.id} row={row} widget={widget.kind} handlers={handlers} onToggle={onToggle} />
          ))}

          {done.length > DONE_SHOWN && !allDone ? (
            <button type="button" className={styles.showMore} onClick={() => setAllDone(true)}>
              Show all {done.length} finished
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/** Typing straight into a section.
 *
 *  One line, enter to save, escape to put it away. It closes the moment the row
 *  is written rather than when offload has read it: the request that matters
 *  has already succeeded, and holding the field open for four seconds would
 *  stop somebody typing the next one.
 *
 *  **It never reports a failure to the model's half of this.** If the row was
 *  written, this is done. If it was not, the field stays open with the text
 *  still in it, which is the only state where anything is at risk. */
function QuickAdd({
  threadId,
  section,
  onDone,
  onCancel,
}: {
  threadId: string;
  section: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length === 0) return onCancel();
    setSaving(true);
    const written = await quickAdd(threadId, trimmed, section);
    setSaving(false);
    if (!written) return;
    setText("");
    onDone();
  }

  return (
    <div className={styles.quickAdd}>
      <input
        className={styles.quickAddField}
        value={text}
        autoFocus
        disabled={saving}
        maxLength={QUICK_ADD_CHARS}
        placeholder="Type it, offload will sort it out"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter") void save();
        }}
        aria-label="Add to this section"
      />
      <button type="button" className={styles.sectionAction} onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className={styles.quickAddSave}
        disabled={text.trim().length === 0 || saving}
        onClick={() => void save()}
      >
        Add
      </button>
    </div>
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
  handlers,
  onToggle,
  note,
}: {
  row: ContentRow;
  widget: string;
  handlers: RowHandlers;
  onToggle: (row: ContentRow) => void;
  /** Replaces the row's own meta line. Used by the repeating entry to say how
   *  often instead of naming one date the row is only standing in for. */
  note?: string;
}) {
  const done = row.doneAt !== null;

  return (
    <ContentRowView
      row={row}
      handlers={handlers}
      lead={
        widget === "todo" ? (
          // A checkbox rather than a type tile: the one row in the product you
          // act on by touching its lead element.
          <input
            type="checkbox"
            className={styles.rowCheck}
            checked={done}
            onChange={() => onToggle(row)}
            aria-label={done ? `Put ${row.title} back on the list` : `Finish ${row.title}`}
          />
        ) : (
          <span className={styles.rowIcon}>
            <Icon name={widget === "map" ? "map-pin" : "paperclip"} size={18} />
          </span>
        )
      }
      meta={note ? <span className={styles.rowMeta}>{note}</span> : <Meta row={row} />}
    />
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
