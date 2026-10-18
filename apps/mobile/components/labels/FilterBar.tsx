// 025. The filter bar under the app bar: All, each label with its count, No
// label in outline, and a plus pinned to the trailing edge while the chips
// scroll under it. Only once the thread has a label: before that, the way in
// is the tag in the app bar (2026-09-29), where the Group with labels chip
// took a row of its own. Either logic: two picked shows anything carrying one or
// both. Holding a label chip opens its list. The pick is the screen's and this
// phone's; this draws it and reports presses. A deleted label's Undo line is
// drawn in its chip, pill-shaped, for the window (2026-10-18).

import { Platform, Pressable, ScrollView, View } from "react-native";
import { isAll, pickAll, toggleLabel, toggleUnlabelled, type LabelPick } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { Chip, ChipFace } from "./Chip";
import type { Label } from "../../lib/labels";
import { useInPlace } from "../../lib/undo";
import { PILL_RADIUS } from "../shell/InPlace";
import { UndoLine } from "../shell/UndoLine";

const isAndroid = Platform.OS === "android";
/** A chip's line is wider than a chip, so its words have room in the row. */
const LINE_WIDTH = 240;

export function FilterBar({
  labels,
  unlabelled,
  pick,
  onPick,
  onNew,
  onOpen,
  floating = false,
}: {
  /** 030. Over the map on Map: raised chips with no counts and no plus, on
   *  no ground of their own. */
  floating?: boolean;
  labels: Label[];
  unlabelled: number;
  pick: LabelPick;
  onPick: (pick: LabelPick) => void;
  onNew: () => void;
  onOpen: (labelId: string) => void;
}) {
  const COLOR = useColors();
  const ground = floating ? "" : isAndroid ? "bg-a-surface" : "bg-surface-page";
  const placed = useInPlace(labels, (label) => `label:${label.id}`);
  // Over the map there is no line: the list's bar draws it.
  if ((floating ? labels.length : placed.length) === 0) return null;
  return (
    <View className={`flex-row items-center ${floating ? "py-space-4" : "pb-space-4"} ${ground}`}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerClassName="items-center gap-space-3 pl-gutter-screen pr-space-3"
        accessibilityLabel="Filter by label"
      >
        {floating ? (
          <RaisedChip selected={isAll(pick)} onPress={() => onPick(pickAll())}>
            All
          </RaisedChip>
        ) : (
          <Chip selected={isAll(pick)} onClick={() => onPick(pickAll())}>
            All
          </Chip>
        )}
        {placed.map((one) => {
          if ("slot" in one) {
            return floating ? null : (
              <View key={one.entry.id} style={{ width: LINE_WIDTH }}>
                <UndoLine entry={one.entry} radius={PILL_RADIUS} height={isAndroid ? 32 : 30} />
              </View>
            );
          }
          const label = one.row;
          return (
            <Pressable
              key={label.id}
              onPress={() => onPick(toggleLabel(pick, label.id))}
              onLongPress={() => onOpen(label.id)}
              delayLongPress={400}
              hitSlop={7}
              accessibilityRole="button"
              accessibilityState={{ selected: pick.labels.includes(label.id) }}
              accessibilityHint="Hold to rename, recolour or delete"
            >
              <ChipFace label={label.colour} selected={pick.labels.includes(label.id)} raised={floating}>
                {label.count > 0 && !floating ? `${label.name} ${label.count}` : label.name}
              </ChipFace>
            </Pressable>
          );
        })}
        {floating ? (
          <RaisedChip selected={pick.none} onPress={() => onPick(toggleUnlabelled(pick))}>
            No label
          </RaisedChip>
        ) : (
          <Chip tone="outline" selected={pick.none} onClick={() => onPick(toggleUnlabelled(pick))}>
            {unlabelled > 0 ? `No label ${unlabelled}` : "No label"}
          </Chip>
        )}
      </ScrollView>
      {/* Pinned to the trailing edge on the screen's own ground: the chips
          scroll under it and it never scrolls away. Not over the map. */}
      {floating ? null : (
      <View className={`pl-space-2 pr-gutter-screen ${ground}`}>
        <Pressable
          onPress={onNew}
          hitSlop={7}
          accessibilityRole="button"
          accessibilityLabel="New label"
          className={`items-center justify-center ${isAndroid ? "rounded-sm bg-a-c" : "rounded-pill bg-surface-fill"}`}
          // Dark theme: edges (design decisions, 2026-10-07).
          style={{ width: 30, minHeight: isAndroid ? 32 : 30, boxShadow: `inset 0 0 0 1px ${COLOR.edgeWell}` }}
        >
          <Glyph name="plus" size={15} color={COLOR.iconOnWell} />
        </Pressable>
      </View>
      )}
    </View>
  );
}

/** 030. A chip over the map: the same face, raised off it. A pressable of its
 *  own rather than `Chip`, whose contract has no raised face. */
function RaisedChip({ children, selected, onPress }: { children: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={7} accessibilityRole="button" accessibilityState={{ selected }}>
      <ChipFace selected={selected} raised>
        {children}
      </ChipFace>
    </Pressable>
  );
}
