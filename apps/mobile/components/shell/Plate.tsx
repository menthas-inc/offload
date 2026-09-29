// The bottom of every screen.
//
// From `M3App.jsx`'s plate: one raised surface with rounded top corners holding
// the composer and the tab bar. One component rather than two siblings because
// the keyboard moves all of it together.
//
// **A fixed shape** (30 September 2026). A raised conversation covers the plate
// rather than changing it: the composer and its prism band stay mounted and
// keep their height underneath, and the tabs slide down under the sheet on the
// sheet's own position, a transform and an opacity, never a height. **Every
// screen keeps its tabs**, a thread included; they leave only under the
// conversation or the plate's own keyboard.

import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { progress } from "../../lib/sheet";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { Composer } from "./Composer";
import { PrismField } from "../PrismField";
import { prismShift } from "../../lib/prism-scroll";
import { useConversation } from "./conversation-context";
import { useSetPlateInset } from "./plate-inset";

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
  const { raised, sheetY, sheetTravel } = conversation;

  // A keyboard for this plate's own field means somebody is writing, and
  // nothing else on the plate is any use to them: the tabs are three places to
  // go mid sentence, and the safe-area inset is padding above a nav bar the
  // keyboard is already covering. Both go, so the field sits on the keyboard.
  // The sheet's keyboard is not this plate's business: under a raised
  // conversation the plate keeps its shape.
  const keyboard = useKeyboardState((state) => state.isVisible);
  const writing = keyboard && !raised;

  // Its height, for the pages to end above. Not while writing: the tab row
  // and the bottom inset go with the keyboard up, and a page that shrank its
  // room to match would shift under a keyboard nobody can see past.
  const setInset = useSetPlateInset();

  // Down by their own height and the inset below them as the sheet rises,
  // fading as they go, so they leave under the sheet rather than being cut.
  const tabsHeight = useSharedValue(0);
  const away = useAnimatedStyle(() => {
    const p = progress(sheetY.value, sheetTravel.value);
    return {
      transform: [{ translateY: p * (tabsHeight.value + insets.bottom) }],
      opacity: 1 - p,
    };
  });

  return (
    <View
      onLayout={writing ? undefined : (event) => setInset(event.nativeEvent.layout.height)}
      // **`surface-plate` in both themes, and it is one token on purpose.**
      // It is the ground the prism field sits on and the colour the field's
      // veil is made of. If the two ever hold different values the difference
      // shows as a band exactly where the field should be vanishing: on dark
      // that read as a grey composer against a black tab strip.
      className={`bg-surface-plate ${isAndroid ? "rounded-t-a-xl" : "rounded-t-lg"}`}
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
      importantForAccessibility={raised ? "no-hide-descendants" : "auto"}
      accessibilityElementsHidden={raised}
    >
      {/* **The band, and it is the composer and the tabs only.**

            `overflow: hidden` because the field may never leave this box. It
            must never sit under a scrolling list: `--text-tertiary` is exactly
            4.5:1 on paper with nothing spare, and every row's trailing time
            uses it.

            One field across composer and tabs rather than one each: each field
            maps the whole texture into its own box, so two half-height boxes
            squash the pattern and break it at the seam. It stays mounted and
            the same height under a raised conversation, which covers it; the
            pulse goes to whichever field is on top. */}
      <View className="overflow-hidden">
        <PrismField
          variant="band"
          veil="graded"
          pulse={raised ? 0 : (conversation.filed?.at ?? 0)}
          // The design system's contract does not declare `shift`, and the
          // rule enforcing that arrived with the 14 September sync, which is
          // the first time `PrismField` was in the enforced set at all.
          //
          // The prop is real and logged: the web component attaches its own
          // scroll listener, React Native has no equivalent, and the plate
          // lives above the router while the lists live in the tab screens,
          // so a shared value is the only thing that can span them. See the
          // 2026-09-08 entry, "the parallax is handed in rather than listened
          // for". Code wins and the contract catches up (OFF-7), so this is
          // disabled here rather than the feature being removed.
          // eslint-disable-next-line no-restricted-syntax
          shift={prismShift}
        />

        <Composer placeholder={placeholder} />

        {tabs.length > 0 && !writing ? (
          <Animated.View
            className="flex-row"
            style={away}
            onLayout={(event) => {
              tabsHeight.value = event.nativeEvent.layout.height;
            }}
          >
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
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}
