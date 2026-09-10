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

import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  DONE_SHOWN,
  filtersFor,
  matching,
  splitDone,
  type Sortable,
  type Widget,
} from "@offload/widgets";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { ContentRowView } from "./ContentRow";
import { QUICK_ADD_CHARS, quickAdd } from "../../lib/threads";
import type { ContentRow } from "../../lib/threads";

const isAndroid = Platform.OS === "android";

const HEADINGS: Record<string, string> = {
  map: "Places",
  todo: "To do",
  files: "Files",
};

export function Widgets({
  threadId,
  widgets,
  groupBy: dimensions,
  onDelete,
  onActions,
  onToggle,
  onAdded,
  arrived,
}: {
  threadId: string;
  widgets: Widget<ContentRow>[];
  groupBy?: Record<string, string> | undefined;
  onDelete: (row: ContentRow) => void;
  onActions: (row: ContentRow) => void;
  onToggle: (row: ContentRow) => void;
  arrived?: Set<string> | undefined;
  /** Something was typed straight in. The screen reloads to pick up the row,
   *  which the server has already written. */
  onAdded: () => void;
}) {
  if (widgets.length === 0) return null;

  return (
    <>
      {widgets.map((widget) => (
        <WidgetBlock
          key={widget.kind}
          widget={widget}
          dimension={dimensions?.[widget.kind] ?? null}
          threadId={threadId}
          arrived={arrived}
          onAdded={onAdded}
          onDelete={onDelete}
          onActions={onActions}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

function WidgetBlock({
  widget,
  dimension,
  threadId,
  arrived,
  onDelete,
  onActions,
  onToggle,
  onAdded,
}: {
  widget: Widget<ContentRow>;
  dimension: string | null;
  threadId: string;
  arrived?: Set<string> | undefined;
  onAdded: () => void;
  onDelete: (row: ContentRow) => void;
  onActions: (row: ContentRow) => void;
  onToggle: (row: ContentRow) => void;
}) {
  const COLOR = useColors();
  // Null is All, which is also where a row carrying no tag in this dimension
  // lives. Local rather than stored: a filter is what you are looking at now.
  const [only, setOnly] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const filters = filtersFor(widget.rows as readonly Sortable[], dimension);
  const { left, done } = splitDone(matching(widget.rows, dimension, only));
  const shown = [...left, ...(allDone ? done : done.slice(0, DONE_SHOWN))];

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

        {/* Straight into the section, without going through the composer. The
            same model reads it, grounded in this thread, and it leaves no trace
            in the conversation: adding a task to a list is not talking to
            offload. */}
        <Pressable
          onPress={() => setAdding(true)}
          hitSlop={10}
          className="ml-auto"
          accessibilityLabel={`Add to ${HEADINGS[widget.kind]}`}
        >
          <Glyph name="plus" size={18} color={COLOR.iconOnWell} />
        </Pressable>
      </View>

      {adding ? (
        <View className="flex-row items-center gap-space-3 px-gutter-screen pb-space-4">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            editable={!saving}
            maxLength={QUICK_ADD_CHARS}
            placeholder="Type it, offload will sort it out"
            placeholderTextColor={COLOR.iconOnWell}
            className={`flex-1 rounded-sm border border-border-focus px-space-4 py-space-3 font-core ${
              isAndroid ? "text-a-on" : "text-text-primary"
            }`}
            style={{ fontSize: 14.5 }}
            returnKeyType="done"
            onSubmitEditing={() => {
              const text = draft.trim();
              if (text.length === 0) {
                setAdding(false);
                return;
              }
              setSaving(true);
              void quickAdd(threadId, text, widget.kind).then((written) => {
                setSaving(false);
                if (!written) return;
                setDraft("");
                setAdding(false);
                onAdded();
              });
            }}
          />
          <Pressable onPress={() => setAdding(false)} hitSlop={8}>
            <Text className="font-core font-medium text-text-secondary" style={{ fontSize: 13 }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      ) : null}

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
        <ContentRowView
          key={row.id}
          row={row}
          border={index < shown.length - 1}
          arrived={arrived?.has(row.id) ?? false}
          onDelete={() => onDelete(row)}
          onActions={() => onActions(row)}
          onToggle={widget.kind === "todo" ? () => onToggle(row) : undefined}
        />
      ))}

      {/* A finished task keeps its place and sinks below everything
          outstanding. Past five, the list shows the most recent and offers the
          rest, so a long-running thread stays about what is left without hiding
          that the work happened. */}
      {done.length > DONE_SHOWN && !allDone ? (
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
