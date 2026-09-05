// A piece of content in a thread, and the two gestures that act on it.
//
// **A swipe deletes; a long press opens the rest.** No kit draws a content row
// action on any platform, and this is the answer the design system took: the
// swipe does the one thing `SwipeRow` is built for, and the sheet lists what
// this account may actually do, which is how the authorship split is handled
// without a gesture map that is wrong for half the rows.

import { Platform, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useEffect } from "react";
import Animated, {
  ReduceMotion,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { Glyph } from "../Glyph";
import { COLOR } from "../../lib/colors";
import type { ContentRow } from "../../lib/threads";

const REVEAL = 88;
const isAndroid = Platform.OS === "android";

const ICON: Record<string, string> = {
  task: "circle-check",
  event: "calendar",
  location: "map-pin",
  link: "link",
  image: "image",
  screenshot: "image",
  file: "file",
  voice: "mic",
  note: "align-left",
};

interface Props {
  row: ContentRow;
  border: boolean;
  onDelete: () => void;
  onActions: () => void;
  /** Arrived while somebody was looking at the screen, so it is marked for a
   *  moment rather than simply being there. */
  arrived?: boolean | undefined;
  /** Only a to-do row gets one. The kit draws these as real checkboxes rather
   *  than list rows, and a tick is one tap rather than a long press into a
   *  sheet, because it is the thing people do most. */
  onToggle?: (() => void) | undefined;
}

export function ContentRowView({ row, border, arrived, onDelete, onActions, onToggle }: Props) {
  const dx = useSharedValue(0);
  const settle = () => withSpring(0, { damping: 20, stiffness: 220 });

  // The change mark: a moss ground settling to transparent over 1400ms. Moss
  // because it already means "offload did this, you didn't", which is exactly
  // what happened. Reduced motion drops it rather than shortening it, because
  // a flash that is only briefer is still a flash.
  const mark = useSharedValue(arrived ? 1 : 0);
  useEffect(() => {
    if (!arrived) return;
    mark.value = 1;
    mark.value = withTiming(0, { duration: 1400, reduceMotion: ReduceMotion.System });
  }, [arrived, mark]);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-8, 8])
    .onUpdate((event) => {
      dx.value = Math.min(0, Math.max(-REVEAL - 24, event.translationX));
    })
    .onEnd(() => {
      // Only the author may delete, and the server decides that, so a row that
      // is not yours does not park open at all rather than opening onto a
      // control the server will refuse.
      dx.value = dx.value < -REVEAL / 2 && row.canDelete
        ? withSpring(-REVEAL, { damping: 20, stiffness: 220 })
        : settle();
    });

  const long = Gesture.LongPress()
    .minDuration(320)
    .onStart(() => {
      dx.value = settle();
      runOnJS(onActions)();
    });

  const sliding = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.value }],
    backgroundColor: interpolateColor(mark.value, [0, 1], [COLOR.page, COLOR.accentSoft]),
  }));

  // Not painted at all until a swipe reveals it. It is behind an opaque row,
  // so it should never be visible either way, but a screen that cross-fades
  // fades the row's own background with everything else and the clay showed
  // straight through it: every row wore a ghost Delete for the length of the
  // tab transition. Opacity on the panel itself survives a group opacity.
  const revealed = useAnimatedStyle(() => ({ opacity: dx.value < -1 ? 1 : 0 }));

  return (
    <View className="relative">
      <Animated.View
        className="absolute inset-y-0 right-0 items-center justify-center bg-clay-600"
        style={[revealed, { width: REVEAL + 24 }]}
      >
        <Text
          className="font-core font-medium text-text-on-solid"
          style={{ fontSize: 13 }}
          onPress={() => {
            dx.value = settle();
            onDelete();
          }}
        >
          Delete
        </Text>
      </Animated.View>

      <GestureDetector gesture={Gesture.Simultaneous(pan, long)}>
        <Animated.View
          style={sliding}
          className={`flex-row items-start gap-space-5 px-gutter-screen py-space-4 ${
            border ? "border-b border-border-hairline" : ""
          }`}
        >
          {onToggle ? (
            <Pressable
              onPress={onToggle}
              hitSlop={12}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: row.doneAt !== null }}
              className="items-center justify-center rounded-xs border"
              style={{
                width: 21,
                height: 21,
                marginTop: 2,
                borderColor: row.doneAt ? COLOR.accent : COLOR.iconOnWell,
                backgroundColor: row.doneAt ? COLOR.accent : "transparent",
              }}
            >
              {row.doneAt ? <Glyph name="check" size={13} color={COLOR.onSolid} /> : null}
            </Pressable>
          ) : (
            <View
              className={`items-center justify-center rounded-sm ${
                isAndroid ? "bg-a-c-low" : "bg-surface-fill"
              }`}
              style={{ width: 36, height: 36, opacity: row.archivedAt ? 0.5 : 1 }}
            >
              <Glyph name={ICON[row.type] ?? "align-left"} size={18} color={COLOR.iconOnWell} />
            </View>
          )}
          <View className="flex-1" style={{ opacity: row.archivedAt ? 0.5 : 1 }}>
            <Text
              className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`}
              style={{
                fontSize: 15.5,
                lineHeight: 21,
                ...(row.doneAt ? { textDecorationLine: "line-through" as const, opacity: 0.55 } : {}),
              }}
            >
              {row.title}
            </Text>
            {row.body ? (
              <Text
                className={`mt-space-1 font-core ${
                  isAndroid ? "text-a-on-var" : "text-text-secondary"
                }`}
                style={{ fontSize: 13 }}
                numberOfLines={2}
              >
                {row.body}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
