"use client";

// The widgets a thread earns.
//
// From ui_kits/android_app/M3ThreadWidgets.jsx, whose own comment is the rule
// this implements: "widgets a thread earns from its own contents: a map when it
// has places, a file grid when it has assets." *The timeline was one of these
// and is 015's rail now, above this; the map was, and is 030's own map behind
// the List | Map switch.*
//
// **A widget is a view, never a store.** Every row here is a row in "Everything
// in here", filtered. Nothing is fetched per widget: the page has one content
// page and these are `filter` calls over it, which is what keeps the thread
// read a fixed number of queries however many widgets a thread earns.
//
// **A widget neither groups nor filters.** It grouped into headed sections by
// a tag dimension until 5 September 2026 and filtered by one until 025, when
// labels became the one way a thread is sorted: the filter bar above the page
// narrows every section at once, so a chip row inside each would be a second
// way to do the same thing.

import { useState } from "react";
import styles from "../../app/(shell)/shell.module.css";
import { Icon } from "../Icon";
import { PhotoThumb } from "../shell/PhotoThumb";
import { InPlace } from "../shell/InPlace";
import { ContentRowView, type RowHandlers } from "./ContentRowView";
import type { RowReorder } from "./RowTools";
import {
  DONE_SHOWN,
  liveCount,
  reorderPlan,
  splitDone,
  widgetsFor,
  type ReorderWrite,
  type Widget,
} from "../../lib/widgets";
import { useFolds } from "../../lib/folds";
import type { FoldSection } from "@offload/widgets";
import { QUICK_ADD_CHARS, TYPED_ROW_PLACEHOLDER } from "../../lib/threads";
import type { ContentRow } from "../../lib/threads";

const HEADINGS: Record<string, string> = {
  todo: "To do",
  files: "Files",
};

interface Props {
  rows: ContentRow[];
  preference: { widgets?: string[]; hideDone?: boolean };
  /** The same object the list below uses, so a row offers the same controls
   *  wherever it is drawn. A task in To do could be ticked and nothing else
   *  until this was shared: renaming it meant finding it again further down. */
  handlers: RowHandlers;
  /** Something was typed straight into a section. The page owns the rows, so
   *  it draws the new one and writes it. */
  onAdd: (text: string, section: string) => void;
  onToggle: (row: ContentRow) => void;
  /** The To do fold moved. The page owns the preference, so it writes it. */
  onFold: (next: boolean) => void;
  /** A row was dragged to a new place. The writes hold the new order; the page
   *  owns the rows and the Undo, so it makes them. */
  onReorder: (writes: ReorderWrite[], moved: string) => void;
}

export function Widgets({
  rows,
  preference,
  handlers,
  onAdd,
  onToggle,
  onFold,
  onReorder,
}: Props) {
  const widgets = widgetsFor(rows, preference.widgets);
  if (widgets.length === 0) return null;

  return (
    <>
      {widgets.map((widget) => (
        <WidgetBlock
          key={widget.kind}
          widget={widget}
          hideDone={preference.hideDone === true}
          handlers={handlers}
          onAdd={onAdd}
          onToggle={onToggle}
          onFold={onFold}
          onReorder={onReorder}
        />
      ))}
    </>
  );
}

