// 025. # picks a label, as @ picks a person: the thread's labels filtered as
// you type, three rows, each a dot, the name and its count, above the
// composer so the keyboard's lift moves it with the plate. A # that matches
// no label by name offers one more row, New label "…", made when the message
// is sent. On Today there is no thread yet, so there is no list.

import { Platform, Pressable, Text, View } from "react-native";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { LabelDot } from "./LabelMark";
import type { Label } from "../../lib/labels";

const isAndroid = Platform.OS === "android";
const NAME_CHARS = 24;

export function HashList({
  labels,
  query,
  onPick,
  onNew,
}: {
  labels: Label[];
  query: string;
  onPick: (label: Label) => void;
  onNew: (name: string) => void;
}) {
  const COLOR = useColors();
  const needle = query.trim().toLowerCase();
  const shown = labels.filter((label) => !needle || label.name.toLowerCase().includes(needle)).slice(0, 3);
  const exact = labels.some((label) => label.name.toLowerCase() === needle);
  const offerNew = needle.length > 0 && !exact && labels.length < 10 && [...query].length <= NAME_CHARS;
  if (shown.length === 0 && !offerNew) return null;
  const rows = shown.length + (offerNew ? 1 : 0);
  return (
    <View
      className={`mb-space-3 rounded-lg px-space-5 py-space-2 ${isAndroid ? "bg-a-c" : "bg-surface-raised"}`}
      style={{
        shadowColor: COLOR.shadowLift.color,
        shadowOpacity: 1,
        shadowRadius: COLOR.shadowLift.radius,
        shadowOffset: { width: 0, height: COLOR.shadowLift.offsetY },
        elevation: 4,
      }}
      accessibilityRole="menu"
    >
      {shown.map((label, i) => (
        <Pressable
          key={label.id}
          onPress={() => onPick(label)}
          accessibilityRole="menuitem"
          className={`flex-row items-center gap-space-4 ${i < rows - 1 ? "border-b border-border-hairline" : ""}`}
          style={{ minHeight: 44 }}
        >
          <LabelDot colour={label.colour} />
          <Text className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15 }} numberOfLines={1}>
            {label.name}
          </Text>
          <Text className="font-core text-label text-text-tertiary" style={{ fontVariant: ["tabular-nums"] }}>
            {label.count}
          </Text>
        </Pressable>
      ))}
      {offerNew ? (
        <Pressable onPress={() => onNew(query.trim())} accessibilityRole="menuitem" className="flex-row items-center gap-space-4" style={{ minHeight: 44 }}>
          <Glyph name="plus" size={14} color={COLOR.iconOnWell} />
          <Text className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15 }} numberOfLines={1}>
            New label “{query.trim()}”
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
