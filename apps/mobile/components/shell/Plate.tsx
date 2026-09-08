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
import { useColors } from "../../lib/colors";
import { Composer } from "./Composer";
import { PrismField } from "../PrismField";
import { prismShift } from "../../lib/prism-scroll";
import { useConversation } from "./conversation-context";

const isAndroid = Platform.OS === "android";

export interface Tab {
  key: string;
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}

export function Plate({
  tabs,
  placeholder,
}: {
  tabs: Tab[];
  placeholder?: string | undefined;
}) {
  const COLOR = useColors();
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
      // Rounded on top only when it is the top. A raised conversation sits
      // directly on the plate, so the corners cut two notches out of the
      // join and the scrim showed through them.
      //
      // **`surface-plate` in both themes, and it is one token on purpose.**
      // It is the ground the prism field sits on and the colour the field's
      // veil is made of. If the two ever hold different values the difference
      // shows as a band exactly where the field should be vanishing: on dark
      // that read as a grey composer against a black tab strip.
      className={`bg-surface-plate ${
        raised ? "" : isAndroid ? "rounded-t-a-xl" : "rounded-t-lg"
      }`}
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

      {/* **The band, and it is the composer and the tabs only.** The folded
            title row sits above it and outside it: the field is one texture
            mapped into one box, so anything that changes the box's height
            changes the pattern, and a title row that comes and goes would
            squash it every time a conversation folded.

            `overflow: hidden` because the field may never leave this box. It
            must never sit under a scrolling list: `--text-tertiary` is exactly
            4.5:1 on paper with nothing spare, and every row's trailing time
            uses it.

            One field across composer and tabs rather than one each: each field
            maps the whole texture into its own box, so two half-height boxes
            squash the pattern and break it at the seam. */}
      <View className="overflow-hidden">
        {/* **No field when the composer is not here**, which is a divergence
            from the design system and the only honest one available.

            The handoff is explicit that the plate is composer plus tabs in
            every state including a raised conversation, so the field's box
            never changes height. This app removes the composer while a
            conversation is raised, because the raised sheet brings its own and
            two would compete for the keyboard, which is a product decision
            that predates the field.

            The consequence is visible on a device: the band collapses to the
            tab row, the whole texture and its veil squash into about seventy
            points, and `--prism-veil-reach` lands mid-label rather than above
            it, so colour sits behind the tab labels. That is the one thing the
            veil's stops exist to prevent, because `--text-tertiary` is exactly
            4.5:1 with nothing spare.

            Drawing nothing beats drawing it at the wrong height: the field is
            the composer band, and with no composer there is no band. */}
        {raised ? null : (
          <PrismField
            variant="band"
            veil="graded"
            pulse={conversation.filed?.at ?? 0}
            shift={prismShift}
          />
        )}

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
                  style={{
                    fontSize: 12,
                    color: tab.active ? COLOR.tabOn : COLOR.tabOff,
                  }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** A conversation pushed out of the way, still there.
 *
 *  The whole point of the fold: you can keep dumping without losing what
 *  offload just said, and raising it brings back every turn and the draft. */
function FoldedHeader() {
  const COLOR = useColors();
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
      <Pressable
        onPress={conversation.raise}
        hitSlop={10}
        accessibilityLabel="Open conversation"
      >
        <Glyph name="chevron-up" size={18} color={COLOR.iconOnWell} />
      </Pressable>
      <Pressable
        onPress={conversation.close}
        hitSlop={10}
        accessibilityLabel="Close conversation"
      >
        <Glyph name="x" size={18} color={COLOR.iconOnWell} />
      </Pressable>
    </View>
  );
}
