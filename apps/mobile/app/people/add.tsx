// Add a connection. 022.
//
// The exploration's three states, and the one the field starts in. One full
// address, matched exactly and case-insensitively, returns one account or
// none: no partial match, no name search, no suggestions, because a name
// search over real people is a directory whether or not it is called one.
// The found row shows the address as the account stores it, which is what
// confirms the match was case-insensitive rather than lucky. A typo and a
// non-account look identical, and no wording can distinguish them; the not
// found copy is the honest limit of the no-invite rule.
//
// Reached from the share sheet's last row. 031 put the same step on My
// people, in place; the lookup and everything under the field is
// `NewConnection.tsx`, shared by both.

import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Glyph } from "../../components/Glyph";
import { useColors } from "../../lib/colors";
import { StepResult, useConnectionStep } from "../../components/people/NewConnection";

const isAndroid = Platform.OS === "android";

export default function AddConnection() {
  const router = useRouter();
  const COLOR = useColors();
  const step = useConnectionStep();
  const { email, setEmail, state } = step;
  const [focused, setFocused] = useState(false);

  const skin = isAndroid
    ? { idle: "border-a-outline", on: "border-blue-600", radius: "rounded-xs", bg: "bg-a-surface" }
    : { idle: "border-border-strong", on: "border-ink-950", radius: "rounded-md", bg: "bg-surface-raised" };

  return (
    <SafeAreaView className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`} edges={["top"]}>
      <View className="h-appbar-height flex-row items-center gap-space-4 px-gutter-screen">
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Glyph name="chevron-left" size={22} color={COLOR.iconOnWell} />
        </Pressable>
        <Text className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 17 }}>
          Add a connection
        </Text>
      </View>

      {/* "padding" on both, as the waitlist form learned on a device: this
          app is edge to edge and Android ignores adjustResize, so the field
          sat under the keyboard. The content here is short, so nothing
          below the field needs the room; the field itself does. */}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
      <ScrollView contentContainerClassName="px-gutter-screen pb-space-9 pt-space-3" keyboardShouldPersistTaps="handled">
        <View className={`flex-row items-center border px-space-5 ${skin.radius} ${skin.bg} ${focused ? skin.on : skin.idle}`} style={{ minHeight: 52 }}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={() => void step.look()}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="search"
            placeholder="Their email address"
            placeholderTextColor={COLOR.tabOff}
            accessibilityLabel="Their email address"
            className="flex-1 font-core text-body"
            style={{ color: COLOR.ink, paddingVertical: 0 }}
          />
          {state.kind === "looking" ? <ActivityIndicator size="small" color={COLOR.iconOnWell} /> : null}
        </View>

        {state.kind === "empty" || state.kind === "looking" ? (
          <View className="pt-space-7">
            <Text className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15, lineHeight: 20 }}>
              You need their offload email
            </Text>
            <Text className={`pt-space-2 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 14, lineHeight: 20 }}>
              Sharing does not invite anyone in, so there is nobody to look up who is not already here. Ask them which email they signed up with.
            </Text>
          </View>
        ) : null}

        <StepResult step={step} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
