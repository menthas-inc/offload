// The foot every row sheet shares (2026-09-29): the way out or the undoing
// on the left, where Delete sits, and Cancel and the confirming action on the
// right. The When and Labels panels had Clear beside Save and no Cancel, so
// going back without a change meant choosing between two actions that both
// changed something.

import { Platform, Pressable, Text, View } from "react-native";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";

const isAndroid = Platform.OS === "android";
/** The pills sit 8 apart, so 4 either side is where two targets meet without
 *  overlapping. */
const SLOP = { top: 8, bottom: 8, left: 4, right: 4 };

export function SheetFoot({
  lead,
  onCancel,
  onConfirm,
  confirm,
}: {
  /** Delete, Archive, Put back or Clear. Danger draws it in clay. */
  lead?: { label: string; icon?: string; danger?: boolean; onPress: () => void } | undefined;
  onCancel: () => void;
  onConfirm: () => void;
  /** Save where it writes, Done where it hands back to a sheet that will. */
  confirm: string;
}) {
  const COLOR = useColors();
  const quiet = isAndroid ? "text-a-on-var" : "text-text-secondary";
  return (
    // Three pills that wrap at a large text size rather than pushing the
    // confirming one past the edge; whatever drops keeps to the right.
    <View className="mt-space-4 flex-row flex-wrap items-center justify-end gap-space-4">
      {lead ? (
        <Pressable
          onPress={lead.onPress}
          hitSlop={SLOP}
          accessibilityRole="button"
          accessibilityLabel={lead.label}
          className="mr-auto flex-row items-center gap-space-2 rounded-pill border border-border-hairline px-space-5"
          style={{ minHeight: 30, justifyContent: "center" }}
        >
          {lead.icon ? <Glyph name={lead.icon} size={14} color={lead.danger ? COLOR.danger : COLOR.iconOnWell} /> : null}
          <Text className={`font-core font-medium ${lead.danger ? "text-text-danger" : quiet}`} style={{ fontSize: 13 }}>
            {lead.label}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={onCancel}
        hitSlop={SLOP}
        accessibilityRole="button"
        className="rounded-pill border border-border-hairline px-space-5"
        style={{ minHeight: 30, justifyContent: "center" }}
      >
        <Text className={`font-core font-medium ${quiet}`} style={{ fontSize: 13 }}>
          Cancel
        </Text>
      </Pressable>
      <Pressable
        onPress={onConfirm}
        hitSlop={SLOP}
        accessibilityRole="button"
        className={`rounded-pill px-space-5 ${isAndroid ? "bg-a-on" : "bg-surface-inverse"}`}
        style={{ minHeight: 30, justifyContent: "center" }}
      >
        <Text className={`font-core font-medium ${isAndroid ? "text-a-surface" : "text-text-inverse"}`} style={{ fontSize: 13 }}>
          {confirm}
        </Text>
      </Pressable>
    </View>
  );
}
