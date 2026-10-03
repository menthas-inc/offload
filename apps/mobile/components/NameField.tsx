// The name field, shared by both platforms' first run and both settings pages.
//
// One field with a `tone`, the same shape `ConsentTicks` uses: the copy is
// identical on iOS and Android and only the chrome forks, which on a text
// field is a border, a radius and a focus colour.
//
// **The kits cannot show you a keyboard**, and this is the second screen in
// this app to learn it. The field sits above the button on first run, so it is
// wrapped in the keyboard-aware container its screen already has rather than
// left to Android's `adjustResize`, which this edge-to-edge app ignores.

import { useState } from "react";
import { TextInput, View } from "react-native";
import { useColors } from "../lib/colors";
import { NAME_STEP } from "../lib/gate";
import { NAME_MAX } from "../lib/name";

export type FieldTone = "ios" | "android";

const TONE = {
  // Ink on iOS, Material's outline and primary on Android, the same pair the
  // consent ticks and both gates already use.
  ios: {
    idle: "border-border-strong",
    on: "border-ink-950",
    radius: "rounded-md",
    bg: "bg-surface-raised",
  },
  android: {
    idle: "border-a-outline",
    on: "border-blue-600",
    radius: "rounded-xs",
    bg: "bg-a-surface",
  },
} as const;

export function NameField({
  tone,
  value,
  onChange,
  onSubmit,
  autoFocus,
  label = "Your name",
  large = false,
}: {
  tone: FieldTone;
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
  label?: string;
  /** 033. First run's field: 54 tall, 18px text, a 1.5px ring that is 2px
   *  while focused, radius 14 on iOS and Material's 4 on Android. */
  large?: boolean;
}) {
  const COLOR = useColors();
  const [focused, setFocused] = useState(false);
  const skin = TONE[tone];
  const sized = large
    ? {
        minHeight: 54,
        borderWidth: focused ? 2 : tone === "ios" ? 1.5 : 1,
        borderRadius: tone === "ios" ? 14 : 4,
        // The ring grows inward, so the text does not move when it does.
        paddingHorizontal: 16 - (focused ? 2 : tone === "ios" ? 1.5 : 1),
      }
    : { minHeight: 52 };

  return (
    <View
      className={`border ${large ? "" : `px-space-5 ${skin.radius}`} ${skin.bg} ${focused ? skin.on : large ? "border-border-strong" : skin.idle}`}
      // min-height, never height: this holds text and text scales to 200%.
      style={[sized, { justifyContent: "center" }]}
    >
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus ?? false}
        autoCorrect={false}
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        returnKeyType="done"
        // Stops sixty-one characters being typed rather than letting them be
        // typed and refused. The server still checks; a client is not a
        // validator.
        maxLength={NAME_MAX}
        placeholder={NAME_STEP.placeholder}
        placeholderTextColor={COLOR.tabOff}
        accessibilityLabel={label}
        className="font-core text-body"
        style={{ color: COLOR.ink, paddingVertical: 0, ...(large ? { fontSize: 18 } : {}) }}
      />
    </View>
  );
}
