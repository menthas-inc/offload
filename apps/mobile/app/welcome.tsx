// First run: three screens, and nothing to fill in.
//
// It is an introduction, not a setup wizard. Asking a new person to configure
// the filing would contradict the product on its first screen.
//
// The notification permission ask fires straight after Get started, which is
// where the design puts it so that the third screen is the reason the dialog
// appears. Asked cold, on launch, it is a dialog about nothing.

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { completeOnboarding } from "../lib/api";

const SCREENS = [
  {
    claim: "Dump anything.",
    quiet:
      "Half a thought, a photo, a voice note, a link you will not read today. No title, no folder, no category.",
  },
  {
    claim: "offload sorts it.",
    quiet:
      "It turns what you dumped into things, files them into threads, and keeps them tidy as more arrives.",
  },
  {
    claim: "It speaks up when it matters.",
    quiet:
      "A flight to check in for, a reply someone is waiting on. The rest stays quiet until you go looking.",
  },
] as const;

export default function Welcome() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);

  async function finish(askForNotifications: boolean) {
    if (leaving) return;
    setLeaving(true);

    // The write first. Today is never rendered for an account the server still
    // considers mid-onboarding.
    await completeOnboarding();

    if (askForNotifications) {
      // Failure here is not failure of first run. A refused or errored
      // permission still lands on Today.
      await Notifications.requestPermissionsAsync().catch(() => undefined);
    }

    router.replace("/today");
  }

  const screen = SCREENS[index]!;
  const last = index === SCREENS.length - 1;

  return (
    <SafeAreaView className="flex-1 bg-surface-page">
      {/* Same place on all three, so nothing moves under a thumb. */}
      <View className="flex-row items-center justify-between px-gutter-screen py-space-7">
        <View className="flex-row gap-space-4">
          {SCREENS.map((item, position) => (
            <View
              key={item.claim}
              // space-3 is 6px. The kits draw 7, and the design system has no 7px
              // step; the one pixel is logged rather than hard-coded.
              className={`h-space-3 w-space-3 rounded-pill ${position === index ? "bg-ink-950" : "bg-ink-200"}`}
            />
          ))}
        </View>

        <Pressable
          // Skip and Get started do the same thing. Nothing is collected, so a
          // skipped run is a finished one, and pretending otherwise would mean
          // asking again later for no reason.
          onPress={() => void finish(false)}
          className="min-h-tap-min justify-center px-space-5"
        >
          <Text className="font-core text-body-sm font-medium text-text-secondary">Skip</Text>
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center px-gutter-screen">
        <View className="w-full items-center">
          <Text className="font-core text-title-1 font-semibold text-text-primary text-center">
            {screen.claim}
          </Text>
          <Text className="mt-space-5 font-quiet text-body text-text-secondary text-center">
            {screen.quiet}
          </Text>
        </View>
      </View>

      <View className="px-gutter-screen pb-space-9">
        <Pressable
          onPress={() => (last ? void finish(true) : setIndex(index + 1))}
          disabled={leaving}
          className="min-h-composer-height w-full items-center justify-center rounded-pill bg-ink-950 active:opacity-90"
        >
          <Text className="font-core text-body font-medium text-paper">
            {last ? "Get started" : "Next"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
