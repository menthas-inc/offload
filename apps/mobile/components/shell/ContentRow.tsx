// A piece of content in a thread, and the two gestures that act on it.
//
// **A swipe deletes; a long press opens the rest.** No kit draws a content row
// action on any platform, and this is the answer the design system took: the
// swipe does the one thing `SwipeRow` is built for, and the sheet lists what
// this account may actually do, which is how the authorship split is handled
// without a gesture map that is wrong for half the rows.

import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
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
import { useColors } from "../../lib/colors";
import { isFiling, type ContentRow } from "../../lib/threads";

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
  /** Stands in for the body on a row that represents more than itself.
   *
   *  A collapsed repeating entry uses it to say how often and how many are
   *  held, because the one date it happens to carry is not what it is about. */
  note?: string | undefined;
}

export function ContentRowView({
  row,
  border,
  arrived,
  onDelete,
  onActions,
  onToggle,
  note,
}: Props) {
  const COLOR = useColors();
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
            // Archived is a hollow tile with a dashed border and secondary
            // ink, never opacity: dimming a row on a warm page reads as a
            // rendering fault and takes the label under the contrast floor.
            <View
              className={`items-center justify-center rounded-sm ${
                row.archivedAt
                  ? "border border-dashed border-border-strong"
                  : isAndroid
                    ? "bg-a-c-low"
                    : "bg-surface-fill"
              }`}
              style={{ width: 36, height: 36 }}
            >
              <Glyph name={ICON[row.type] ?? "align-left"} size={18} color={COLOR.iconOnWell} />
            </View>
          )}
          <View className="flex-1">
            <Text
              className={`font-core font-medium ${
                row.doneAt || row.archivedAt
                  ? row.doneAt
                    ? "text-text-tertiary"
                    : "text-text-secondary"
                  : isAndroid
                    ? "text-a-on"
                    : "text-text-primary"
              }`}
              style={{
                fontSize: 15.5,
                lineHeight: 21,
                // A finished row keeps the tick, the sinking and a 1px strike,
                // and loses the opacity: tertiary ink already says it.
                ...(row.doneAt ? { textDecorationLine: "line-through" as const } : {}),
              }}
            >
              {row.title}
            </Text>
            {/* offload is still reading a row somebody typed straight in. The
                one spinner, not a second progress word: the readme reserves
                "filing" for a row that does not know where it is going, and
                this row knows. It is saved and usable already. */}
            {note ?? row.body ? (
              <Text
                className={`mt-space-1 font-core ${
                  isAndroid ? "text-a-on-var" : "text-text-secondary"
                }`}
                style={{ fontSize: 13 }}
                numberOfLines={2}
              >
                {note ?? row.body}
              </Text>
            ) : null}
          </View>

          {isFiling(row.filingAt) ? (
            <ActivityIndicator
              size="small"
              color={COLOR.accent}
              accessibilityLabel="offload is reading this"
            />
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
