// Authentication worked. Authorization did not.
//
// That distinction is invisible to the person standing here, so the screen does
// not explain it: it says which address it looked at, offers the one useful
// next step, and gets out of the way.

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Logo } from "../components/Logo";
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
    // Not awaited for a verdict. The endpoint answers identically for every
    // address by design, so there is nothing to branch on and a spinner would
    // imply otherwise.
    void fetch(`${API_URL}/v1/waitlist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-page">
      <View className="flex-1 items-center justify-center px-gutter-screen">
        <View className="w-full items-center">
          <View className="mb-space-9">
            <Logo size={44} />
          </View>

          {joined ? (
            <>
              <Text className="font-core text-title-1 font-semibold text-text-primary text-center">
                You are on the list.
              </Text>
              <Text className="mt-space-5 font-quiet text-body text-text-secondary text-center">
                We are letting people in weekly. You will get an email the moment it is your turn.
              </Text>
            </>
          ) : (
            <>
              <Text className="font-core text-title-1 font-semibold text-text-primary text-center">
                offload is invite only right now.
              </Text>
              <Text className="mt-space-5 font-quiet text-body text-text-secondary text-center">
                That account does not have an invite yet.
              </Text>
              {email ? (
                <Text className="mt-space-6 font-core text-body font-medium text-text-primary text-center">
                  {email}
                </Text>
              ) : null}

              <View className="mt-space-9 w-full gap-space-2">
                <Pressable
                  onPress={join}
                  disabled={!email}
                  className="min-h-composer-height w-full items-center justify-center rounded-pill bg-ink-950 active:opacity-90"
                >
                  <Text className="font-core text-body font-medium text-paper">Join the waitlist</Text>
                </Pressable>

                <Pressable
                  onPress={() => router.replace("/sign-in")}
                  // 44pt of hit area around a control drawn smaller than that.
                  className="min-h-tap-min items-center justify-center"
                >
                  <Text className="font-core text-body-sm font-medium text-text-secondary">
                    Use a different account
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
