// 039. A review code on the sign-in screen, for store reviewers.
//
// Two pieces, one component file for both phones since only the Material
// classes differ. `CodeLine` is the quiet way in, a caption-sized line in the
// caption's accent under the waitlist's. `CodeField` is what it opens: a field
// at the providers' height, above them, so the next thing to do is right
// under it. No kit draws either; they are the gate's own pieces.

import { Platform, Pressable, Text, TextInput } from "react-native";
import { GATE } from "../../lib/gate";

export function CodeLine({ onOpen }: { onOpen: () => void }) {
  const material = Platform.OS === "android";
  return (
    // 44 points of touch around a caption-sized line, per the hit area rule.
    <Pressable onPress={onOpen} accessibilityRole="button" className="items-center justify-center" style={{ minHeight: 44 }}>
      <Text
        className={`font-core font-medium ${material ? "text-blue-700" : "text-caption text-text-accent"}`}
        style={material ? { fontSize: 12.5, lineHeight: 18 } : undefined}
      >
        {GATE.code.open}
      </Text>
    </Pressable>
  );
}

export function CodeField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const material = Platform.OS === "android";
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={GATE.code.placeholder}
      accessibilityLabel={GATE.code.placeholder}
      // Letters and digits as printed in a store's notes: capitals, and none
      // of the corrections that would mangle them.
      autoCapitalize="characters"
      autoCorrect={false}
      autoComplete="off"
      maxLength={40}
      returnKeyType="done"
      autoFocus
      className={`w-full rounded-pill border px-space-7 text-center font-core text-body ${
        material ? "min-h-a-row-height border-a-outline text-a-on" : "min-h-composer-height border-border-strong text-text-primary"
      }`}
    />
  );
}
