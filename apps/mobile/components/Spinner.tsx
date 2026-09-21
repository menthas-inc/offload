// The system's own spinner, from components/feedback: an 18px ring, 1.5px of
// --ink-200 with an --ink-700 head, turning once every 720ms. Unlabelled here
// by design; a caller that has something honest to say beside it says it in
// its own text. Reduced motion holds the ring still with its head at the top,
// which still reads as waiting.

import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useColors } from "../lib/colors";

const SIZE = 18;
const TURN_MS = 720;

export function Spinner() {
  const COLOR = useColors();
  const turn = useSharedValue(0);

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!live || reduced) return;
      turn.value = withRepeat(withTiming(360, { duration: TURN_MS, easing: Easing.linear }), -1, false);
    });
    return () => {
      live = false;
      cancelAnimation(turn);
    };
  }, [turn]);

  const spinning = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[
        {
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          borderWidth: 1.5,
          borderColor: COLOR.spinnerTrack,
          borderTopColor: COLOR.spinnerHead,
        },
        spinning,
      ]}
    />
  );
}
