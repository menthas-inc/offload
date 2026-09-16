// The widgets a thread earns, and the filter inside them.
//
// Every row here is a row in the list below, filtered. Nothing is fetched per
// widget: the screen has one page of content and these are `filter` calls over
// it, which is what keeps the thread read a fixed number of queries however
// many widgets it earns.
//
// **It filters, it does not group.** `ThreadWidgets.jsx` always put a
// single-select `ChipRow` above a flat list, and this grouped into headed
// sections instead until 5 September 2026, when the divergence was put back to
// the product owner and answered the kit's way: a screen whose promise is that
// nothing needs filing should not lead with structure somebody has to read.
// The group heading and the bare "Everything else" heading went with it.

import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import {
  DONE_SHOWN,
  filtersFor,
  matching,
  reorderPlan,
  splitDone,
  type ReorderWrite,
  type Sortable,
  type Widget,
} from "@offload/widgets";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { ContentRowView } from "./ContentRow";
import { useConversation } from "./conversation-context";
import { QUICK_ADD_CHARS } from "../../lib/threads";
import type { ContentRow } from "../../lib/threads";

const isAndroid = Platform.OS === "android";

const HEADINGS: Record<string, string> = {
  map: "Places",
  todo: "To do",
  files: "Files",
};

export function Widgets({
  threadId,
  threadName,
  widgets,
  groupBy: dimensions,
  hideDone,
  onFold,
  onDelete,
  onActions,
  onEdit,
  onArchive,
  onToggle,
  onReorder,
  arrived,
}: {
  threadId: string;
  threadName: string;
  widgets: Widget<ContentRow>[];
  groupBy?: Record<string, string> | undefined;
  /** The thread's own fold, so the list opens the way it was left. The
   *  screen owns the preference, so it writes it. */
  hideDone?: boolean | undefined;
  onFold: (next: boolean) => void;
  onDelete: (row: ContentRow) => void;
  onActions: (row: ContentRow) => void;
  onEdit: (row: ContentRow) => void;
  onArchive: (row: ContentRow) => void;
  onToggle: (row: ContentRow) => void;
  /** A row was dragged to a new place. The writes hold the new order; the
   *  screen owns the rows and the Undo, so it makes them. */
  onReorder: (writes: ReorderWrite[]) => void;
  arrived?: Set<string> | undefined;
}) {
  if (widgets.length === 0) return null;

  return (
    <>
      {widgets.map((widget) => (
        <WidgetBlock
          key={widget.kind}
          widget={widget}
          dimension={dimensions?.[widget.kind] ?? null}
          hideDone={hideDone === true}
          onFold={onFold}
          threadId={threadId}
          threadName={threadName}
          arrived={arrived}
          onEdit={onEdit}
          onArchive={onArchive}
          onDelete={onDelete}
          onActions={onActions}
          onToggle={onToggle}
          onReorder={onReorder}
        />
      ))}
    </>
  );
}

