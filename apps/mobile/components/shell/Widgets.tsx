// The widgets a thread earns, and the groups inside them.
//
// Every row here is a row in the list below, filtered. Nothing is fetched per
// widget: the screen has one page of content and these are `filter` calls over
// it, which is what keeps the thread read a fixed number of queries however
// many widgets it earns.
//
// **Groups, not the kit's filter chips.** `ThreadWidgets.jsx` puts a
// single-select `ChipRow` above a flat list; the product owner asked for
// grouping and web builds headed sections, so one behaviour across three
// clients rather than two. Logged as a divergence.

import { Platform, Text, View } from "react-native";
import { groupBy, type Widget } from "@offload/widgets";
import { ContentRowView } from "./ContentRow";
import type { ContentRow } from "../../lib/threads";

const isAndroid = Platform.OS === "android";

const HEADINGS: Record<string, string> = {
  map: "Places",
  todo: "To do",
  timeline: "Timeline",
  files: "Files",
};

export function Widgets({
  widgets,
  groupBy: dimensions,
  onDelete,
  onActions,
  onToggle,
}: {
  widgets: Widget<ContentRow>[];
  groupBy?: Record<string, string> | undefined;
  onDelete: (row: ContentRow) => void;
  onActions: (row: ContentRow) => void;
  onToggle: (row: ContentRow) => void;
}) {
  if (widgets.length === 0) return null;

  return (
    <>
      {widgets.map((widget) => {
        const groups = groupBy(widget.rows, dimensions?.[widget.kind] ?? null);
        return (
          <View key={widget.kind}>
            <View className="flex-row items-center gap-space-3 px-gutter-screen pb-space-3 pt-space-7">
              <Text
                className={`font-core font-semibold ${
                  isAndroid ? "text-a-on" : "text-text-primary"
                }`}
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
            </View>

            {groups.map((group) => (
              <View key={group.value ?? "__untagged"}>
                {/* The unnamed group has no heading at all: it holds rows with
                    no tag in this dimension, and "Other" would be a label
                    offload invented for content nobody categorised. */}
                {group.value ? (
                  <Text
                    className="px-gutter-screen pb-space-2 pt-space-4 font-core text-text-accent"
                    style={{ fontSize: 13 }}
                  >
                    {group.value} · {group.rows.length}
                  </Text>
                ) : groups.length > 1 ? (
                  <Text
                    className="px-gutter-screen pb-space-2 pt-space-4 font-core text-text-tertiary"
                    style={{ fontSize: 13 }}
                  >
                    Everything else
                  </Text>
                ) : null}

                {group.rows.map((row, i) => (
                  <ContentRowView
                    key={row.id}
                    row={row}
                    border={i < group.rows.length - 1}
                    onDelete={() => onDelete(row)}
                    onActions={() => onActions(row)}
                    onToggle={widget.kind === "todo" ? () => onToggle(row) : undefined}
                  />
                ))}
              </View>
            ))}
          </View>
        );
      })}
    </>
  );
}
