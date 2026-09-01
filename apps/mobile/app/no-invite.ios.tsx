// Authentication worked, authorization did not. From ui_kits/mobile_app/FirstRun.jsx.
//
// Both actions are full-width buttons: a quiet text link for the second one makes it look optional, and it is the one an invited person actually needs.

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Logo } from "../components/Logo";
import { GATE } from "../lib/gate";
import { API_URL } from "../lib/auth";

export default function NoInvite() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/sign-in/attempt`)
      .then((response) => (response.ok ? response.json() : { email: null }))
      .then((data: { email: string | null }) => setEmail(data.email))
      .catch(() => setEmail(null));
  }, []);

  function join() {
    if (!email) return;
    setJoined(true);
    // Not awaited for a verdict: the endpoint answers identically for every
    // address by design, so there is nothing to branch on.
    void fetch(`${API_URL}/v1/waitlist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
  }

  const copy = joined ? GATE.joined : GATE.notInvited;

  return (
    <SafeAreaView className="flex-1 bg-surface-page">
      <View className="flex-1 items-center justify-center">
        <View className="items-center gap-space-7">
          <Logo variant="mark" size={92} />
          <Text className="font-core text-text-primary" style={{ fontSize: 30, fontWeight: "600", letterSpacing: -0.9 }}>
            offload
          </Text>
        </View>
      </View>

      <View className="items-center px-gutter-screen pb-space-9">
        <Text className="text-center font-core text-title-1 font-semibold text-text-primary">{copy.title}</Text>
        <Text className="mt-space-5 text-center font-core text-body text-text-secondary">
          {email ? copy.sub(email) : copy.subNoEmail}
        </Text>
      </View>

      <View className="px-gutter-screen pb-space-8 gap-space-4">
        {joined ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="self-center rounded-pill bg-ink-950 px-space-7 py-space-5"
          >
            <Text className="font-core text-body-sm font-medium text-text-inverse">
              {GATE.joined.toast}
            </Text>
          </View>
        ) : (
          <>
            <Pressable
              onPress={join}
              disabled={!email}
              className="min-h-composer-height w-full items-center justify-center rounded-pill bg-ink-950 active:opacity-90"
            >
              <Text className="font-core text-body font-medium text-text-inverse">
                {GATE.notInvited.join}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.replace("/sign-in")}
              className="min-h-composer-height w-full items-center justify-center rounded-pill border border-border-strong bg-surface-raised active:opacity-90"
            >
              <Text className="font-core text-body font-medium text-text-primary">{GATE.notInvited.switch}</Text>
            </Pressable>

            <Text className="text-center font-core text-caption text-text-tertiary">{GATE.notInvited.terms}</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
