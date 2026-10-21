// The prism field behind Today's page (046). Four static bloom images placed
// by the shared `TODAY_FIELD` layout, inside the ScrollView so they scroll with
// the content, tinted to --today-field-alpha. **Still**: no shader, no
// animation, nothing per frame (the owner, 2026-10-21, after a slow drift was
// tried and did not look right).

import { Image, Platform, View, type DimensionValue } from "react-native";
import { useColorScheme } from "nativewind";
import { resolved, TODAY_FIELD } from "@offload/tokens";

// Static requires: Metro needs a literal path, so the src number maps here.
const BLOOM = {
  1: require("../../assets/prism/p2-bloom-1.webp"),
  2: require("../../assets/prism/p2-bloom-2.webp"),
  3: require("../../assets/prism/p2-bloom-3.webp"),
} as const;

const isAndroid = Platform.OS === "android";

export function TodayField() {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";
  const alpha = Number.parseFloat(
    (dark ? resolved.dark : resolved.light)["today-field-alpha"] ?? "0.35",
  );

  return (
    <View
      pointerEvents="none"
      // One composited layer on Android, so overlapping blooms do not double.
      needsOffscreenAlphaCompositing={isAndroid}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: alpha, overflow: "hidden" }}
    >
      {TODAY_FIELD.blooms.map((b, i) => (
        <Image
          key={i}
          source={BLOOM[b.src]}
          fadeDuration={0}
          style={{
            position: "absolute",
            top: b.top,
            width: b.width as DimensionValue,
            aspectRatio: 1,
            ...(b.from === "left"
              ? { left: b.offset as DimensionValue }
              : { right: b.offset as DimensionValue }),
          }}
        />
      ))}
    </View>
  );
}
