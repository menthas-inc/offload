// 033. First run's footer: one or two pill buttons in a row at the bottom.
//
// **Skip sits beside the main button**, tonal on the left and narrower, so
// declining is as close to the thumb as going on. No first-run screen puts
// Skip or Not now in a corner. A screen that cannot be skipped has one button,
// full width.

import { Pressable, Text, View } from "react-native";
import { GUTTER, SIZE, SKIN, type Tone } from "./skin";

export interface FooterAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function RunFooter({ tone, main, skip }: { tone: Tone; main: FooterAction; skip?: FooterAction }) {
  const skin = SKIN[tone];
  const size = SIZE[tone];
  const text = { fontSize: size.buttonText, letterSpacing: tone === "android" ? 0.16 : 0 };

  return (
    <View className="flex-row" style={{ gap: 10, paddingTop: 14, paddingBottom: 18, paddingHorizontal: GUTTER }}>
      {skip ? (
        <Pressable
          onPress={skip.onPress}
          accessibilityRole="button"
          className={`items-center justify-center rounded-pill active:opacity-90 ${skin.skip}`}
          // min-height, never height: the label scales with the text size.
          style={{ flex: 1, minHeight: size.button, paddingHorizontal: 12 }}
        >
          <Text className={`font-core font-medium ${skin.skipText}`} style={text} numberOfLines={1}>
            {skip.label}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={main.onPress}
        disabled={main.disabled ?? false}
        accessibilityRole="button"
        accessibilityState={{ disabled: main.disabled ?? false }}
        className={`items-center justify-center rounded-pill active:opacity-90 ${main.disabled ? "bg-state-disabled-surface" : skin.main}`}
        style={{ flex: skip ? 1.5 : 1, minHeight: size.button, paddingHorizontal: 12 }}
      >
        <Text
          className={`font-core font-medium ${main.disabled ? "text-state-disabled-text" : skin.mainText}`}
          style={text}
          numberOfLines={1}
        >
          {main.label}
        </Text>
      </Pressable>
    </View>
  );
}
