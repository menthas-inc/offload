// The gate on iOS, from ui_kits/mobile_app/FirstRun.jsx.
//
// A big lockup filling the upper half, the claim under it, and the two provider
// buttons pinned to the bottom. Apple is the filled button and Google the
// outlined one, in that order, because the App Store requires Apple to be at
// least as prominent and two identical buttons make the pair read as an
// arbitrary choice.

import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GateLockup } from "../GateLockup";
import { AppleGlyph, GoogleGlyph } from "../Glyphs";
import { GATE } from "../../lib/gate";
import { PRIVACY_URL } from "../../lib/links";
import { COLOR } from "../../lib/colors";
import { appleAvailable, signIn, type Provider } from "../../lib/auth";

export default function SignIn() {
  const router = useRouter();
  const [pending, setPending] = useState<Provider | null>(null);
  const [refused, setRefused] = useState(false);
  const [hasApple, setHasApple] = useState(false);

  useEffect(() => {
    void appleAvailable().then(setHasApple);
  }, []);

  async function go(provider: Provider) {
    setRefused(false);
    setPending(provider);
    const result = await signIn(provider);
    setPending(null);

    if (result.ok) {
      router.replace("/");
      return;
    }
    // A refusal that means "you were never invited" is its own screen, which
    // names the address it checked and offers the waitlist. Collapsing it into
    // the banner here is what made that screen unreachable.
    if (result.reason === "no-invite") {
      router.replace("/no-invite");
      return;
    }
    // Cancelling the Apple sheet is not a failure and must not look like one.
    if (result.reason === "failed") setRefused(true);
  }

  const providers: Provider[] = hasApple ? ["apple", "google"] : ["google"];

  return (
    <SafeAreaView className="flex-1 bg-surface-page">
      {/* The lockup takes the space that is left, so it centres in the upper
          half without a magic offset. */}
      <GateLockup />

      <View
        className="items-center justify-end px-gutter-screen pb-space-9"
        style={{ flexGrow: 1, flexShrink: 0, flexBasis: "auto" }}
      >
        <Text className="text-center font-core text-title-1 font-semibold text-text-primary">
          {GATE.signIn.title}
        </Text>
        <Text className="mt-space-5 text-center font-core text-body text-text-secondary">
          {GATE.signIn.sub}
        </Text>
      </View>

      <View className="px-gutter-screen pb-space-8 gap-space-4">
        {refused ? (
          <View className="rounded-md bg-surface-attention-soft px-space-6 py-space-5">
            <Text className="font-core text-body-sm text-text-on-attention">
              {GATE.refused}
            </Text>
          </View>
        ) : null}

        {providers.map((provider) => {
          const dark = provider === "apple";
          return (
            <Pressable
              key={provider}
              onPress={() => void go(provider)}
              disabled={pending !== null}
              className={`min-h-composer-height w-full flex-row items-center justify-center gap-space-4 rounded-pill active:opacity-90 ${
                dark
                  ? "bg-ink-950"
                  : "border border-border-strong bg-surface-raised"
              }`}
            >
              {dark ? <AppleGlyph color={COLOR.onSolid} /> : <GoogleGlyph />}
              <Text
                className={`font-core text-body font-medium ${dark ? "text-text-inverse" : "text-text-primary"}`}
              >
                {pending === provider
                  ? "Taking you there…"
                  : GATE.signIn[provider]}
              </Text>
            </Pressable>
          );
        })}

        <Text className="text-center font-core text-caption text-text-tertiary">
          {GATE.signIn.terms}
          <Text
            className="font-medium text-text-accent"
            accessibilityRole="link"
            onPress={() => router.push("/waitlist")}
          >
            {GATE.signIn.termsAccent}
          </Text>
        </Text>
        {/* 44px of touch around a 12.5px line, per the design system's hit
            area rule: the text stays the size the kit draws it. */}
        <Pressable
          onPress={() => void Linking.openURL(PRIVACY_URL)}
          className="items-center justify-center"
          style={{ minHeight: 44 }}
          accessibilityRole="link"
        >
          <Text className="text-center font-core text-caption text-text-tertiary">
            {GATE.signIn.legal}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
