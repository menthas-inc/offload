// The search field: Memories' own (040), and Search's (049).
//
// iOS a 40 minimum on the fill with a 12 radius, Android a 48 minimum pill on
// its low container; the dark theme's well edge on both. A minimum, so the
// field grows with the text size rather than clipping it.

import type { RefObject } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import { Glyph } from "./Glyph";
import { useColors } from "../lib/colors";

const isAndroid = Platform.OS === "android";

export function SearchField({
  value,
  onChangeText,
  placeholder,
  label,
  inputRef,
  onSubmitEditing,
  maxLength,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  label: string;
  inputRef?: RefObject<TextInput | null>;
  onSubmitEditing?: () => void;
  maxLength?: number;
}) {
  const COLOR = useColors();
  return (
    <View
      className={`flex-row items-center gap-space-4 px-space-5 ${isAndroid ? "rounded-pill bg-a-c-low" : "bg-surface-fill"}`}
      // The edge is Dark theme: edges (design decisions, 2026-10-07).
      style={[{ boxShadow: `inset 0 0 0 1px ${COLOR.edgeWell}` }, isAndroid ? { minHeight: 48 } : { minHeight: 40, borderRadius: 12 }]}
    >
      <Glyph name="search" size={16} color={COLOR.quiet} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLOR.quiet}
        accessibilityLabel={label}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        onSubmitEditing={onSubmitEditing}
        maxLength={maxLength}
        className="flex-1 font-core"
        style={{ color: COLOR.ink, fontSize: 15.5, paddingVertical: 0 }}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear">
          <Glyph name="x" size={15} color={COLOR.quiet} />
        </Pressable>
      ) : null}
    </View>
  );
}
