// Joining the waitlist without having tried to sign in.
//
// The kits do not draw this screen. Their no-invite screen is the waitlist
// page, and it always knows the address because the only way onto it was an
// OAuth attempt that was refused. "Join the waitlist" on the gate has no such
// address, which is why it did nothing: there was nowhere for it to go that
// could act on it.
//
// So this is the no-invite screen with one thing added, a field, and it is
// built from the same primitives at the same measurements rather than as a new
// layout: same lockup, same body block, same foot, same Material row height.
// The marketing page's form is the sibling on the web and the copy follows it.

import { useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GateBackdrop } from "../GateBackdrop";
import { GateLockup } from "../GateLockup";
import { GATE } from "../../lib/gate";
import { joinWaitlist, looksLikeEmail } from "../../lib/waitlist";

export default function Waitlist() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [invalid, setInvalid] = useState(false);

  function join() {
    if (!looksLikeEmail(email)) {
      setInvalid(true);
      return;
    }
    // Optimistic, because the server's answer carries no information: it is
    // {status:"ok"} for every address by design. Waiting on it would only add
    // a spinner to a foregone conclusion.
    setJoined(true);
    void joinWaitlist(email);
  }

  const copy = GATE.waitlist;

  return (
    <SafeAreaView className="flex-1 bg-a-surface">
      <GateBackdrop>
        <KeyboardAvoidingView
          className="flex-1"
          // "padding" on both, which is not the usual advice.
          //
          // The usual advice assumes Android resizes the window for the
          // keyboard, so the layout adapts on its own and padding would
          // double-count it. This app runs edge to edge
          // (gradle.properties: edgeToEdgeEnabled=true), and under edge to
          // edge Android ignores adjustResize outright: the manifest still
          // says adjustResize, the window still does not move, and the form
          // sat underneath the keyboard with the field and both buttons
          // unreachable. Verified on a Pixel, not reasoned about.
          behavior="padding"
        >
          <GateLockup />

          <View
            className="items-center justify-end px-gutter-screen pb-space-9"
            style={{ flexGrow: 1, flexShrink: 0, flexBasis: "auto" }}
          >
            <Text className="text-center font-core text-title-1 font-semibold text-a-on">
              {joined ? GATE.joined.title : copy.title}
            </Text>
            <Text className="mt-space-5 text-center font-core text-body text-a-on-var">
              {joined ? GATE.joined.sub(email.trim().toLowerCase()) : copy.sub}
            </Text>
          </View>

          <View className="px-gutter-screen pb-space-8 gap-space-5">
            {joined ? (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                className="self-center rounded-a-xs bg-ink-950 px-space-7 py-space-5"
              >
                <Text className="font-core text-body-sm font-medium text-text-inverse">
                  {GATE.joined.toast}
                </Text>
              </View>
            ) : (
              <>
                <TextInput
                  value={email}
                  onChangeText={(next) => {
                    setEmail(next);
                    if (invalid) setInvalid(false);
                  }}
                  onSubmitEditing={join}
                  placeholder={copy.placeholder}
                  // The address is the whole point of the screen, so it gets the
                  // keyboard that types one and none of the corrections that
                  // mangle it.
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  returnKeyType="go"
                  accessibilityLabel={copy.placeholder}
                  className={`min-h-a-row-height w-full rounded-pill border px-space-7 font-core text-body text-a-on ${
                    invalid ? "border-border-attention" : "border-a-outline"
                  }`}
                />

                {invalid ? (
                  <Text
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    className="text-center font-core text-body-sm text-text-on-attention"
                  >
                    {copy.invalid}
                  </Text>
                ) : null}

                <Pressable
                  onPress={join}
                  className="min-h-a-row-height w-full items-center justify-center rounded-pill bg-blue-600 active:opacity-90"
                >
                  <Text className="font-core text-body font-medium text-text-inverse">
                    {copy.join}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => router.replace("/sign-in")}
                  className="min-h-a-row-height w-full items-center justify-center rounded-pill border border-a-outline bg-surface-raised active:opacity-90"
                >
                  <Text className="font-core text-body font-medium text-a-on">
                    {copy.back}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </GateBackdrop>
    </SafeAreaView>
  );
}