function WidgetBlock({
  widget,
  hideDone,
  handlers,
  onAdd,
  onToggle,
  onFold,
  onReorder,
}: {
  widget: Widget<ContentRow>;
  hideDone: boolean;
  handlers: RowHandlers;
  onAdd: (text: string, section: string) => void;
  onToggle: (row: ContentRow) => void;
  onFold: (next: boolean) => void;
  onReorder: (writes: ReorderWrite[], moved: string) => void;
}) {
  const [allDone, setAllDone] = useState(false);
  const [adding, setAdding] = useState(false);
  // 2026-10-17. The section folds from its heading, kept in this browser;
  // Files starts folded. Folding with the add field open is its Cancel.
  const [folds, setFold] = useFolds();
  const section: FoldSection = widget.kind;
  const folded = folds[section];
  // Only To do earns the fold: `doneAt` is only ever set on a task, so a
  // files section has nothing to hide and never draws the control.
  //
  // **A preference of the thread, not a state of the screen**, so it arrives
  // as a prop and leaves through `onFold`. It was local state seeded from the
  // prop for an hour, and a thread that loaded after the first render kept
  // the seed: folded on the server, open on the screen.
  const { left, done } = splitDone(widget.rows);

  // **Dragging, on To do and nowhere else.** It is the one list a person
  // arranges: a file grid is ordered by nothing anybody reaches for. Only the rows still to do move; a finished one has sunk and
  // sits by when it was ticked, which is not a place somebody chooses.
  //
  // The neighbours are the rows on screen. A filter or the fold hides rows,
  // and a row dropped between two visible ones lands between those two
  // whatever sits between them out of sight, which is what the drop meant.
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  function moveTo(fromId: string, toIndex: number): void {
    const from = left.findIndex((row) => row.id === fromId);
    if (from < 0 || toIndex < 0 || toIndex >= left.length) return;
    const { writes } = reorderPlan(left, from, toIndex);
    if (writes.length > 0) onReorder(writes, fromId);
  }

  const reorderFor = (row: ContentRow, index: number): RowReorder | undefined => {
    if (widget.kind !== "todo") return undefined;
    const fromIndex = dragging ? left.findIndex((one) => one.id === dragging) : -1;
    return {
      over:
        dragging && dragging !== row.id && over === row.id
          ? fromIndex < index
            ? "below"
            : "above"
          : null,
      dragging: dragging === row.id,
      onDragStart: () => setDragging(row.id),
      onDragEnd: () => {
        setDragging(null);
        setOver(null);
      },
      onDragOver: () => setOver(row.id),
      onDrop: () => {
        if (dragging) moveTo(dragging, index);
        setDragging(null);
        setOver(null);
      },
      onStep: (delta) => moveTo(row.id, index + delta),
    };
  };

  return (
    <section>
      <h2 className={styles.section}>
        <button type="button" className={styles.sectionFold} aria-expanded={!folded} onClick={() => {
            setAdding(false);
            setFold(section, !folded);
          }}>
          {HEADINGS[widget.kind]}
          {/* What is live in the section, not what it holds: "To do 3" is how
              many are left, and the finished ones have their own count on the
              fold. The kit draws exactly this. */}
          <em className={styles.sectionCount}>{liveCount(widget.rows)}</em>
          <Icon name={folded ? "chevron-right" : "chevron-down"} size={15} className={styles.sectionFoldGlyph} />
        </button>
        {folded ? null : <div className={styles.sectionControls}>
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
          {/* 020. Not on Files: the + writes a row from a line of text, and a
              photo arrives through the composer. */}
          {widget.kind !== "files" ? (
            <button
              type="button"
              className={styles.sectionAdd}
              aria-label={`Add to ${HEADINGS[widget.kind]}`}
              title="Add"
              onClick={() => setAdding(true)}
            >
              <Icon name="plus" size={15} />
            </button>
          ) : null}
        </div>}
      </h2>

      {folded ? null : <>
      {adding ? (
        <QuickAdd
          onAdd={(text) => {
            setAdding(false);
            onAdd(text, widget.kind);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {/* 020. Files is the kit's grid, three columns of square tiles, each
          the photo itself with no treatment, or the type glyph until the
          renditions exist. A tap opens the viewer, which is where the row's
          tools are; the tile itself has none, as the kit's FileTile has none
          (ui_kits/mobile_app/ThreadWidgets.jsx). */}
      {widget.kind === "files" ? (
        <div className={styles.fileGrid}>
          {[...left, ...done].map((row) => (
            <FileTile key={row.id} row={row} onOpen={() => handlers.onOpenPhoto?.(row)} />
          ))}
        </div>
      ) : (
        // 2026-10-18. A row that leaves keeps its slot for its Undo line.
        <InPlace items={left} idOf={(row) => row.id}>
          {(row) => (
            <Row row={row} widget={widget.kind} handlers={handlers} onToggle={onToggle} reorder={reorderFor(row, left.indexOf(row))} />
          )}
        </InPlace>
      )}

      {/* A finished task keeps its place and sinks below everything
          outstanding. Past five, the list shows the most recent and offers the
          rest: a long-running thread stays about what is left without hiding
          that the work happened. The heading toggle above hides this whole
          block; "Show all" is the separate, narrower question of whether to
          see all of them once they are already showing. */}
      {!hideDone && widget.kind !== "files" ? (
        <>
          {/* 2026-09-29. A rule between what is left and what is finished:
              the finished rows cannot be dragged, so they draw no handle, and
              without the rule they read as the same list drawn wrong. */}
          {widget.kind === "todo" && left.length > 0 && done.length > 0 ? <hr className={styles.doneRule} /> : null}
          <InPlace items={allDone ? done : done.slice(0, DONE_SHOWN)} idOf={(row) => row.id}>
            {(row) => <Row row={row} widget={widget.kind} handlers={handlers} onToggle={onToggle} />}
          </InPlace>

          {done.length > DONE_SHOWN && !allDone ? (
            <button type="button" className={styles.showMore} onClick={() => setAllDone(true)}>
              Show all {done.length} finished
            </button>
          ) : null}
        </>
      ) : null}
      </>}
    </section>
  );
}

/** Typing straight into a section.
 *
 *  One line, enter to add, escape to put it away. It closes at the press: the
 *  page draws the row there and then and writes it behind, so the field is
 *  never held open for a round trip, and a write that fails takes the row
 *  away again and offers the words back through the toast rather than through
 *  a field that is still sitting here. */
function QuickAdd({ onAdd, onCancel }: { onAdd: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState("");

  function save(): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return onCancel();
    onAdd(trimmed);
  }

  return (
    <div className={styles.quickAdd}>
      <input
        className={styles.quickAddField}
        value={text}
        autoFocus
        maxLength={QUICK_ADD_CHARS}
        placeholder={TYPED_ROW_PLACEHOLDER}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter") save();
        }}
        aria-label="Add to this section"
      />
      <button type="button" className={styles.sectionAction} onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className={styles.quickAddSave}
        disabled={text.trim().length === 0}
        onClick={save}
      >
        Add
      </button>
    </div>
  );
}

/** A chip from the contract: 30px pill, selection inverts to ink, and the count
 *  rides inside the label rather than in a second element. */
/** One square in Files. From ui_kits/mobile_app/ThreadWidgets.jsx's FileTile:
 *  a hairline, `--radius-sm`, the picture cropped to the square, a glyph where
 *  there is no picture yet. */
function FileTile({ row, onOpen }: { row: ContentRow; onOpen: () => void }) {
  // 041. A PDF's tile is page 1, and the paperclip until it is drawn.
  const glyph = (
    <span className={styles.fileTileGlyph} aria-hidden="true">
      <Icon name={row.photo?.kind === "pdf" || row.type === "file" ? "paperclip" : "image"} size={22} />
    </span>
  );
  return (
    <button
      type="button"
      className={styles.fileTile}
      aria-label={`Open ${row.title}`}
      title={row.title}
      data-archived={row.archivedAt ? true : undefined}
      onClick={onOpen}
    >
      {row.photo ? (
        <PhotoThumb
          blobId={row.photo.blobId}
          ready={row.photo.ready}
          alt=""
          className={styles.fileTilePicture}
          fallback={glyph}
        />
      ) : (
        glyph
      )}
    </button>
  );
}

function Row({
  row,
  widget,
  handlers,
  onToggle,
  note,
  reorder,
}: {
  row: ContentRow;
  widget: string;
  handlers: RowHandlers;
  onToggle: (row: ContentRow) => void;
  /** Replaces the row's own meta line. Used by the repeating entry to say how
   *  often instead of naming one date the row is only standing in for. */
  note?: string;
  /** The row can be dragged to a new place. To do's unfinished rows only. */
  reorder?: RowReorder | undefined;
}) {
  const done = row.doneAt !== null;

  return (
    <ContentRowView
      row={row}
      handlers={handlers}
      reorder={reorder}
      handleSpace={widget === "todo" && done}
      checkbox={widget === "todo"}
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
            <Icon name="paperclip" size={18} />
          </span>
        )
      }
      meta={note ? <span className={styles.rowMeta}>{note}</span> : null}
    />
  );
}

