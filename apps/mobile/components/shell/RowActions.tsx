// Everything a swipe cannot carry.
//
// A long press opens this. It lists what this account may actually do to the
// row and omits the rest, which is why there is no disabled state in here: the
// server decides who may delete something, and a control that is drawn and
// refused teaches somebody a rule that is not true.

import { Platform, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { COLOR } from "../../lib/colors";

const isAndroid = Platform.OS === "android";

export interface RowAction {
  label: string;
  danger?: boolean;
  run: () => void | Promise<void>;
}

export function RowActions({
  open,
  actions,
  onClose,
}: {
  open: boolean;
  actions: RowAction[];
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(140)}
        exiting={FadeOut.duration(140)}
        className="absolute inset-0"
        style={{ backgroundColor: COLOR.scrim, opacity: 0.35 }}
      >
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(220)}
        exiting={FadeOut.duration(140)}
        className={`absolute inset-x-0 bottom-0 pb-space-8 pt-space-3 ${
          isAndroid ? "rounded-t-a-xl bg-a-c-low" : "rounded-t-lg bg-surface-raised"
        }`}
      >
        {actions.map((action) => (
          <Pressable
            key={action.label}
            className="min-h-tap-min justify-center px-gutter-screen"
            onPress={() => {
              onClose();
              void action.run();
            }}
          >
            <Text
              className={`font-core ${
                action.danger
                  ? "text-text-danger"
                  : isAndroid
                    ? "text-a-on"
                    : "text-text-primary"
              }`}
              style={{ fontSize: 16 }}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>
    </>
  );
}
