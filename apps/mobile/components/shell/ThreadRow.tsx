// A thread in a list, and the swipe that removes it.
//
// From `SwipeRow` in the design system, which is where the behaviour comes
// from: the row slides left to park open over one action, and that action is a
// delete. **`SwipeRow` reveals a delete and nothing else** by construction, its
// glyph and its clay ground written into the component with only the label
// exposed, so nothing else is put on this gesture.
//
// **No confirmation, by decision.** The delete is soft and the toast holds it
// for eight seconds, and this is the convention the gesture comes from. The web
// confirms inline; the two clients differ on purpose and `decisions.md` records
// the argument that was overruled.
//
// The default thread does not delete, and swiping it answers rather than doing
// nothing: a gesture that silently fails is worse than one that says why.

import { Platform, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Glyph } from "../Glyph";
import { COLOR } from "../../lib/colors";
import type { ThreadRow as Row } from "../../lib/threads";

/** How far the row parks open, from the component contract. */
const REVEAL = 88;
const isAndroid = Platform.OS === "android";

interface Props {
  thread: Row;
  border: boolean;
  onOpen: () => void;
  onDelete: () => void;
  /** The default thread cannot go. Swiping it says so. */
  onRefuse: () => void;
}

export function ThreadRow({ thread, border, onOpen, onDelete, onRefuse }: Props) {
  const dx = useSharedValue(0);

  const close = (): void => {
    dx.value = withSpring(0, { damping: 20, stiffness: 220 });
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
        if (thread.isDefault) {
          dx.value = withSpring(0, { damping: 20, stiffness: 220 });
          runOnJS(onRefuse)();
          return;
        }
        dx.value = withSpring(-REVEAL, { damping: 20, stiffness: 220 });
      } else {
        dx.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const tap = Gesture.Tap().onEnd((_event, ok) => {
    if (!ok) return;
    if (dx.value !== 0) {
      dx.value = withSpring(0, { damping: 20, stiffness: 220 });
      return;
    }
    runOnJS(onOpen)();
  });

  const sliding = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));

  // Not painted at all until a swipe reveals it. It is behind an opaque row,
  // so it should never be visible either way, but a screen that cross-fades
  // fades the row's own background with everything else and the clay showed
  // straight through it: every row wore a ghost Delete for the length of the
  // tab transition. Opacity on the panel itself survives a group opacity.
  const revealed = useAnimatedStyle(() => ({ opacity: dx.value < -1 ? 1 : 0 }));

  return (
    <View className="relative">
      {/* The action sits behind the row and the row paints over it. */}
      <Animated.View
        className="absolute inset-y-0 right-0 items-center justify-center bg-clay-600"
        style={[revealed, { width: REVEAL + 24 }]}
      >
        <Text
          className="font-core font-medium text-text-on-solid"
          style={{ fontSize: 13 }}
          onPress={() => {
            close();
            onDelete();
          }}
        >
          Delete
        </Text>
      </Animated.View>

      <GestureDetector gesture={Gesture.Simultaneous(pan, tap)}>
        <Animated.View
          style={sliding}
          className={`flex-row items-start gap-space-5 px-gutter-screen py-space-4 ${
            isAndroid ? "bg-a-surface" : "bg-surface-page"
          } ${border ? "border-b border-border-hairline" : ""}`}
        >
          <View
            className={`items-center justify-center rounded-sm ${
              isAndroid ? "bg-a-c-low" : "bg-surface-fill"
            }`}
            style={{ width: 36, height: 36 }}
          >
            <Glyph name={thread.icon ?? "lasso"} size={18} color={COLOR.iconOnWell} />
          </View>

          <View className="flex-1">
            <Text
              className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`}
              style={{ fontSize: 15.5, lineHeight: 21 }}
              numberOfLines={1}
            >
              {thread.name}
            </Text>
            {/* Composed by the server, as on web. The Android kit recomposes it
                on the client, and three clients composing one string is how
                they drift. */}
            <Text
              className={`mt-space-1 font-core ${
                isAndroid ? "text-a-on-var" : "text-text-secondary"
              }`}
              style={{ fontSize: 13 }}
              numberOfLines={1}
            >
              {thread.meta}
            </Text>
          </View>

          {/* No trailing count. The kit draws one and it is the number the meta
              line already carries. */}
          <Glyph name="chevron-right" size={16} color={COLOR.iconOnWell} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
