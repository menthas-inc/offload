// The gate on iOS, from ui_kits/mobile_app/FirstRun.jsx.
//
// A big lockup filling the upper half, the claim under it, and the two provider
// buttons pinned to the bottom. Google first, since more people arrive with
// one; Apple is the filled button and Google the outlined one, because two
// identical buttons make the pair read as an arbitrary choice, and the filled
// Apple button at the same height is the App Store's prominence rule met.

import { useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Linking, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GateBackdrop } from "../GateBackdrop";
import { GateLockup } from "../GateLockup";
import { AppleGlyph, GoogleGlyph } from "../Glyphs";
import { GATE } from "../../lib/gate";
import { codesOn } from "../../lib/code";
import { CodeField, CodeLine } from "./CodeEntry";
import { takeDeletedNotice } from "../../lib/account";
import { PRIVACY_URL, TERMS_URL } from "../../lib/links";
import { useColors } from "../../lib/colors";
import {
  appleAvailable,
  providerOrder,
  signIn,
  type Provider,
} from "../../lib/auth";

export default function SignIn() {
  const COLOR = useColors();
  const router = useRouter();
  const [pending, setPending] = useState<Provider | null>(null);
  const [refused, setRefused] = useState(false);
  // 035. Read once, as the screen mounts: the line is for the person who just
  // deleted their account and for nobody who signs in on this phone after.
  const [deleted] = useState(() => takeDeletedNotice());
  const [hasApple, setHasApple] = useState(false);
  // 039. Whether review codes are on, and the one typed, if any.
  const [codes, setCodes] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    void appleAvailable().then(setHasApple);
    void codesOn().then(setCodes);
  }, []);

  async function go(provider: Provider) {
    setRefused(false);
    setPending(provider);
    const result = await signIn(provider, codes ? code : "");
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

  // From lib/auth.ts rather than restated here. It was exported and unused
  // while both screens recomputed the same ordering, which is the second
  // source of truth this file warns about elsewhere.
  const providers = providerOrder.filter((p) => p !== "apple" || hasApple);

  return (
    <SafeAreaView className="flex-1 bg-surface-page">
      <GateBackdrop>
        {/* 039. The code field sits at the foot, under the keyboard without
            this. "padding" on both, for the edge to edge reason the
            waitlist screen gives. */}
        <KeyboardAvoidingView className="flex-1" behavior="padding">
          {/* A tap anywhere that is not a control puts the keyboard
              away: iOS has no back button. */}
          <Pressable className="flex-1" onPress={Keyboard.dismiss} accessible={false}>
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
                {deleted ? GATE.signIn.deleted : GATE.signIn.sub}
              </Text>
            </View>

            <View className="px-gutter-screen pb-space-8 gap-space-4">
              {refused ? (
                <View
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  className="rounded-md bg-surface-attention-soft px-space-6 py-space-5"
                >
                  <Text className="font-core text-body-sm text-text-on-attention">
                    {GATE.refused}
                  </Text>
                </View>
              ) : null}

              {codes && codeOpen ? (
                <CodeField value={code} onChange={setCode} />
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
              {codes && !codeOpen ? (
                <CodeLine onOpen={() => setCodeOpen(true)} />
              ) : null}
              {/* 44px of touch around each word of a 12.5px line, per the design
                system's hit area rule: the text stays the size the kit draws it. */}
              <View className="flex-row items-center justify-center">
                <Pressable
                  onPress={() => void Linking.openURL(TERMS_URL)}
                  className="items-center justify-center px-2"
                  style={{ minHeight: 44 }}
                  accessibilityRole="link"
                >
                  <Text className="font-core text-caption text-text-tertiary">
                    {GATE.signIn.legal.terms}
                  </Text>
                </Pressable>
                <Text
                  className="font-core text-caption text-text-tertiary"
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                >
                  ·
                </Text>
                <Pressable
                  onPress={() => void Linking.openURL(PRIVACY_URL)}
                  className="items-center justify-center px-2"
                  style={{ minHeight: 44 }}
                  accessibilityRole="link"
                >
                  <Text className="font-core text-caption text-text-tertiary">
                    {GATE.signIn.legal.privacy}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </GateBackdrop>
    </SafeAreaView>
  );
}
