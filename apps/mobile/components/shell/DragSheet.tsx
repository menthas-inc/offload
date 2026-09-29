// Every sheet on the phones, on one drag (30 September 2026).
//
// From `handoff/APPLY-2026-09-29-conversation-sheet.md`: a grabber at the top,
// the sheet follows the finger, a release past a quarter or a flick down
// closes it, and anything less springs back. **A drag closes without saving,
// exactly as Cancel does.** The scrim is not timed on its own: it reads the
// sheet's position, so the two can never drift. Row sheets dim the page and
// never make it recede; only the conversation does that.
//
// One position drives it, `y`, on the UI thread. Opening springs it from the
// sheet's measured height to 0; the finger moves it; releasing springs it from
// the finger's own speed. A close that starts here (the grabber, the scrim,
// Android's back) runs to the edge and only then tells the caller, so React
// state follows the animation rather than leading it. A close the caller
// starts (Cancel, Save, an action) unmounts the sheet, and the exit then runs
// the same spring from wherever the sheet was.
//
// The timed `sheetIn` and `sheetOut` in `lib/motion.ts` are what this
// replaced; the durations there stay for anything that is not dragged.

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Keyboard, Platform, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  runOnJS,
  runOnUI,
  scrollTo,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";
import { atOpacity, useColors } from "../../lib/colors";
import { backPull, closes, dragTo, progress, SLOP } from "../../lib/sheet";
import { closeSpring, openSpring } from "../../lib/motion";
import { useSheetBack } from "../../lib/sheet-back";
import { useScreenSheet } from "./conversation-context";

const isAndroid = Platform.OS === "android";

/** Where a sheet sits before it has a size: well off the bottom. */
export const OFFSCREEN = 10_000;

/** Past the edge by a little, so the shadow leaves with the sheet. */
const PAST = 16;


/** A list inside a sheet, for the drag to take over when it is at its top. */
export interface SheetScroll {
  offset: SharedValue<number>;
  ref: AnimatedRef<Animated.ScrollView>;
  native: GestureType;
}

/** The pan that moves a sheet. One per region: the grabber strip always
 *  takes the drag; a list takes it only from its top and moving down, and
 *  holds the list at its top while the sheet moves, so the two never scroll
 *  at once.
 *
 *  `onCloseStart` runs on release, before the spring (put the keyboard away,
 *  bring the plate back); `onClosed` once the sheet is off the screen. */
export function useSheetDrag({
  y,
  travel,
  held,
  onCloseStart,
  onClosed,
  scroll,
}: {
  y: SharedValue<number>;
  travel: SharedValue<number>;
  held: SharedValue<number>;
  onCloseStart: () => void;
  onClosed: () => void;
  scroll?: SheetScroll | undefined;
}) {
  const start = useSharedValue(0);
  const anchor = useSharedValue(0);
  const engaged = useSharedValue(false);
  const last = useSharedValue(0);

  let pan = Gesture.Pan()
    .activeOffsetY([-SLOP, SLOP])
    .onStart((event) => {
      last.value = event.translationY;
      anchor.value = event.translationY;
      // From a list, only once it is at its top and the finger is going down.
      engaged.value = !scroll || (scroll.offset.value <= 0 && event.translationY > 0);
      if (!engaged.value) return;
      cancelAnimation(y);
      start.value = y.value;
      held.value = 1;
    })
    .onUpdate((event) => {
      if (!engaged.value) {
        const down = event.translationY > last.value;
        last.value = event.translationY;
        if (!scroll || scroll.offset.value > 0 || !down) return;
        engaged.value = true;
        cancelAnimation(y);
        start.value = y.value;
        anchor.value = event.translationY;
        held.value = 1;
      }
      y.value = dragTo(start.value, event.translationY, anchor.value);
      if (scroll) scrollTo(scroll.ref, 0, 0, false);
    })
    .onEnd((event) => {
      if (!engaged.value) return;
      const close = closes(y.value, event.velocityY, travel.value);
      if (close) runOnJS(onCloseStart)();
      y.value = withSpring(
        close ? travel.value + PAST : 0,
        { ...(close ? closeSpring : openSpring), velocity: event.velocityY },
        (done) => {
          if (done && close) runOnJS(onClosed)();
        },
      );
    })
    .onFinalize(() => {
      engaged.value = false;
      held.value = 0;
    });
  if (scroll) pan = pan.simultaneousWithExternalGesture(scroll.native);
  return pan;
}

/** The grabber: 36 by 4 on iOS, 32 on Android as M3 draws it, 8 from the
 *  top, widening by 8 while it is held. The whole strip takes the drag. */
