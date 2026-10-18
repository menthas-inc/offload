// One message at the bottom of the screen, with at most one action.
//
// The `Toast` contract: an ink bar, one action, a side gutter. **At most one
// action** is why the default thread's refusal and an Undo cannot share a
// toast, and why the refusal is a plain one.
//
// Eight seconds, matching the Undo window everything else in the product uses,
// so a toast never outlives the thing it is offering to take back.
//
// **A word with a place is not a toast** (2026-10-18): an Undo, and the
// failure that replaces it, is drawn where the change is by `UndoLine`. The
// toast keeps what has no Undo and a conversation's own report, and tapping
// its body fades it out, so it never sits over something you want.

import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInUp, FadeOut } from "react-native-reanimated";
import type { Place } from "@offload/widgets";
import { undoStore } from "../../lib/undo";

const VISIBLE_MS = 8000;

// **Top, not bottom.** The kit puts a toast above the navigation bar, which on
// a phone is where the composer lives, so an Undo covered the field it was
// telling you about. The one place nothing else occupies is under the app bar.
const isAndroid = Platform.OS === "android";

export interface ToastAction {
  label: string;
  onPress: () => void | Promise<void>;
}

interface Showing {
  message: string;
  action?: ToastAction;
}

export interface ToastState {
  showing: Showing | null;
  show: (message: string, action?: ToastAction, place?: Place) => void;
  hide: () => void;
}

export function useToast(): ToastState {
  const [showing, setShowing] = useState<Showing | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setShowing(null);
  }, []);

  const show = useCallback((message: string, action?: ToastAction, place?: Place) => {
    if (place) return undoStore.put(place, message, action);
    if (timer.current) clearTimeout(timer.current);
    setShowing({ message, ...(action ? { action } : {}) });
    timer.current = setTimeout(() => setShowing(null), VISIBLE_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { showing, show, hide };
}

/** The readme's split, read the way the web reads it: an Undo announces
 *  politely, a failure interrupts. Retry and Try again are the failure forms. */
export function toastFailed(action: ToastAction | undefined): boolean {
  return action?.label === "Retry" || action?.label === "Try again";
}

/** Draws the toast when there is one. Named for what it does rather than what
 *  it contains, because `Toast` is a governed component with a stated contract
 *  and a wrapper taking a state object is not that component. */
export function ToastHost({ state }: { state: ToastState }) {
  const insets = useSafeAreaInsets();
  if (!state.showing) return null;
  const { message, action } = state.showing;
  const failed = toastFailed(action);

  return (
    <Animated.View
      entering={FadeInUp.duration(280)}
      exiting={FadeOut.duration(140)}
      className="absolute inset-x-space-4"
      style={{ top: insets.top + 56 }}
      pointerEvents="box-none"
    >
      {/* The body, not the action: tapping it fades it out (the exit above). */}
      <Pressable
        onPress={state.hide}
        accessibilityHint="Dismisses"
        accessibilityLiveRegion={failed ? "assertive" : "polite"}
        accessibilityRole={failed ? "alert" : undefined}
        // The padding sits on the message so the action can take the bar's
        // whole height, which is never less than a tap target.
        className={`min-h-tap-min flex-row items-center gap-space-5 px-space-6 ${
          isAndroid ? "rounded-xs bg-a-on" : "rounded-md bg-surface-inverse"
        }`}
      >
        <Text
          className={`flex-1 py-space-5 font-core ${isAndroid ? "text-a-surface" : "text-text-inverse"}`}
          style={{ fontSize: 14 }}
        >
          {message}
        </Text>
        {action ? (
          <Pressable
            onPress={() => {
              state.hide();
              void action.onPress();
            }}
            hitSlop={12}
            className="self-stretch justify-center"
          >
            <Text
              className={`font-core font-medium ${
                isAndroid ? "text-a-surface" : "text-text-inverse"
              }`}
              style={{ fontSize: 14 }}
            >
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
