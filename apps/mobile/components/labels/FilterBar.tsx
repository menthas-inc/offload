// 025. The filter bar under the app bar: All, each label with its count, No
// label in outline, and a plus pinned to the trailing edge while the chips
// scroll under it. Only once the thread has a label: before that, the way in
// is the tag in the app bar (2026-09-29), where the Group with labels chip
// took a row of its own. Either logic: two picked shows anything carrying one or
// both. Holding a label chip opens its list. The pick is the screen's and this
// phone's; this draws it and reports presses.

import { Platform, Pressable, ScrollView, View } from "react-native";
import { isAll, pickAll, toggleLabel, toggleUnlabelled, type LabelPick } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { Chip, ChipFace } from "./Chip";
import type { Label } from "../../lib/labels";

const isAndroid = Platform.OS === "android";

export function FilterBar({
  labels,
  unlabelled,
  pick,
  onPick,
  onNew,
  onOpen,
}: {
  labels: Label[];
  unlabelled: number;
  pick: LabelPick;
  onPick: (pick: LabelPick) => void;
  onNew: () => void;
  onOpen: (labelId: string) => void;
}) {
  const COLOR = useColors();
  const ground = isAndroid ? "bg-a-surface" : "bg-surface-page";
  if (labels.length === 0) return null;
  return (
    <View className={`flex-row items-center pb-space-4 ${ground}`}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerClassName="items-center gap-space-3 pl-gutter-screen pr-space-3"
        accessibilityLabel="Filter by label"
      >
        <Chip selected={isAll(pick)} onClick={() => onPick(pickAll())}>
          All
        </Chip>
        {labels.map((label) => (
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
            <ChipFace label={label.colour} selected={pick.labels.includes(label.id)}>
              {label.count > 0 ? `${label.name} ${label.count}` : label.name}
            </ChipFace>
          </Pressable>
        ))}
        <Chip tone="outline" selected={pick.none} onClick={() => onPick(toggleUnlabelled(pick))}>
          {unlabelled > 0 ? `No label ${unlabelled}` : "No label"}
        </Chip>
      </ScrollView>
      {/* Pinned to the trailing edge on the screen's own ground: the chips
          scroll under it and it never scrolls away. */}
      <View className={`pl-space-2 pr-gutter-screen ${ground}`}>
        <Pressable
          onPress={onNew}
          hitSlop={7}
          accessibilityRole="button"
          accessibilityLabel="New label"
          className={`items-center justify-center ${isAndroid ? "rounded-sm bg-a-c" : "rounded-pill bg-surface-fill"}`}
          style={{ width: 30, minHeight: isAndroid ? 32 : 30 }}
        >
          <Glyph name="plus" size={15} color={COLOR.iconOnWell} />
        </Pressable>
      </View>
    </View>
  );
}
