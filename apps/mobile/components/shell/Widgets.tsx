// The widgets a thread earns.
//
// Every row here is a row in the list below, filtered. Nothing is fetched per
// widget: the screen has one page of content and these are `filter` calls over
// it, which is what keeps the thread read a fixed number of queries however
// many widgets it earns.
//
// **A widget neither groups nor filters.** It grouped into headed sections by
// a tag dimension until 5 September 2026 and filtered by one until 025, when
// labels became the one way a thread is sorted: the filter bar under the app
// bar narrows every section at once, so a chip row inside each would be a
// second way to do the same thing.

import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import {
  DONE_SHOWN,
  liveCount,
  reorderPlan,
  splitDone,
  type ReorderWrite,
  type Sortable,
  type Widget,
} from "@offload/widgets";
import { token } from "@offload/tokens";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { ContentRowView } from "./ContentRow";
import { PhotoThumb } from "./PhotoThumb";
import { PdfOpening } from "./PdfOpening";
import { useConversation } from "./conversation-context";
import { QUICK_ADD_CHARS, TYPED_ROW_PLACEHOLDER } from "../../lib/threads";
import type { ContentRow } from "../../lib/threads";
import { useFolds } from "../../lib/folds";
import { useInPlace } from "../../lib/undo";
import { Returned, UndoLine } from "./UndoLine";
import type { FoldSection } from "@offload/widgets";

const isAndroid = Platform.OS === "android";

const HEADINGS: Record<string, string> = {
  todo: "To do",
  files: "Files",
};

export function Widgets({
  threadId,
  threadName,
  widgets,
  hideDone,
  onFold,
  onDelete,
  onEdit,
  onOpenPhoto,
  onToggle,
  onReorder,
  arrived,
}: {
  threadId: string;
  threadName: string;
  widgets: Widget<ContentRow>[];
  /** The thread's own fold, so the list opens the way it was left. The
   *  screen owns the preference, so it writes it. */
  hideDone?: boolean | undefined;
  onFold: (next: boolean) => void;
  onDelete: (row: ContentRow) => void;
  onEdit: (row: ContentRow) => void;
  /** 020. A tile in Files, or a photo row's tile, opens the viewer. */
  onOpenPhoto: (row: ContentRow) => void;
  onToggle: (row: ContentRow) => void;
  /** A row was dragged to a new place. The writes hold the new order; the
   *  screen owns the rows and the Undo, so it makes them. `moved` is the row
   *  that was dragged, whose line the Undo is drawn under. */
  onReorder: (writes: ReorderWrite[], moved: string) => void;
  arrived?: Set<string> | undefined;
}) {
  if (widgets.length === 0) return null;

  return (
    <>
      {widgets.map((widget) => (
        <WidgetBlock
          key={widget.kind}
          widget={widget}
          hideDone={hideDone === true}
          onFold={onFold}
          threadId={threadId}
          threadName={threadName}
          arrived={arrived}
          onEdit={onEdit}
          onDelete={onDelete}
          onOpenPhoto={onOpenPhoto}
          onToggle={onToggle}
          onReorder={onReorder}
        />
      ))}
    </>
  );
}