export function Grabber({ held, pan }: { held: SharedValue<number>; pan: GestureType }) {
  const base = isAndroid ? 32 : 36;
  const bar = useAnimatedStyle(() => ({
    width: withTiming(base + 8 * held.value, { duration: 150, reduceMotion: ReduceMotion.System }),
  }));
  return (
    <GestureDetector gesture={pan}>
      <View
        className="items-center"
        style={{ paddingTop: 8, paddingBottom: 12 }}
        hitSlop={{ top: 8, bottom: 8 }}
        accessibilityRole="adjustable"
        accessibilityLabel="Sheet grabber"
      >
        <Animated.View
          className={`rounded-pill ${isAndroid ? "bg-a-outline" : "bg-border-strong"}`}
          style={[{ height: 4 }, bar]}
        />
      </View>
    </GestureDetector>
  );
}

/** A sheet anchored to the bottom of a screen, with its scrim.
 *
 *  `keyboard`: `lift` raises the whole sheet by the keyboard (a short sheet
 *  with a field); `room` grows it from its foot by the keyboard, so a tall
 *  sheet's top never leaves the screen. */
export function DragSheet({
  onClose,
  children,
  className = "",
  style,
  sheetStyle,
  surface,
  keyboard,
  scrim = 0.35,
  accessibilityLabel,
}: {
  /** The scrim, the grabber, and Android's back. Cancel, never Save. */
  onClose: () => void;
  children: ReactNode;
  /** The body's own padding and layout, under the grabber. */
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** The sheet's own box: a `maxHeight`, or a `top` for a full sheet. */
  sheetStyle?: StyleProp<ViewStyle>;
  /** Corner and fill, when not the row sheets' own. */
  surface?: string;
  keyboard?: "lift" | "room";
  scrim?: number;
  accessibilityLabel?: string;
}) {
  const COLOR = useColors();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(OFFSCREEN);
  const travel = useSharedValue(0);
  const held = useSharedValue(0);
  const opened = useRef(false);
  const [closing, setClosing] = useState(false);
  // The plate comes back as the sheet starts to leave, not after it has gone.
  useScreenSheet(!closing);

  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  const leave = useCallback(() => {
    Keyboard.dismiss();
    setClosing(true);
  }, []);
  const dismiss = useCallback(() => {
    leave();
    y.value = withSpring(travel.value + PAST, closeSpring, (done) => {
      if (done) runOnJS(onClose)();
    });
  }, [leave, onClose, travel, y]);

  const pan = useSheetDrag({ y, travel, held, onCloseStart: leave, onClosed: onClose });

  useSheetBack(!closing, {
    start: () => cancelAnimation(y),
    progress: (swipe) => {
      y.value = backPull(swipe, travel.value);
    },
    cancel: () => {
      y.value = withSpring(0, openSpring);
    },
    invoke: dismiss,
  });

  const box = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value + (keyboard === "lift" ? keyboardHeight.value : 0) }],
    ...(keyboard === "room"
      ? { paddingBottom: Math.max(insets.bottom, -keyboardHeight.value) + 8 }
      : {}),
  }));
  const dim = useAnimatedStyle(() => ({ opacity: progress(y.value, travel.value) }));

  // The caller took it away: leave from wherever it is, on the same spring.
  const sheetExit = () => {
    "worklet";
    return {
      initialValues: { transform: [{ translateY: y.value + (keyboard === "lift" ? keyboardHeight.value : 0) }] },
      animations: { transform: [{ translateY: withSpring(travel.value + PAST, closeSpring) }] },
    };
  };
  const scrimExit = () => {
    "worklet";
    return {
      initialValues: { opacity: progress(y.value, travel.value) },
      animations: { opacity: withSpring(0, closeSpring) },
    };
  };

  return (
    <>
      <Animated.View
        exiting={scrimExit}
        className="absolute inset-0"
        style={[{ backgroundColor: atOpacity(COLOR.scrim, scrim) }, dim]}
        pointerEvents={closing ? "none" : "auto"}
      >
        <Pressable className="flex-1" onPress={dismiss} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        exiting={sheetExit}
        onLayout={(event) => {
          if (closing) return;
          const height = event.nativeEvent.layout.height;
          travel.value = height;
          if (opened.current) return;
          opened.current = true;
          runOnUI((from: number) => {
            "worklet";
            y.value = from + PAST;
            y.value = withSpring(0, openSpring);
          })(height);
        }}
        className={`absolute inset-x-0 bottom-0 ${
          surface ?? (isAndroid ? "rounded-t-a-xl bg-a-c-low" : "rounded-t-lg bg-surface-raised")
        }`}
        style={[sheetStyle, box]}
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
      >
        <Grabber held={held} pan={pan} />
        <View className={className} style={[{ flexShrink: 1 }, style]}>
          {children}
        </View>
      </Animated.View>
    </>
  );
}
