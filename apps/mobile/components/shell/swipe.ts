// A row's swipe: it slides left to park open over one action, and a tap
// closes it or opens the row. From `SwipeRow` in the design system, as the
// thread row shipped it; 040's memory row parks over Forget the same way, so
// the gesture lives here rather than in either row.

import { Gesture } from "react-native-gesture-handler";
import { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

/** How far the row parks open, from the component contract. */
export const REVEAL = 88;

const SPRING = { damping: 20, stiffness: 220 };

export function useRowSwipe(onOpen: () => void) {
  const dx = useSharedValue(0);

  const close = (): void => {
    dx.value = withSpring(0, SPRING);
  };

  const pan = Gesture.Pan()
    // Horizontal only, and only past a real threshold, or the list cannot be
    // scrolled without rows twitching under the thumb.
    .activeOffsetX([-12, 12])
    .failOffsetY([-8, 8])
    .onUpdate((event) => {
      dx.value = Math.min(0, Math.max(-REVEAL - 24, event.translationX));
    })
    .onEnd(() => {
      if (dx.value < -REVEAL / 2) {
        dx.value = withSpring(-REVEAL, SPRING);
      } else {
        dx.value = withSpring(0, SPRING);
      }
    });

  const tap = Gesture.Tap().onEnd((_event, ok) => {
    if (!ok) return;
    if (dx.value !== 0) {
      dx.value = withSpring(0, SPRING);
      return;
    }
    runOnJS(onOpen)();
  });

  const sliding = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));

  /** The reveal is a property of the gesture, not of the row's existence.
   *
   *  A ramp over the first 12px and `pointerEvents` off while closed, which is
   *  what the `SwipeRow` contract now specifies. Covering it with the row's
   *  opaque background is not enough: any group fade over the screen, a tab
   *  change or a modal, shows it through every closed row at once. */
  const revealed = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(dx.value) / 12),
    pointerEvents: dx.value === 0 ? "none" : "auto",
  }));

  return { gesture: Gesture.Simultaneous(pan, tap), sliding, revealed, close };
}
