// The gate, on a phone.
//
// The same two buttons and the same one line as the web, ordered per platform:
// Apple leads on iOS because the App Store requires it to be at least as
// prominent as any other option, Google leads on Android because that account
// is already on the device.

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Logo } from "../components/Logo";
import { appleAvailable, providerOrder, signIn, type Provider } from "../lib/auth";

const LABEL: Record<Provider, string> = {
  apple: "Continue with Apple",
  google: "Continue with Google",
};

export default function SignIn() {
  const router = useRouter();
  const [pending, setPending] = useState<Provider | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [hasApple, setHasApple] = useState(false);

  useEffect(() => {
    void appleAvailable().then(setHasApple);
  }, []);

  async function go(provider: Provider) {
    setRefusal(null);
    setPending(provider);
    const { error } = await signIn(provider);
    setPending(null);

    if (!error) {
      router.replace("/");
      return;
    }
    // A refusal is one line above the buttons, never a dialog: a modal for
    // something the person cannot act on is a second tap for no reason.
    setRefusal(
      error === "no-invite" ? "That account does not have an invite yet." : "That did not go through. Try again."
    );
  }

  const providers = providerOrder.filter((provider) => provider !== "apple" || hasApple);

  return (
    <SafeAreaView className="flex-1 bg-surface-page">
      <View className="flex-1 items-center justify-center px-gutter-screen">
        <View className="w-full items-center">
          <View className="mb-space-9">
            <Logo size={44} />
          </View>

          <Text className="font-core text-title-1 font-semibold text-text-primary text-center">
            Offload what you would otherwise forget.
          </Text>
          <Text className="mt-space-5 font-quiet text-body text-text-secondary text-center">
            Invite only for now. Sign in with the address your invite went to.
          </Text>

          <View className="mt-space-9 w-full gap-space-5">
            {refusal ? (
              <Text className="font-core text-body-sm text-text-danger text-center">{refusal}</Text>
            ) : null}

            {providers.map((provider) => (
              <Pressable
                key={provider}
                onPress={() => void go(provider)}
                disabled={pending !== null}
                // min-h, never h: text scales to 200% and a fixed height clips it.
                className="min-h-composer-height w-full flex-row items-center justify-center rounded-pill border border-border-strong bg-surface-raised px-5 active:opacity-90"
              >
                <Text className="font-core text-body font-medium text-text-primary">
                  {pending === provider ? "Taking you there…" : LABEL[provider]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
