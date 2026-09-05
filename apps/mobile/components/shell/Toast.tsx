// One message at the bottom of the screen, with at most one action.
//
// The `Toast` contract: an ink bar, one action, a side gutter. **At most one
// action** is why the default thread's refusal and an Undo cannot share a
// toast, and why the refusal is a plain one.
//
// Eight seconds, matching the Undo window everything else in the product uses,
// so a toast never outlives the thing it is offering to take back.

import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";

const VISIBLE_MS = 8000;
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
  show: (message: string, action?: ToastAction) => void;
  hide: () => void;
}

export function useToast(): ToastState {
  const [showing, setShowing] = useState<Showing | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setShowing(null);
  }, []);

  const show = useCallback((message: string, action?: ToastAction) => {
    if (timer.current) clearTimeout(timer.current);
    setShowing({ message, ...(action ? { action } : {}) });
    timer.current = setTimeout(() => setShowing(null), VISIBLE_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { showing, show, hide };
}

/** Draws the toast when there is one. Named for what it does rather than what
 *  it contains, because `Toast` is a governed component with a stated contract
 *  and a wrapper taking a state object is not that component. */
export function ToastHost({ state }: { state: ToastState }) {
  if (!state.showing) return null;
  const { message, action } = state.showing;

  return (
    <Animated.View
      entering={FadeInDown.duration(280)}
      exiting={FadeOut.duration(140)}
      className="absolute inset-x-space-4 bottom-space-4"
      pointerEvents="box-none"
    >
      <View
        className={`flex-row items-center gap-space-5 px-space-6 py-space-5 ${
          isAndroid ? "rounded-xs bg-a-on" : "rounded-md bg-surface-inverse"
        }`}
      >
        <Text
          className={`flex-1 font-core ${isAndroid ? "text-a-surface" : "text-text-inverse"}`}
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
      </View>
    </Animated.View>
  );
}
