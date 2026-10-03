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

import { useCallback, useState, type ReactNode } from "react";
import { Platform, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  measure,
  runOnJS,
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";
import { atOpacity, useColors } from "../../lib/colors";
import { backPull, closes, dragTo, PAST, progress, SLOP } from "../../lib/sheet";
import { closeSpring, openSpring } from "../../lib/motion";
import { useSheetBack } from "../../lib/sheet-back";
import { useScreenSheet } from "./conversation-context";
import { putKeyboardAway } from "../../lib/keyboard";

const isAndroid = Platform.OS === "android";

/** Where a sheet sits before it has a size: well off the bottom. */
export const OFFSCREEN = 10_000;


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
  onGrab,
  goal,
  scroll,
}: {
  y: SharedValue<number>;
  travel: SharedValue<number>;
  held: SharedValue<number>;
  onCloseStart: () => void;
  onClosed: () => void;
  /** A finger took hold, maybe of a sheet that was on its way out. */
  onGrab?: (() => void) | undefined;
  /** Where the sheet was last sent, for a caller that animates it from
   *  elsewhere too: written here, so it never names a place the finger
   *  overruled. */
  goal?: SharedValue<number> | undefined;
  scroll?: SheetScroll | undefined;
}) {
  // Taken apart here: a worklet copies what it closes over, and a gesture
  // object cannot be copied onto the UI thread.
  const listed = scroll !== undefined;
  const listOffset = scroll?.offset;
  const listRef = scroll?.ref;
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
      engaged.value = !listed || ((listOffset?.value ?? 0) <= 0 && event.translationY > 0);
      if (!engaged.value) return;
      cancelAnimation(y);
      start.value = y.value;
      held.value = 1;
      if (goal) goal.value = NaN;
      if (onGrab) runOnJS(onGrab)();
    })
    .onUpdate((event) => {
      if (!engaged.value) {
        const down = event.translationY > last.value;
        last.value = event.translationY;
        if (!listed || (listOffset?.value ?? 0) > 0 || !down) return;
        engaged.value = true;
        cancelAnimation(y);
        start.value = y.value;
        anchor.value = event.translationY;
        held.value = 1;
        if (goal) goal.value = NaN;
        if (onGrab) runOnJS(onGrab)();
      }
      y.value = dragTo(start.value, event.translationY, anchor.value);
      if (listRef) scrollTo(listRef, 0, 0, false);
    })
    .onEnd((event) => {
      if (!engaged.value) return;
      const close = closes(y.value, event.velocityY, travel.value);
      if (goal) goal.value = close ? travel.value + PAST : 0;
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
 *  top. It widens to 44 while held on iOS; M3's handle does not change. The
 *  whole strip takes the drag, and a 44 point target with its slop.
 *
 *  **To assistive tech it is the Close button**, since with no header it is
 *  the only way out a screen reader can reach: the scrim is outside the
 *  sheet's modal region. Activation is not a pan, so this brings back no tap
 *  competing with the drag. */
export function Grabber({ held, pan, onClose }: { held: SharedValue<number>; pan: GestureType; onClose: () => void }) {
  const base = isAndroid ? 32 : 36;
  const grows = isAndroid ? 0 : 8;
  const bar = useAnimatedStyle(() => ({
    width: withTiming(base + grows * held.value, { duration: 150, reduceMotion: ReduceMotion.System }),
  }));
  return (
    <GestureDetector gesture={pan}>
      <View
        className="items-center"
        style={{ paddingTop: 8, paddingBottom: 12 }}
        hitSlop={{ top: 10, bottom: 10 }}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Close"
        onAccessibilityTap={onClose}
        accessibilityActions={[{ name: "activate" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "activate") onClose();
        }}
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
  scrim,
  accessibilityLabel,
  onOpen,
  locked = false,
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
  /** The sheet has started to rise: focus its field here rather than with
   *  `autoFocus`. The keyboard is native and comes at once, while the sheet
   *  waits on JS for its first frame, so an autofocused keyboard beat a
   *  sheet opened from another sheet by a quarter of a second. */
  onOpen?: (() => void) | undefined;
  /** Nothing closes it: not the scrim, the grabber, a drag or Android's back.
   *  For the moment a write that cannot be taken back is in flight. It has to
   *  be the sheet's, since every one of those exits has moved the sheet
   *  before the caller's `onClose` is asked. */
  locked?: boolean;
}) {
  const COLOR = useColors();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(OFFSCREEN);
  const travel = useSharedValue(0);
  const held = useSharedValue(0);
  const [closing, setClosing] = useState(false);
  // The plate comes back as the sheet starts to leave, not after it has gone.
  useScreenSheet(!closing);

  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  // **Opened from the UI thread, on the first frame the sheet has a size.**
  // Waiting for `onLayout` to reach JS cost a quarter of a second in a
  // development build, and a sheet that focuses a field on mount had its
  // keyboard up before it moved at all. It starts from the keyboard's edge
  // when there is one, so it comes out of the keyboard rather than from
  // behind it.
  const sheetRef = useAnimatedRef<Animated.View>();
  const opening = useSharedValue(true);
  const bottomInset = insets.bottom;
  const opened = onOpen;
  // Once it has opened there is nothing left for it to do each frame.
  const stopFrames = (): void => frames.setActive(false);
  const frames = useFrameCallback(() => {
    if (!opening.value) return;
    const size = measure(sheetRef);
    if (!size || size.height <= 0) return;
    opening.value = false;
    const room = keyboard === "room" ? Math.max(0, -keyboardHeight.value - bottomInset) : 0;
    travel.value = size.height;
    y.value = size.height - room + PAST;
    y.value = withSpring(0, openSpring);
    if (opened) runOnJS(opened)();
    runOnJS(stopFrames)();
  });

  const leave = useCallback(() => {
    putKeyboardAway();
    setClosing(true);
  }, []);
  const dismiss = useCallback(() => {
    if (locked) return;
    leave();
    y.value = withSpring(travel.value + PAST, closeSpring, (done) => {
      if (done) runOnJS(onClose)();
    });
  }, [leave, locked, onClose, travel, y]);

  // Caught on its way out and let go short: it is open again, and the plate,
  // the scrim and back belong to it again.
  const regrab = useCallback(() => setClosing(false), []);
  const pan = useSheetDrag({ y, travel, held, onCloseStart: leave, onClosed: onClose, onGrab: regrab }).enabled(!locked);

  useSheetBack(!closing && !locked, {
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
        style={[{ backgroundColor: atOpacity(COLOR.scrim, scrim ?? COLOR.scrimOpacity) }, dim]}
        pointerEvents={closing ? "none" : "auto"}
      >
        <Pressable className="flex-1" onPress={dismiss} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        ref={sheetRef}
        exiting={sheetExit}
        onLayout={(event) => {
          // Its size as it changes after opening: a panel, the keyboard.
          if (closing || opening.value) return;
          travel.value = event.nativeEvent.layout.height;
        }}
        className={`absolute inset-x-0 bottom-0 ${
          surface ?? (isAndroid ? "rounded-t-a-xl bg-a-c-low" : "rounded-t-lg bg-surface-raised")
        }`}
        style={[sheetStyle, box]}
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
      >
        <Grabber held={held} pan={pan} onClose={dismiss} />
        <View className={className} style={[{ flexShrink: 1 }, style]}>
          {children}
        </View>
      </Animated.View>
    </>
  );
}
