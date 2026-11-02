// 2026-11-02 (the owner). A phone number in a row's details, as one pill on
// the row, in its sheet and in the viewer: the secondary pill 044's PDF
// actions use, with a phone glyph. The number is on the pill, so the
// destination shows before the tap, and the platform's own call prompt (iOS)
// or dialer (Android) is the confirm: offload dials nothing itself.
//
// Read from the caption only, never the words read out of the picture, so the
// number on the pill is one the screen already shows.

import { Linking, Pressable, Text } from "react-native";
import { phoneIn, photoCaption } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";

export function CallPill({ text }: { text: string | null | undefined }) {
  const COLOR = useColors();
  const phone = phoneIn(photoCaption(text));
  if (!phone) return null;
  return (
    <Pressable
      onPress={() => void Linking.openURL(phone.tel)}
      hitSlop={10}
      accessibilityRole="button"
      className="mt-space-1 flex-row items-center gap-space-1 self-start rounded-pill border border-border-strong bg-surface-fill px-space-3 py-space-2"
    >
      <Glyph name="phone" size={13} color={COLOR.accent} />
      <Text className="font-core text-text-primary" style={{ fontSize: 13, fontVariant: ["tabular-nums"] }}>
        Call {phone.shown}
      </Text>
    </Pressable>
  );
}
