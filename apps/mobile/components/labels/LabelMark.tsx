// A person's label on a row: the date chip's geometry, the label's solid,
// white words. From `components/core/LabelMark.jsx`, whose props these are.
// Pressing one opens the label's list. The filter bar is `Chip` with `label`.

import { Pressable, Text, View } from "react-native";

/** Static, so the class compiler sees every one. Index is the colour, 1 to 10. */
export const LABEL_BG = [
  "",
  "bg-label-1",
  "bg-label-2",
  "bg-label-3",
  "bg-label-4",
  "bg-label-5",
  "bg-label-6",
  "bg-label-7",
  "bg-label-8",
  "bg-label-9",
  "bg-label-10",
] as const;

export const labelBg = (colour: number): string => LABEL_BG[Math.min(10, Math.max(1, Math.round(colour) || 1))]!;

export function LabelMark({
  children,
  color,
  size = 20,
  onClick,
}: {
  children: string;
  /** Which of the ten, 1 to 10. Stored on the label, never derived. */
  color: number;
  /** 20 on a row and in Today, 24 on its own, 30 in the turn footer. */
  size?: 20 | 24 | 30;
  onClick?: (() => void) | undefined;
}) {
  const body = (
    <View
      className={`flex-row items-center rounded-xs ${labelBg(color)}`}
      style={{ minHeight: size, paddingHorizontal: size === 20 ? 7 : size === 24 ? 8 : 12 }}
    >
      <Text className="font-core font-medium text-text-on-solid" style={{ fontSize: size === 30 ? 13 : 12 }} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
  if (!onClick) return body;
  return (
    <Pressable onPress={onClick} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${children}, open its list`}>
      {body}
    </Pressable>
  );
}

/** A label's dot: the filter chip's, the sheet's, the list's name field. */
export function LabelDot({ colour, size = 8, onSolid = false }: { colour: number; size?: number; onSolid?: boolean }) {
  return (
    <View
      className={`rounded-pill ${onSolid ? "bg-text-on-solid" : labelBg(colour)}`}
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