function WidgetBlock({
  widget,
  hideDone,
  onFold,
  threadId,
  threadName,
  arrived,
  onDelete,
  onEdit,
  onOpenPhoto,
  onToggle,
  onReorder,
}: {
  widget: Widget<ContentRow>;
  hideDone: boolean;
  onFold: (next: boolean) => void;
  threadId: string;
  threadName: string;
  arrived?: Set<string> | undefined;
  onDelete: (row: ContentRow) => void;
  onEdit: (row: ContentRow) => void;
  onOpenPhoto: (row: ContentRow) => void;
  onToggle: (row: ContentRow) => void;
  onReorder: (writes: ReorderWrite[], moved: string) => void;
}) {
  const COLOR = useColors();
  const { raiseFor } = useConversation();
  const [allDone, setAllDone] = useState(false);
  const [folds, setFold] = useFolds();
  const section: FoldSection = widget.kind;
  const folded = folds[section];
  // Only To do earns the fold: `doneAt` is only ever set on a task, so a
  // files section has nothing to hide and never draws the control.
  //
  // **A preference of the thread, not a state of the screen**, so it arrives
  // as a prop and leaves through `onFold`, and a list folded on web is folded
  // here.

  const { left, done } = splitDone(widget.rows);
  const shown = [...left, ...(hideDone ? [] : allDone ? done : done.slice(0, DONE_SHOWN))];
  // 2026-10-18. With the Undo lines: a row that left keeps a slot where it was.
  const placed = useInPlace(shown, (row) => row.id);

  // **Dragging, on To do and nowhere else**, and only the rows still to do: a
  // finished one has sunk and sits by when it was ticked, which is not a
  // place somebody chooses. The rows measure themselves as they lay out, so
  // where a row was dropped is read off those measurements rather than off a
  // row height that a two-line title would make wrong. The neighbours are the
  // rows on screen: a row dropped between two visible ones lands between
  // those two, whatever a filter hides in between.
  const movable = widget.kind === "todo";
  // The rule between what is left and what is finished, when both show.
  const ruled = movable && left.length > 0 && shown.length > left.length;
  const layouts = useRef(new Map<string, { y: number; height: number }>());

  function drop(id: string, dy: number): void {
    const mine = layouts.current.get(id);
    const from = left.findIndex((row) => row.id === id);
    if (!mine || from < 0) return;
    const centre = mine.y + mine.height / 2 + dy;
    let to = 0;
    for (const row of left) {
      if (row.id === id) continue;
      const theirs = layouts.current.get(row.id);
      if (theirs && theirs.y + theirs.height / 2 < centre) to += 1;
    }
    const { writes } = reorderPlan(left, from, to);
    if (writes.length > 0) onReorder(writes, id);
  }

  return (
    <View>
      <View className="flex-row items-center gap-space-3 px-gutter-screen pb-space-3 pt-space-7">
        {/* 2026-10-17. The heading folds the section, kept on the phone;
            Files starts folded. */}
        <Pressable
          onPress={() => setFold(section, !folded)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityState={{ expanded: !folded }}
          className="flex-row items-center gap-space-3"
        >
          <Text
            className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
            style={{ fontSize: 21 }}
          >
            {HEADINGS[widget.kind]}
          </Text>
          <View
            className={`rounded-pill px-space-3 py-space-1 ${
              isAndroid ? "bg-a-c" : "bg-surface-fill"
            }`}
          >
            <Text
              className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
              style={{ fontSize: 12 }}
            >
              {/* What is live in the section, not what it holds: "To do 3" is
                  how many are left, and the finished ones have their own count
                  on the fold. The kit draws exactly this. */}
              {liveCount(widget.rows as readonly Sortable[])}
            </Text>
          </View>
          <Glyph name={folded ? "chevron-right" : "chevron-down"} size={18} color={COLOR.iconOnWell} />
        </Pressable>

        {/* One wrapper carrying the trailing margin, so the toggle and the +
            bunch together at the edge instead of each pushing on its own.

            **16px apart, not 6.** Two 18px glyphs six pixels apart on a phone
            are one target as far as a thumb is concerned, and the two of them
            do opposite things: one hides finished work, the other adds work.
            Reported as pressing the wrong one. They are 22px now and a full
            gutter apart, and the hit areas no longer touch. */}
        {folded ? null : (
        <View className="ml-auto flex-row items-center gap-space-6">
          {widget.kind === "todo" && done.length > 0 ? (
            <>
              {/* One control, count and chevron together: "5 done" is the
                  label of the thing that opens them, and pressing the words
                  used to do nothing. The count is only said out loud once the
                  rows themselves are gone: while they are showing, the
                  finished rows are the count. */}
              <Pressable
                onPress={() => onFold(!hideDone)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityState={{ expanded: !hideDone }}
                accessibilityLabel={
                  hideDone
                    ? `Show ${done.length} finished, currently hidden`
                    : "Hide finished, currently shown"
                }
                className="flex-row items-center gap-space-2"
              >
                {hideDone ? (
                  <Text
                    className={`font-core font-medium ${
                      isAndroid ? "text-a-on-var" : "text-text-secondary"
                    }`}
                    style={{ fontSize: 13 }}
                  >
                    {done.length} done
                  </Text>
                ) : null}
                <Glyph
                  name={hideDone ? "chevron-right" : "chevron-down"}
                  size={22}
                  color={COLOR.iconOnWell}
                />
              </Pressable>
            </>
          ) : null}

          {/* Raises the shell's composer, pinned to this thread and this
              section: the write it already had, just typed in the one place
              a phone has already solved the keyboard. It never leaves the
              conversation, only its own field does. Not on Files: the + writes
              a row from a line of text, and a photo arrives through the
              composer (020). */}
          {widget.kind === "files" ? null : (
          <Pressable
            onPress={() =>
              raiseFor({
                threadId,
                threadName,
                write: "quickAdd",
                section: widget.kind,
                title: `Add to ${HEADINGS[widget.kind]}`,
                placeholder: TYPED_ROW_PLACEHOLDER,
                charLimit: QUICK_ADD_CHARS,
              })
            }
            hitSlop={10}
            accessibilityLabel={`Add to ${HEADINGS[widget.kind]}`}
          >
            <Glyph name="plus" size={22} color={COLOR.iconOnWell} />
          </Pressable>
          )}
        </View>
        )}
      </View>

      {folded ? null : (
      <>
      {/* 020. Files is the kit's grid: three columns of square tiles, each
          the photo itself with no treatment, or the type glyph until the
          renditions exist. A tap opens the viewer, which is where the row's
          tools are; the tile itself has none, as the kit's FileTile has none
          (ui_kits/mobile_app/ThreadWidgets.jsx). */}
      {widget.kind === "files" ? (
        <View className="flex-row flex-wrap gap-space-4 px-gutter-screen pb-space-6">
          {[...left, ...done].map((row) => (
            <FileTile key={row.id} row={row} onOpen={() => onOpenPhoto(row)} />
          ))}
        </View>
      ) : (
        placed.map((one, at) => {
          const last = at === placed.length - 1;
          if ("slot" in one) {
            return (
              <View key={one.entry.id} className={last ? "" : "border-b border-border-hairline"}>
                <UndoLine entry={one.entry} />
              </View>
            );
          }
          const { row, line } = one;
          const index = shown.indexOf(row);
          const border = !last && !(ruled && index === left.length - 1);
          return (
            <View
              key={row.id}
              onLayout={(event) => {
                const { y, height } = event.nativeEvent.layout;
                layouts.current.set(row.id, { y, height });
              }}
            >
              {/* 2026-09-29. A rule between what is left and what is finished:
                  the finished rows cannot be dragged, so they draw no handle,
                  and without the rule they read as the same list drawn
                  wrong. */}
              {/* It stands in for the last row's own border, in a darker ink. */}
              {ruled && index === left.length ? <View className="bg-text-secondary" style={{ height: 1 }} /> : null}
              <Returned id={row.id}>
                <ContentRowView
                  row={row}
                  border={border && !line}
                  arrived={arrived?.has(row.id) ?? false}
                  onDelete={() => onDelete(row)}
                  onEdit={() => onEdit(row)}
                  onOpenPhoto={() => onOpenPhoto(row)}
                  onToggle={widget.kind === "todo" ? () => onToggle(row) : undefined}
                  reorder={movable && row.doneAt === null ? { onDrop: (dy) => drop(row.id, dy) } : undefined}
                  handleSpace={movable && row.doneAt !== null}
                />
              </Returned>
              {line ? (
                <View className={border ? "border-b border-border-hairline" : ""}>
                  <UndoLine entry={line} />
                </View>
              ) : null}
            </View>
          );
        })
      )}

      {/* A finished task keeps its place and sinks below everything
          outstanding. Past five, the list shows the most recent and offers the
          rest, so a long-running thread stays about what is left without hiding
          that the work happened. The heading toggle above hides this whole
          group; this is the separate, narrower question of whether to see all
          of them once they are already showing. */}
      {!hideDone && done.length > DONE_SHOWN && !allDone ? (
        <Pressable
          onPress={() => setAllDone(true)}
          className="min-h-tap-min justify-center px-gutter-screen"
        >
          <Text className="font-core font-medium text-text-accent" style={{ fontSize: 13.5 }}>
            Show all {done.length} finished
          </Text>
        </Pressable>
      ) : null}
      </>
      )}
    </View>
  );
}

const GUTTER = parseInt(token("gutter-screen"), 10);
const GAP = parseInt(token("space-4"), 10);

/** One square in Files. From ui_kits/mobile_app/ThreadWidgets.jsx's FileTile:
 *  a hairline, the small radius, the picture cropped to the square, a glyph
 *  where there is no picture yet. Three to a row, the kit's gap between. */
function FileTile({ row, onOpen }: { row: ContentRow; onOpen: () => void }) {
  const COLOR = useColors();
  const { width } = useWindowDimensions();
  // The screen's gutter twice, the kit's gap twice, three tiles. The two
  // tokens as numbers, since a square's side is arithmetic and not a class.
  const side = Math.floor((width - 2 * GUTTER - 2 * GAP) / 3);
  // 041. A PDF's tile is page 1, the paperclip until it is drawn.
  const pdf = row.photo?.kind === "pdf" || row.type === "file";
  const glyph = (
    <View className="flex-1 items-center justify-center">
      <Glyph name={pdf ? "paperclip" : "image"} size={22} color={COLOR.iconOnWell} />
    </View>
  );
  return (
    <Pressable
      onPress={onOpen}
      accessibilityLabel={`Open ${row.title}`}
      accessibilityRole="button"
      className={`overflow-hidden rounded-sm border bg-surface-page ${
        row.archivedAt ? "border-dashed border-border-strong" : "border-border-hairline"
      }`}
      style={{ width: side, height: side }}
    >
      {row.photo ? (
        <PhotoThumb
          blobId={row.photo.blobId}
          ready={row.photo.ready}
          style={{ width: side, height: side }}
          fallback={glyph}
        />
      ) : (
        glyph
      )}
      {row.photo?.kind === "pdf" ? <PdfOpening blobId={row.photo.blobId} /> : null}
    </Pressable>
  );
}