function WidgetBlock({
  widget,
  dimension,
  hideDone,
  onFold,
  threadId,
  threadName,
  arrived,
  onDelete,
  onActions,
  onEdit,
  onArchive,
  onToggle,
  onReorder,
}: {
  widget: Widget<ContentRow>;
  dimension: string | null;
  hideDone: boolean;
  onFold: (next: boolean) => void;
  threadId: string;
  threadName: string;
  arrived?: Set<string> | undefined;
  onDelete: (row: ContentRow) => void;
  onActions: (row: ContentRow) => void;
  onEdit: (row: ContentRow) => void;
  onArchive: (row: ContentRow) => void;
  onToggle: (row: ContentRow) => void;
  onReorder: (writes: ReorderWrite[]) => void;
}) {
  const COLOR = useColors();
  const { raiseFor } = useConversation();
  // Null is All, which is also where a row carrying no tag in this dimension
  // lives. Local rather than stored: a filter is what you are looking at now.
  const [only, setOnly] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  // Only To do earns the fold: `doneAt` is only ever set on a task, so a map
  // or a files section has nothing to hide and never draws the control.
  //
  // **A preference of the thread, not a state of the screen**, so it arrives
  // as a prop and leaves through `onFold`, and a list folded on web is folded
  // here.

  const filters = filtersFor(widget.rows as readonly Sortable[], dimension);
  const { left, done } = splitDone(matching(widget.rows, dimension, only));
  const shown = [...left, ...(hideDone ? [] : allDone ? done : done.slice(0, DONE_SHOWN))];

  // **Dragging, on To do and nowhere else**, and only the rows still to do: a
  // finished one has sunk and sits by when it was ticked, which is not a
  // place somebody chooses. The rows measure themselves as they lay out, so
  // where a row was dropped is read off those measurements rather than off a
  // row height that a two-line title would make wrong. The neighbours are the
  // rows on screen: a row dropped between two visible ones lands between
  // those two, whatever a filter hides in between.
  const movable = widget.kind === "todo";
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
    if (writes.length > 0) onReorder(writes);
  }

  return (
    <View>
      <View className="flex-row items-center gap-space-3 px-gutter-screen pb-space-3 pt-space-7">
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
            {widget.rows.length}
          </Text>
        </View>

        {/* One wrapper carrying the trailing margin, so the toggle and the +
            bunch together at the edge instead of each pushing on its own.

            **16px apart, not 6.** Two 18px glyphs six pixels apart on a phone
            are one target as far as a thumb is concerned, and the two of them
            do opposite things: one hides finished work, the other adds work.
            Reported as pressing the wrong one. They are 22px now and a full
            gutter apart, and the hit areas no longer touch. */}
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
              conversation, only its own field does. */}
          <Pressable
            onPress={() =>
              raiseFor({
                threadId,
                threadName,
                write: "quickAdd",
                section: widget.kind,
                title: `Add to ${HEADINGS[widget.kind]}`,
                placeholder: "Type it, offload will sort it out",
                charLimit: QUICK_ADD_CHARS,
              })
            }
            hitSlop={10}
            accessibilityLabel={`Add to ${HEADINGS[widget.kind]}`}
          >
            <Glyph name="plus" size={22} color={COLOR.iconOnWell} />
          </Pressable>
        </View>
      </View>

      {/* One row of chips, single select, All first. It scrolls sideways rather
          than wrapping: a filter that reflows to two lines moves the list under
          it every time you pick something. Below two values there is nothing to
          choose between, so it does not draw. */}
      {filters.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-space-3 px-gutter-screen pb-space-4"
        >
          <FilterChip
            label="All"
            count={widget.rows.length}
            on={only === null}
            onPick={() => setOnly(null)}
          />
          {filters.map((filter) => (
            <FilterChip
              key={filter.value}
              label={filter.value}
              count={filter.count}
              on={only === filter.value}
              onPick={() => setOnly(filter.value)}
            />
          ))}
        </ScrollView>
      ) : null}

      {shown.map((row, index) => (
        <View
          key={row.id}
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            layouts.current.set(row.id, { y, height });
          }}
        >
          <ContentRowView
            row={row}
            border={index < shown.length - 1}
            arrived={arrived?.has(row.id) ?? false}
            onDelete={() => onDelete(row)}
            onActions={() => onActions(row)}
            onEdit={() => onEdit(row)}
            onArchive={() => onArchive(row)}
            onToggle={widget.kind === "todo" ? () => onToggle(row) : undefined}
            reorder={movable && row.doneAt === null ? { onDrop: (dy) => drop(row.id, dy) } : undefined}
          />
        </View>
      ))}

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
    </View>
  );
}

/** A chip from the contract: 30px pill, selection inverts to ink. */
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
    <Pressable
      onPress={onPick}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      className={`flex-row items-center rounded-pill px-space-5 ${
        on ? "bg-surface-inverse" : isAndroid ? "bg-a-c" : "bg-surface-fill"
      }`}
      style={{ height: 30 }}
    >
      <Text
        className={`font-core font-medium ${
          on ? "text-text-inverse" : isAndroid ? "text-a-on" : "text-text-primary"
        }`}
        style={{ fontSize: 13 }}
      >
        {label} {count}
      </Text>
    </Pressable>
  );
}
