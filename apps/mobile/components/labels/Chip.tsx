// `components/core/Chip.jsx` for the phones: a pill in a 44px target. With
// `label` it is a label's filter chip: neutral with the label's dot at rest,
// and the label's own solid when selected, so two picked read as two.
//
// **One component, two shapes.** iOS takes the design's 30px pill; Android
// takes the Material filter chip's 8px corners at 32, as the design's Android
// note says. Both on `minHeight`, so the words can grow with the system's
// text size.

import { Platform, Pressable, Text, View } from "react-native";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { LabelDot, labelBg } from "./LabelMark";

const isAndroid = Platform.OS === "android";

export function Chip({
  children,
  icon,
  label,
  selected = false,
  tone = "neutral",
  disabled = false,
  onClick,
}: {
  children?: string;
  icon?: string;
  /** Which of the ten label colours, when this is a label's chip. */
  label?: number | undefined;
  selected?: boolean;
  tone?: "neutral" | "outline";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <Pressable
      onPress={onClick}
      disabled={disabled}
      hitSlop={7}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
    >
      <ChipFace glyph={icon} label={label} selected={selected} tone={tone}>
        {children}
      </ChipFace>
    </Pressable>
  );
}

/** What a chip looks like, shared by `Chip` and the filter bar's label chip,
 *  which adds the hold that opens a label's list and so cannot be a `Chip`
 *  under that contract's props. One drawing, two controls. */
export function ChipFace({
  children,
  glyph,
  label,
  selected = false,
  tone = "neutral",
}: {
  children?: string | undefined;
  glyph?: string | undefined;
  label?: number | undefined;
  selected?: boolean;
  tone?: "neutral" | "outline";
}) {
  const COLOR = useColors();
  const fill = selected
    ? label
      ? labelBg(label)
      : "bg-surface-inverse"
    : tone === "outline"
      ? "border border-border-strong"
      : isAndroid
        ? "bg-a-c"
        : "bg-surface-fill";
  const ink = selected
    ? label
      ? "text-text-on-solid"
      : "text-text-inverse"
    : tone === "outline"
      ? "text-text-secondary"
      : isAndroid
        ? "text-a-on"
        : "text-text-primary";
  return (
    <View
      className={`flex-row items-center gap-space-3 px-space-5 ${isAndroid ? "rounded-sm" : "rounded-pill"} ${fill}`}
      style={{ minHeight: isAndroid ? 32 : 30 }}
    >
      {label ? <LabelDot colour={label} onSolid={selected} /> : null}
      {glyph ? <Glyph name={glyph} size={14} color={selected ? COLOR.onSolid : COLOR.iconOnWell} /> : null}
      {children ? (
        <Text className={`font-core font-medium ${ink}`} style={{ fontSize: 13, fontVariant: ["tabular-nums"] }}>
          {children}
        </Text>
      ) : null}
    </View>
  );
}
