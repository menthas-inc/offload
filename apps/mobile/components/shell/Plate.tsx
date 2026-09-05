// The bottom of every screen.
//
// From `M3App.jsx`'s plate: one raised surface with rounded top corners holding,
// in order, the folded conversation header, the composer, and the tab bar. It
// is one component rather than three siblings because the keyboard moves all of
// it together and folding a conversation changes its height.
//
// **A thread screen keeps the composer and loses the tabs.** The kit hides both;
// dumping from where you are is the product's core move and a thread is the
// likeliest place to want it. Logged as a divergence.

import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";
import { Glyph } from "../Glyph";
import { COLOR } from "../../lib/colors";
import { Composer } from "./Composer";
import { useConversation } from "./conversation-context";

const isAndroid = Platform.OS === "android";

export interface Tab {
  key: string;
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}

export function Plate({ tabs, placeholder }: { tabs: Tab[]; placeholder?: string | undefined }) {
  const insets = useSafeAreaInsets();
  const conversation = useConversation();
  const folded = conversation.live !== null && conversation.folded;
  // The raised sheet brings its own composer, so the plate's would be a second
  // field behind it competing for the keyboard. `M3App.jsx` hides it for the
  // same reason: `showComposer` is false while a conversation is up.
  const raised = conversation.live !== null && !conversation.folded;

  // A keyboard means somebody is writing, and nothing else on the plate is
  // any use to them: the tabs are three places to go while they are mid
  // sentence, and the safe-area inset is padding above a nav bar the keyboard
  // is already covering. Both go, so the field sits on the keyboard.
  const writing = useKeyboardState((state) => state.isVisible);

  return (
    <View
        className={`${isAndroid ? "rounded-t-a-xl bg-a-c-low" : "rounded-t-lg bg-surface-raised"}`}
        style={{
          paddingBottom: writing ? 0 : insets.bottom,
          // The kit's own shadow on the plate, which is what separates it from
          // the screen behind rather than a border.
          shadowColor: COLOR.scrim,
          shadowOpacity: 0.16,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -6 },
          elevation: 12,
        }}
      >
        {folded ? <FoldedHeader /> : null}

        {raised ? null : <Composer placeholder={placeholder} />}

        {tabs.length > 0 && !writing ? (
          <View className="flex-row">
            {tabs.map((tab) => (
              <Pressable
                key={tab.key}
                onPress={tab.onPress}
                className="min-h-tap-min flex-1 items-center justify-center gap-space-1 py-space-3"
                accessibilityRole="tab"
                accessibilityState={{ selected: tab.active }}
              >
                <Glyph
                  name={tab.icon}
                  size={22}
                  color={tab.active ? COLOR.tabOn : COLOR.tabOff}
                />
                <Text
                  className="font-core font-medium"
                  style={{ fontSize: 12, color: tab.active ? COLOR.tabOn : COLOR.tabOff }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
    </View>
  );
}

/** A conversation pushed out of the way, still there.
 *
 *  The whole point of the fold: you can keep dumping without losing what
 *  offload just said, and raising it brings back every turn and the draft. */
function FoldedHeader() {
  const conversation = useConversation();
  if (!conversation.live) return null;

  return (
    <View className="flex-row items-center gap-space-4 border-b border-border-hairline px-gutter-screen py-space-4">
      <Pressable className="flex-1" onPress={conversation.raise} hitSlop={8}>
        <Text
          className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 14 }}
          numberOfLines={1}
        >
          {conversation.live.title}
        </Text>
      </Pressable>
      <Pressable onPress={conversation.raise} hitSlop={10} accessibilityLabel="Open conversation">
        <Glyph name="chevron-up" size={18} color={COLOR.iconOnWell} />
      </Pressable>
      <Pressable onPress={conversation.close} hitSlop={10} accessibilityLabel="Close conversation">
        <Glyph name="x" size={18} color={COLOR.iconOnWell} />
      </Pressable>
    </View>
  );
}
