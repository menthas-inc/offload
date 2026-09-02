// The gate on Android, from ui_kits/android_app/M3FirstRun.jsx.
//
// A real fork, not a skin. Four things differ from iOS and each is a Material
// convention rather than a preference:
//
//   Google leads, because that account is already on the device and asking for
//   an Apple one first is a detour.
//   The primary is a filled tonal button in Material's primary, 56 high.
//   Surfaces are the Material container roles (a-c-low, a-outline, a-on),
//   derived from offload's neutrals so the brand still owns the palette.
//   Type sits on Material's tighter tracking rather than offload's.

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Logo } from "../Logo";
import { AppleGlyph, GoogleGlyph } from "../Glyphs";
import { GATE } from "../../lib/gate";
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

  const providers: Provider[] = hasApple ? ["google", "apple"] : ["google"];

  return (
    <SafeAreaView className="flex-1 bg-a-surface">
      <View className="flex-1 items-center justify-center">
        <View className="items-center gap-space-7">
          <Logo variant="mark" size={92} />
          <Text
            className="font-core text-a-on"
            style={{ fontSize: 30, fontWeight: "600", letterSpacing: -0.9 }}
          >
            offload
          </Text>
        </View>
      </View>

      <View className="items-center px-gutter-screen pb-space-9">
        <Text
          className="text-center font-core text-title-1 font-semibold text-a-on"
          style={{ letterSpacing: 0 }}
        >
          {GATE.signIn.title}
        </Text>
        <Text className="mt-space-6 text-center font-core text-body text-a-on-var">
          {GATE.signIn.sub}
        </Text>
      </View>

      <View className="px-gutter-screen pb-space-8 gap-space-4">
        {refused ? (
          <View className="rounded-a-md bg-surface-attention-soft px-space-6 py-space-5">
            <Text className="font-core text-body-sm text-text-on-attention">{GATE.refused}</Text>
          </View>
        ) : null}

        {providers.map((provider) => {
          const filled = provider === "google";
          const dark = provider === "apple";
          return (
            <Pressable
              key={provider}
              onPress={() => void go(provider)}
              disabled={pending !== null}
              // 56, not 52: Material's button height. min-h and not h, because
              // text scales to 200% and a fixed height clips it.
              className={`min-h-a-row-height w-full flex-row items-center justify-center gap-space-4 rounded-pill active:opacity-90 ${
                filled ? "bg-blue-600" : dark ? "bg-ink-950" : "border border-a-outline bg-surface-raised"
              }`}
            >
              {provider === "apple" ? <AppleGlyph color={COLOR.onSolid} /> : <GoogleGlyph />}
              <Text
                className={`font-core font-medium ${filled || dark ? "text-text-inverse" : "text-a-on"}`}
                style={{ fontSize: 15, letterSpacing: 0.15 }}
              >
                {pending === provider ? "Taking you there…" : GATE.signIn[provider]}
              </Text>
            </Pressable>
          );
        })}

        <Text className="text-center font-core text-a-on-var" style={{ fontSize: 12.5, lineHeight: 18 }}>
          {GATE.signIn.terms}
        </Text>
        <Text className="text-center font-core text-a-on-var" style={{ fontSize: 12.5, lineHeight: 18 }}>
          {GATE.signIn.legal}
        </Text>
      </View>
    </SafeAreaView>
  );
}
