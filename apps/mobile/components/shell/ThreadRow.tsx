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
// 028. The default thread is never in the list, so no row refuses its swipe.

import { Platform, Pressable, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { Glyph } from "../Glyph";
import { ThreadIcon } from "../ThreadIcon";
import { useColors } from "../../lib/colors";
import type { ThreadRow as Row } from "../../lib/threads";
import { REVEAL, useRowSwipe } from "./swipe";

const isAndroid = Platform.OS === "android";

interface Props {
  thread: Row;
  border: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

export function ThreadRow({ thread, border, onOpen, onDelete }: Props) {
  const COLOR = useColors();
  // The gesture is `swipe.ts`'s, shared with 040's memory row.
  const { gesture, sliding, revealed, close } = useRowSwipe(onOpen);

  return (
    <View className="relative">
      {/* The action sits behind the row and the row paints over it. */}
      <Animated.View
        className="absolute inset-y-0 right-0 bg-surface-danger"
        style={[revealed, { width: REVEAL + 24 }]}
        // Out of a screen reader's reach: it cannot swipe the row open, and
        // `pointerEvents` off leaves the button in the tree on every row. The
        // row carries Delete instead.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* The whole panel is the target, not the word in it (S10). */}
        <Pressable
          accessibilityRole="button"
          className="min-h-tap-min flex-1 items-center justify-center self-stretch"
          onPress={() => {
            close();
            onDelete();
          }}
        >
          <Text className="font-core font-medium text-text-on-solid" style={{ fontSize: 13 }}>
            Delete
          </Text>
        </Pressable>
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={sliding}
          // Centred, not top-aligned: a thread with no line under its name sits
          // against the middle of its icon, and one with a line is as tall as it.
          className={`flex-row items-center gap-space-5 px-gutter-screen py-space-4 ${
            isAndroid ? "bg-a-surface" : "bg-surface-page"
          } ${border ? "border-b border-border-hairline" : ""}`}
          accessible
          accessibilityRole="button"
          accessibilityLabel={thread.name}
          accessibilityHint={thread.meta || undefined}
          // The swipe is out of reach of a screen reader, so Delete is an
          // action on the row as well, as on the memory row.
          accessibilityActions={[{ name: "activate" }, { name: "delete", label: "Delete" }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "delete") onDelete();
            else onOpen();
          }}
        >
          <ThreadIcon icon={thread.icon} hue={thread.hue} seed={thread.id} size={isAndroid ? 44 : 40} />

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
                they drift. Empty for an empty thread of your own, and then
                not drawn (2026-09-29). */}
            {thread.meta ? (
              <Text
                className={`mt-space-1 font-core ${
                  isAndroid ? "text-a-on-var" : "text-text-secondary"
                }`}
                style={{ fontSize: 13 }}
                numberOfLines={1}
              >
                {thread.meta}
              </Text>
            ) : null}
          </View>

          {/* No trailing count. The kit draws one and it is the number the meta
              line already carries. */}
          <Glyph name="chevron-right" size={16} color={COLOR.iconOnWell} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
