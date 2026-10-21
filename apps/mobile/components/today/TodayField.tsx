// The prism field behind Today's page (046). Four static bloom images placed
// by the shared `TODAY_FIELD` layout, inside the ScrollView so they scroll with
// the content, tinted to --today-field-alpha. **Not `PrismField`**: no shader,
// nothing per frame. The whole layer drifts slowly on the UI thread, paused
// when Today is not focused and stilled under Reduce Motion, so it costs the
// GPU a cheap composited transform rather than a per-frame redraw.

import { useCallback } from "react";
import { Image, Platform, type DimensionValue } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
import { resolved, TODAY_FIELD } from "@offload/tokens";
import { useReduceMotion } from "../../lib/reduce-motion";

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
  const reduce = useReduceMotion();
  const drift = useSharedValue(0);

  // Started on focus, cancelled on blur: nothing runs while Today is off screen.
  useFocusEffect(
    useCallback(() => {
      if (reduce) {
        drift.value = 0;
        return;
      }
      drift.value = withRepeat(
        withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
      return () => cancelAnimation(drift);
    }, [reduce, drift]),
  );

  const driftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [0, 10]) },
      { translateY: interpolate(drift.value, [0, 1], [0, 8]) },
      { scale: interpolate(drift.value, [0, 1], [1, 1.05]) },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      // One composited layer on Android, so overlapping blooms do not double.
      needsOffscreenAlphaCompositing={isAndroid}
      style={[
        { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: alpha, overflow: "hidden" },
        driftStyle,
      ]}
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
    </Animated.View>
  );
}
