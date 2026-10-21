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

import { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { tabOpacity } from "../../lib/tabs";
import { progress } from "../../lib/sheet";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { Composer } from "./Composer";
import { PrismField } from "../PrismField";
import { GlassBackdrop } from "./GlassBackdrop";
import { prismShift } from "../../lib/prism-scroll";
import { resolved } from "@offload/tokens";

// How long the arrival pulse is mounted: the field's run plus its settle, from
// the tokens, so a design change to either moves this too.
const PULSE_MS = (() => {
  const run = Number.parseFloat(resolved.light["prism-run"] ?? "2000");
  const settle = Number.parseFloat(resolved.light["prism-settle"] ?? "700");
  return (Number.isFinite(run) ? run : 2000) + (Number.isFinite(settle) ? settle : 700) + 200;
})();
import { useConversation } from "./conversation-context";
import { useSetPlateInset } from "./plate-inset";
import { UndoPlates } from "./UndoLine";
import { useUnplaced } from "../../lib/undo";

const isAndroid = Platform.OS === "android";

// On the plate and on the band inside it. The band clips the prism field, so
// a band without them paints square corners over the plate's round ones, which
// is how both phones drew a straight top edge.
const CORNERS = isAndroid ? "rounded-t-a-xl" : "rounded-t-lg";

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
  const { raised, sheetY, sheetTravel, plateFoot } = conversation;

  // Its height, for the pages to end above. The keyboard never changes it:
  // the tabs and the inset stay, and a keyboard for this plate's field covers
  // them before the shell lifts the composer onto it. Dropping them made every
  // keyboard, a sheet's included, re-lay the plate out on the way up and again
  // on the way down.
  const setInset = useSetPlateInset();

  // Down by their own height and the inset below them as the sheet rises,
  // fading as they go, so they leave under the sheet rather than being cut.
  //
  // 027. **And they fade under a rising keyboard**, over its first 60pt,
  // driven by the keyboard's own height, so the keyboard never visibly slides
  // over them. One opacity for both, whichever fade is further along. Once
  // gone they take no touch and leave the screen reader's order: hiding by
  // stacking order is not hiding.
  const tabsHeight = useSharedValue(0);
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const away = useAnimatedStyle(() => {
    const p = progress(sheetY.value, sheetTravel.value);
    return {
      transform: [{ translateY: p * (tabsHeight.value + insets.bottom) }],
      opacity: tabOpacity(p, keyboardHeight.value),
    };
  });
  const [gone, setGone] = useState(false);
  // 2026-10-18. The Undo lines with nowhere on the page to go, on the plate's
  // top edge, so the plate grows and the page ends above them.
  const plates = useUnplaced();

  // The arrival pulse: PrismField mounts only while a filing plays, then
  // unmounts, so nothing animates at rest. The page's field now shows through
  // the glass, which is why the resting band is gone (046).
  const filedAt = raised ? 0 : (conversation.filed?.at ?? 0);
  const [pulseAt, setPulseAt] = useState(0);
  useEffect(() => {
    if (!filedAt) return;
    setPulseAt(filedAt);
    const id = setTimeout(() => setPulseAt((v) => (v === filedAt ? 0 : v)), PULSE_MS);
    return () => clearTimeout(id);
  }, [filedAt]);
  useAnimatedReaction(
    () => tabOpacity(progress(sheetY.value, sheetTravel.value), keyboardHeight.value) === 0,
    (now, was) => {
      if (now !== was) runOnJS(setGone)(now);
    },
  );

  return (
    <View
      onLayout={(event) => setInset(event.nativeEvent.layout.height)}
      // The plate's ground is `GlassBackdrop` (046): frosted glass on iOS,
      // opaque `--surface-plate` on Android and under Reduce Transparency.
      // `overflow-hidden` clips the glass to the rounded top; the shadow is a
      // box-shadow and sits outside the box, so it is not clipped.
      className={`${CORNERS} overflow-hidden`}
      style={{
        paddingBottom: insets.bottom,
        // The kit's own shadow on the plate, which is what separates it from
        // the screen behind rather than a border. A box-shadow, not the old
        // shadow props: Android reads those as `elevation`, lit from above,
        // and the plate cast nothing upward.
        boxShadow: COLOR.plateShadow,
      }}
      importantForAccessibility={raised ? "no-hide-descendants" : "auto"}
      accessibilityElementsHidden={raised}
    >
      <GlassBackdrop />
      {plates.length > 0 ? (
        <View className="px-space-4 pt-space-4">
          <UndoPlates entries={plates} />
        </View>
      ) : null}
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
      <View className={`overflow-hidden ${CORNERS}`}>
        {/* The arrival pulse only (046): mounted while a filing plays, then
            unmounted. At rest there is no band, because the page's field shows
            through the glass. `shift` is the handed-in parallax (real and
            logged, not in the contract; see the 2026-09-08 entry and OFF-7). */}
        {pulseAt ? (
          <PrismField
            variant="band"
            veil="graded"
            arriveOnMount
            // eslint-disable-next-line no-restricted-syntax
            shift={prismShift}
          />
        ) : null}

        <Composer placeholder={placeholder} />

        {tabs.length > 0 ? (
          <Animated.View
            className="flex-row"
            style={away}
            pointerEvents={gone ? "none" : "auto"}
            accessibilityElementsHidden={gone}
            importantForAccessibility={gone ? "no-hide-descendants" : "auto"}
            onLayout={(event) => {
              tabsHeight.value = event.nativeEvent.layout.height;
              plateFoot.value = event.nativeEvent.layout.height + insets.bottom;
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
