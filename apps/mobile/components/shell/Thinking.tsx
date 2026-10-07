// The thinking row: what the conversation shows while a turn runs.
//
// From `ui_kits/thinking_row/` in the design system, 2026-10-07. It replaced
// 017's three dots and the 2.5 second wait before the line: the Splash mark
// says working from the first frame, the model's phrase sits beside it as soon
// as one exists, and from ten seconds the Stop pill joins the row. No bubble,
// because nothing in the row is offload speaking. With no phrase it is the mark
// alone; offload never invents one.

import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useColors } from "../../lib/colors";
import { REST, SPLASH_MS, phraseWait, pose, type Drop } from "../../lib/splash";
import { useConversation } from "./conversation-context";

const isAndroid = Platform.OS === "android";

/** When the way out appears. The product owner's number. 017. */
const STOP_AFTER_MS = 10_000;

const SIZE = 22;
/** The mark is drawn on a 24 unit grid; everything below is in its units. */
const K = SIZE / 24;
const OUT = Easing.bezier(0.22, 0.85, 0.24, 1); // --ease-out

export function Thinking() {
  const { working, stop } = useConversation();
  const step = usePhrase(working?.step ?? null);
  const [canStop, setCanStop] = useState(false);

  // A timer to the one threshold left, rather than a clock: the phrase is
  // drawn when it arrives, so only Stop is a time.
  const since = working?.since ?? null;
  useEffect(() => {
    if (since === null) {
      setCanStop(false);
      return;
    }
    const wait = since + STOP_AFTER_MS - Date.now();
    if (wait <= 0) {
      setCanStop(true);
      return;
    }
    setCanStop(false);
    const timer = setTimeout(() => setCanStop(true), wait);
    return () => clearTimeout(timer);
  }, [since]);

  return (
    <View
      className="flex-row items-center"
      style={{ alignSelf: "flex-start", maxWidth: "100%", minHeight: 30, gap: 10 }}
    >
      {/* The label sits on the mark, not the row: a row made one accessible
          element hid Stop from VoiceOver on every turn with no phrase. */}
      <Splash label={step ? undefined : "offload is thinking"} />
      {step ? (
        <View
          style={{ flexShrink: 1, minWidth: 0 }}
          // Android reads the change here; iOS has no live regions, so
          // `usePhrase` announces each phrase there instead.
          accessibilityLiveRegion="polite"
        >
          <Animated.Text
            key={step.key}
            entering={phraseIn}
            exiting={phraseOut}
            numberOfLines={1}
            className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
            style={{ fontSize: 13.5 }}
          >
            {step.text}
          </Animated.Text>
        </View>
      ) : null}
      {canStop ? (
        // 8px from the phrase to Stop; from the mark alone, the row's 10.
        <Animated.View entering={stopIn} style={{ marginLeft: step ? -2 : 0 }}>
          <Pressable
            onPress={stop}
            hitSlop={{ top: 7, bottom: 7 }}
            accessibilityRole="button"
            accessibilityLabel="Stop"
            className={`flex-row items-center rounded-pill border ${
              isAndroid ? "border-ink-400" : "border-border-strong"
            }`}
            style={{ minHeight: 30, paddingLeft: 11, paddingRight: 12, gap: 7 }}
          >
            <View
              className={isAndroid ? "bg-a-on" : "bg-text-primary"}
              style={{ width: 7, height: 7, borderRadius: 2 }}
            />
            <Text
              className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`}
              style={{ fontSize: 13 }}
            >
              Stop
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The phrase on screen, with the floor applied: a phrase that lands within
 *  400ms of the last one waits its turn, and only the newest is shown. */
function usePhrase(step: string | null): { text: string; key: number } | null {
  const [line, setLine] = useState(step ? { text: step, key: 0 } : null);
  const shownAt = useRef<number | null>(step ? Date.now() : null);
  const keys = useRef(0);

  const current = line?.text ?? null;
  useEffect(() => {
    if (step === current) return;
    const timer = setTimeout(() => {
      shownAt.current = Date.now();
      keys.current += 1;
      setLine(step ? { text: step, key: keys.current } : null);
      if (step && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(step);
    }, phraseWait(shownAt.current, Date.now()));
    return () => clearTimeout(timer);
  }, [step, current]);

  return line;
}

// The old phrase leaves upward and the new one arrives from below, 350ms on
// --ease-out, in the same place. The web adds a 3px blur, which a phone's text
// cannot take cheaply; the fade and the 3px carry it.
function phraseIn() {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 3 }] },
    animations: {
      opacity: withTiming(1, { duration: 350, easing: OUT }),
      transform: [{ translateY: withTiming(0, { duration: 350, easing: OUT }) }],
    },
  };
}

function phraseOut() {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: 350, easing: OUT }),
      transform: [{ translateY: withTiming(-3, { duration: 350, easing: OUT }) }],
    },
  };
}

function stopIn() {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.8 }] },
    animations: {
      opacity: withTiming(1, { duration: 300, easing: OUT }),
      transform: [{ scale: withTiming(1, { duration: 300, easing: OUT }) }],
    },
  };
}

/** The mark, animated: one clock and each part reading its own keyframes off
 *  it, so the five stay in step. Never restarted by a phrase or by Stop. */
function Splash({ label }: { label: string | undefined }) {
  const COLOR = useColors();
  const still = useReducedMotion();
  const clock = useSharedValue(0);

  useEffect(() => {
    if (still) return;
    clock.value = withRepeat(withTiming(1, { duration: SPLASH_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(clock);
  }, [clock, still]);

  // The dot is centred at (12, 5.25) with r 2.6, scaled about its centre.
  const dot = useAnimatedStyle(() => {
    const d = still ? REST.dot : pose(clock.value).dot;
    return {
      opacity: d.opacity,
      transform: [{ translateY: d.y * K }, { scaleX: d.sx }, { scaleY: d.sy }],
    };
  });

  // The vessel gives from its bottom centre, (12, 18.5).
  const vessel = useAnimatedStyle(() => {
    const v = still ? REST.vessel : pose(clock.value).vessel;
    return { transform: [{ scaleX: v.sx }, { scaleY: v.sy }] };
  });

  return (
    <View
      style={{ width: SIZE, height: SIZE }}
      accessible={label !== undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={label === undefined}
      importantForAccessibility={label === undefined ? "no-hide-descendants" : "yes"}
    >
      <Animated.View
        style={[
          { position: "absolute", left: 0, top: 0, width: SIZE, height: SIZE, transformOrigin: [12 * K, 18.5 * K, 0] },
          vessel,
        ]}
      >
        <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24">
          <Path
            d="M5.5 11.5V15.5a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3V11.5"
            fill="none"
            stroke={COLOR.ink}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
      <Droplet clock={clock} still={still} part="left" r={1.05} color={COLOR.ink} />
      <Droplet clock={clock} still={still} part="right" r={0.9} color={COLOR.ink} />
      <Droplet clock={clock} still={still} part="centre" r={0.75} color={COLOR.ink} />
      <Animated.View
        style={[
          {
            position: "absolute",
            left: (12 - 2.6) * K,
            top: (5.25 - 2.6) * K,
            width: 5.2 * K,
            height: 5.2 * K,
            borderRadius: 2.6 * K,
            backgroundColor: COLOR.ink,
          },
          dot,
        ]}
      />
    </View>
  );
}

/** A droplet, centred at (12, 14) and scaled about its own centre. */
function Droplet({
  clock,
  still,
  part,
  r,
  color,
}: {
  clock: SharedValue<number>;
  still: boolean;
  part: "left" | "right" | "centre";
  r: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const d: Drop = still ? REST[part] : pose(clock.value)[part];
    return {
      opacity: d.opacity,
      transform: [{ translateX: d.x * K }, { translateY: d.y * K }, { scale: d.s }],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: (12 - r) * K,
          top: (14 - r) * K,
          width: 2 * r * K,
          height: 2 * r * K,
          borderRadius: r * K,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}
