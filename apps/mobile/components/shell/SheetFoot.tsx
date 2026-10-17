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
  also,
  onCancel,
  onConfirm,
  confirm,
  disabled = false,
}: {
  /** Delete, Archive, Put back or Clear. Danger draws it in clay. */
  lead?: { label: string; icon?: string; danger?: boolean; onPress: () => void } | undefined;
  /** 2026-10-17. A second way out, drawn before the lead: Archive, then
   *  Delete, on your own row, as the web's tools end on the trash. */
  also?: { label: string; icon?: string; onPress: () => void } | undefined;
  onCancel: () => void;
  onConfirm: () => void;
  /** Save where it writes, Done where it hands back to a sheet that will. */
  confirm: string;
  /** 028. The confirming pill, until what it would write is writable. */
  disabled?: boolean;
}) {
  const COLOR = useColors();
  const quiet = isAndroid ? "text-a-on-var" : "text-text-secondary";
  return (
    // Three pills, or four with Archive before Delete, that wrap at a large
    // text size rather than pushing the confirming one past the edge;
    // whatever drops keeps to the right.
    <View className="mt-space-4 flex-row flex-wrap items-center justify-end gap-space-4">
      {also ? (
        <Pressable
          onPress={also.onPress}
          hitSlop={SLOP}
          accessibilityRole="button"
          accessibilityLabel={also.label}
          className={`${lead ? "" : "mr-auto "}flex-row items-center gap-space-2 rounded-pill border border-border-hairline px-space-5`}
          style={{ minHeight: 30, justifyContent: "center" }}
        >
          {also.icon ? <Glyph name={also.icon} size={14} color={COLOR.iconOnWell} /> : null}
          <Text className={`font-core font-medium ${quiet}`} style={{ fontSize: 13 }}>
            {also.label}
          </Text>
        </Pressable>
      ) : null}
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
        disabled={disabled}
        hitSlop={SLOP}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className={`rounded-pill px-space-5 ${disabled ? "bg-state-disabled-surface" : isAndroid ? "bg-a-on" : "bg-surface-inverse"}`}
        style={{ minHeight: 30, justifyContent: "center" }}
      >
        <Text
          className={`font-core font-medium ${disabled ? "text-state-disabled-text" : isAndroid ? "text-a-surface" : "text-text-inverse"}`}
          style={{ fontSize: 13 }}
        >
          {confirm}
        </Text>
      </Pressable>
    </View>
  );
}
