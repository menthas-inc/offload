// A photo waiting in the composer, from ui_kits/mobile_app/Composer.jsx.
//
// The image glyph, the name clipped at twenty characters, and a remove
// control that is a plain glyph rather than an IconButton: a 44px hit area
// inside a 26px chip bleeds its hover pill past the chip's own edge, so the
// glyph is 18px and the hit area comes from hitSlop. One line beside the name
// when the photo was refused on the device, the failure table's own words.

import { Pressable, Text, View } from "react-native";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";

export type ChipError = "too_big" | "not_a_photo" | null;

const LINES: Record<Exclude<ChipError, null>, string> = {
  too_big: "Too big to send.",
  not_a_photo: "Only photos.",
};

export function AttachChip({
  name,
  error,
  disabled,
  onRemove,
}: {
  name: string;
  error: ChipError;
  /** While the send is out: a chip removed then would still go. */
  disabled?: boolean;
  onRemove: () => void;
}) {
  const COLOR = useColors();
  const shown = name.length > 20 ? `${name.slice(0, 20)}…` : name;
  return (
    <View
      className={`flex-row items-center gap-space-1 rounded-pill border bg-surface-raised ${
        error ? "border-border-danger" : "border-border-hairline"
      }`}
      style={{ minHeight: 26, paddingLeft: 8, paddingRight: 4, maxWidth: "100%" }}
    >
      <Glyph name="image" size={13} color={COLOR.iconOnWell} />
      <Text
        className="font-core text-text-secondary"
        style={{ fontSize: 12.5, lineHeight: 15 }}
        numberOfLines={1}
      >
        {shown}
      </Text>
      {error ? (
        <Text
          className="font-core text-text-danger"
          style={{ fontSize: 12.5, lineHeight: 15 }}
          accessibilityLiveRegion="polite"
        >
          {LINES[error]}
        </Text>
      ) : null}
      <Pressable
        onPress={onRemove}
        disabled={disabled}
        hitSlop={13}
        accessibilityLabel={`Remove ${name}`}
        accessibilityState={{ disabled: Boolean(disabled) }}
        className="items-center justify-center rounded-pill"
        style={{ width: 18, height: 18, opacity: disabled ? 0.4 : 1 }}
      >
        <Glyph name="x" size={12} color={COLOR.iconOnWell} />
      </Pressable>
    </View>
  );
}
