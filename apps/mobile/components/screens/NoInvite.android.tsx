// Authentication worked, authorization did not. From ui_kits/android_app/M3FirstRun.jsx.
//
// Material heights and container roles; the copy is identical to iOS by construction, since both read lib/gate.ts.

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GateBackdrop } from "../GateBackdrop";
import { GateLockup } from "../GateLockup";
import { GATE } from "../../lib/gate";
import { API_URL } from "../../lib/auth";
import { attemptHeaders } from "../../lib/attempt";

export default function NoInvite() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [disabled, setDisabled] = useState(false);
  // 039. A review code came with the sign-in and did not work.
  const [badCode, setBadCode] = useState(false);

  useEffect(() => {
    // With the refusal's proof, which this app keeps itself (`lib/attempt.ts`):
    // its fetches never hold cookies.
    fetch(`${API_URL}/api/sign-in/attempt`, { headers: attemptHeaders() })
      .then((response) => (response.ok ? response.json() : { email: null }))
      .then((data: { email: string | null; reason?: "disabled" | "code" | null }) => {
        setEmail(data.email);
        setDisabled(data.reason === "disabled");
        setBadCode(data.reason === "code");
      })
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

  const copy = disabled ? GATE.disabled : joined ? GATE.joined : GATE.notInvited;

  return (
    <SafeAreaView className="flex-1 bg-a-surface">
      <GateBackdrop>
        <GateLockup />

        <View
          className="items-center justify-end px-gutter-screen pb-space-9"
          style={{ flexGrow: 1, flexShrink: 0, flexBasis: "auto" }}
        >
          <Text className="text-center font-core text-title-1 font-semibold text-a-on">
            {copy.title}
          </Text>
          <Text className="mt-space-5 text-center font-core text-body text-a-on-var">
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
              {badCode ? (
                <View
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  className="rounded-a-md bg-surface-attention-soft px-space-6 py-space-5"
                >
                  <Text className="font-core text-body-sm text-text-on-attention">{GATE.code.refused}</Text>
                </View>
              ) : null}

              {disabled ? null : (
                <Pressable
                  onPress={join}
                  disabled={!email}
                  className="min-h-a-row-height w-full items-center justify-center rounded-pill bg-blue-600 active:opacity-90"
                >
                  <Text className="font-core text-body font-medium text-text-on-solid">
                    {GATE.notInvited.join}
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => router.replace("/sign-in")}
                className="min-h-a-row-height w-full items-center justify-center rounded-pill border border-a-outline bg-surface-raised active:opacity-90"
              >
                <Text className="font-core text-body font-medium text-a-on">
                  {badCode ? GATE.code.tryAnother : GATE.notInvited.switch}
                </Text>
              </Pressable>

              <Text
                className="text-center font-core text-a-on-var"
                style={{ fontSize: 12.5, lineHeight: 18 }}
              >
                {disabled ? "" : GATE.notInvited.terms}
              </Text>
            </>
          )}
        </View>
      </GateBackdrop>
    </SafeAreaView>
  );
}
