// 033. The intro: one screen that plays itself.
//
// Three scenes of 9.6s under story bars. It moves on by itself and tapping the
// art jumps ahead; **Continue is the only button** and leaves from any scene,
// since the scenes advance themselves and the only thing left to decide is
// leaving. With reduced motion or a screen reader running nothing moves on its
// own: each scene shows its end state and the art, a button named Next scene,
// is how to see the next.
//
// The prism blooms behind the art and nowhere else; the copy sits on the page
// over its lower edge, so no text is ever on the field.

import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { PrismField } from "../PrismField";
import { atOpacity, useColors } from "../../lib/colors";
import { INTRO } from "../../lib/gate";
import { SCENE_MS, autoAdvance, introNext } from "../../lib/firstRun";
import { IntroArt } from "./IntroArt";
import { RunFooter } from "./RunFooter";
import { GUTTER, SKIN, titleStyle, type Tone } from "./skin";

/** Reduced motion and a running screen reader, followed as they change. */
function useStillness(): { reduceMotion: boolean; screenReader: boolean } {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    const reader = AccessibilityInfo.addEventListener("screenReaderChanged", setScreenReader);
    return () => {
      motion.remove();
      reader.remove();
    };
  }, []);
  return { reduceMotion, screenReader };
}

function Bar({ state, tone, scene, playing }: { state: "done" | "now" | "later"; tone: Tone; scene: number; playing: boolean }) {
  const fill = useSharedValue(state === "done" || (state === "now" && !playing) ? 1 : 0);
  useEffect(() => {
    if (state === "now" && playing) {
      fill.value = 0;
      fill.value = withTiming(1, { duration: SCENE_MS, easing: Easing.linear });
    } else {
      fill.value = state === "later" ? 0 : 1;
    }
    // `scene` restarts the fill when the art is tapped onto the same bar.
  }, [state, playing, scene, fill]);
  const COLOR = useColors();
  const width = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    // The track is ink at 10%, which flips with the theme; the exploration's
    // black at 10% vanishes on a dark page.
    <View className="flex-1 overflow-hidden rounded-pill" style={{ height: 4, backgroundColor: atOpacity(COLOR.ink, 0.1) }}>
      <Animated.View className={`h-full rounded-pill ${SKIN[tone].barFill}`} style={width} />
    </View>
  );
}

/** One scene's words, fading in with an 8px rise as the last fades out. */
function Copy({ index, current, tone }: { index: number; current: number; tone: Tone }) {
  const on = index === current;
  const shown = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    shown.value = withTiming(on ? 1 : 0, { duration: 600 });
  }, [on, shown]);
  const fading = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: 8 * (1 - shown.value) }] }));
  const scene = INTRO[index]!;
  return (
    <Animated.View
      // The current scene is in the flow and sets the height; the others sit
      // over it while they fade, and are not read.
      // Absolute insets on Yoga count from the parent's border box, not its
      // padding, so the gutter and the 4 above are repeated here (checked on
      // the simulator; zero put the outgoing words against the screen edge).
      style={[on ? undefined : { position: "absolute", top: 4, left: GUTTER, right: GUTTER }, fading]}
      importantForAccessibility={on ? "auto" : "no-hide-descendants"}
      accessibilityElementsHidden={!on}
    >
      <Text className={`font-core font-semibold ${SKIN[tone].text}`} style={titleStyle(tone)}>
        {scene.title}
      </Text>
      <Text className={`font-core ${SKIN[tone].quiet}`} style={{ marginTop: 14, fontSize: 18, lineHeight: 26 }}>
        {scene.line}
      </Text>
    </Animated.View>
  );
}

export function Intro({ tone, button, onLeave }: { tone: Tone; button: string; onLeave: () => void }) {
  const [scene, setScene] = useState(0);
  // Bumped by a tap, so tapping restarts the clock even when the timer and
  // the tap land on the same scene.
  const [tapped, setTapped] = useState(0);
  const stillness = useStillness();
  const playing = autoAdvance(stillness);

  // Android reads the copy as a live region; iOS has none, so VoiceOver is
  // told each new scene. Not on the first, which is read as the screen opens.
  useEffect(() => {
    if (Platform.OS !== "ios" || !stillness.screenReader || (scene === 0 && tapped === 0)) return;
    const { title, line } = INTRO[scene]!;
    AccessibilityInfo.announceForAccessibility(`${title}. ${line}`);
  }, [scene, tapped, stillness.screenReader]);

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setScene(introNext), SCENE_MS);
    return () => clearTimeout(timer);
  }, [playing, scene, tapped]);

  return (
    <View className="flex-1">
      <View className="flex-row" style={{ gap: 6, paddingTop: 8, paddingHorizontal: GUTTER }}>
        {INTRO.map((item, index) => (
          <Bar
            key={item.title}
            tone={tone}
            scene={scene + tapped * 3}
            playing={playing}
            state={index < scene ? "done" : index === scene ? "now" : "later"}
          />
        ))}
      </View>

      <View className="flex-1 overflow-hidden">
        <PrismField variant="bloom" veil="none" arriveOnMount />
        <Pressable
          onPress={() => {
            setScene(introNext);
            setTapped((n) => n + 1);
          }}
          accessibilityRole="button"
          accessibilityLabel="Next scene"
          className="flex-1 justify-center"
          style={{ paddingHorizontal: GUTTER }}
        >
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <IntroArt scene={scene} tone={tone} animate={!stillness.reduceMotion && !stillness.screenReader} />
          </View>
        </Pressable>
      </View>

      <View
        className={SKIN[tone].page}
        style={{ minHeight: 190, paddingTop: 4, paddingHorizontal: GUTTER }}
        accessibilityLiveRegion="polite"
      >
        {INTRO.map((item, index) => (
          <Copy key={item.title} index={index} current={scene} tone={tone} />
        ))}
      </View>

      <RunFooter tone={tone} main={{ label: button, onPress: onLeave }} />
    </View>
  );
}
