// 040. One memory in the list: the sentence in full, then where it came from
// and when. From the kit's `rowH()`, the phone branch.
//
// **Not the thread note's row**, which has its own governed contract; the
// spec makes this a new row. The swipe is the thread row's, from
// `shell/swipe.ts`, parked at the shipped 88 over a clay Forget, with no
// confirmation: the toast holds Undo for eight seconds, as a thread's delete.
//
// Origin is never a colour. A learned memory carries the spark and the word in
// the noticed ink; the kind's hue is only ever the dot, and only in Newest,
// where no heading says the kind.

import { Platform, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { memoryMeta, type MemoryView } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { REVEAL, useRowSwipe } from "../shell/swipe";

const isAndroid = Platform.OS === "android";

/** Newest's dot, and the gap after it: the hairline starts past both. */
export const ROW_DOT = 10;
const DOT_GAP = 12;

export function MemoryListRow({
  memory,
  dot,
  border,
  onOpen,
  onForget,
}: {
  memory: MemoryView;
  /** The kind's hue, in Newest only. */
  dot: string | null;
  border: boolean;
  onOpen: () => void;
  onForget: () => void;
}) {
  const COLOR = useColors();
  const { gesture, sliding, revealed, close } = useRowSwipe(onOpen);
  const meta = memoryMeta(memory);
  // Tertiary on both phones, as the kit draws the meta.
  const quiet = "text-text-tertiary";

  return (
    <View className="relative">
      {/* The action sits behind the row and the row paints over it. */}
      <Animated.View
        className="absolute inset-y-0 right-0 items-center justify-center bg-surface-danger"
        style={[revealed, { width: REVEAL + 24 }]}
      >
        <Text
          className="font-core font-medium text-text-on-solid"
          style={{ fontSize: 13 }}
          onPress={() => {
            close();
            onForget();
          }}
        >
          Forget
        </Text>
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={sliding}
          className={isAndroid ? "bg-a-surface" : "bg-surface-page"}
          accessible
          accessibilityRole="button"
          accessibilityLabel={memory.text}
          accessibilityHint={`${meta.label}, ${meta.day}`}
          // The swipe is out of reach of a screen reader, so Forget is an
          // action on the row as well.
          accessibilityActions={[{ name: "activate" }, { name: "forget", label: "Forget" }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "forget") onForget();
            else onOpen();
          }}
        >
          {/* From the gutter, and past the dot in Newest. */}
          {border ? (
            <View className="pl-gutter-screen">
              <View className="border-t border-border-hairline" style={dot ? { marginLeft: ROW_DOT + DOT_GAP } : undefined} />
            </View>
          ) : null}
          <View className="flex-row items-start px-gutter-screen py-space-5" style={{ gap: DOT_GAP }}>
            {dot ? (
              <View style={{ width: ROW_DOT, height: ROW_DOT, borderRadius: ROW_DOT / 2, marginTop: 6, backgroundColor: dot }} />
            ) : null}
            <View className="flex-1">
              <Text
                className={`font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`}
                style={{ fontSize: 15.5, lineHeight: 21.7 }}
              >
                {memory.text}
              </Text>
              <View className="mt-space-2 flex-row flex-wrap items-center" style={{ gap: 5 }}>
                {meta.learned ? (
                  <View className="flex-row items-center" style={{ gap: 4 }}>
                    <Glyph name="sparkles" size={12} color={COLOR.textNoticed} />
                    <Text className="font-core text-text-noticed" style={{ fontSize: 12.5 }}>
                      {meta.label}
                    </Text>
                  </View>
                ) : (
                  <Text className={`font-core ${quiet}`} style={{ fontSize: 12.5 }}>
                    {meta.label}
                  </Text>
                )}
                <Text className={`font-core ${quiet}`} style={{ fontSize: 12.5 }}>
                  ·
                </Text>
                <Text className={`font-core ${quiet}`} style={{ fontSize: 12.5 }}>
                  {meta.day}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
