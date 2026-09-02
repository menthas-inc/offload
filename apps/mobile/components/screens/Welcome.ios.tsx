// First run, from ui_kits/mobile_app/FirstRun.jsx.
//
// Three screens and nothing to fill in. It is an introduction, not a setup
// wizard: asking a new person to configure the filing would contradict the
// product on its first screen.
//
// The notification permission ask fires straight after Get started, which is
// where the design puts it so the third screen is the reason the dialog
// appears. Asked cold on launch it is a dialog about nothing.
//
// Skip skips the tutorial and lands on the consent screen. It used to complete
// first run, which was right while nothing was collected; the fourth screen
// collects two consents, so nobody has to read the three screens and everybody
// has to answer that one.

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { TutorialArt, IOS_TONE } from "../TutorialArt";
import { CONSENT, TUTORIAL } from "../../lib/gate";
import { ConsentTicks } from "../ConsentTicks";
import { completeOnboarding } from "../../lib/api";

export default function Welcome() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [readPolicy, setReadPolicy] = useState(false);
  const [agreeToProcessing, setAgreeToProcessing] = useState(false);

  async function finish(ask: boolean) {
    if (leaving) return;
    setLeaving(true);

    // The write first. Today is never rendered for an account the server still
    // considers mid-onboarding.
    await completeOnboarding();

    // A refused or errored permission still lands on Today: it is not a
    // failure of first run.
    if (ask)
      await Notifications.requestPermissionsAsync().catch(() => undefined);

    router.replace("/today");
  }

  // 0..2 are the tutorial and 3 is the consent, which is a screen rather than a
  // footnote on the third: the kit's "three screens and nothing to fill in"
  // stays true, and a consent that has to be specific cannot sit under an
  // illustration about notifications. It carries no dot, because it is not one
  // of the three.
  const screen = TUTORIAL[step];
  const consenting = step === TUTORIAL.length;
  const ready = readPolicy && agreeToProcessing;

  return (
    <SafeAreaView className="flex-1 bg-surface-page">
      <View className="flex-row items-center justify-between px-gutter-screen pt-space-5">
        <View className="flex-row items-center gap-space-3">
          {(consenting ? [] : TUTORIAL).map((item, index) => (
            <View
              key={item.title}
              className={`h-space-3 rounded-pill ${index === step ? "bg-ink-950" : "bg-ink-200"}`}
              // The active step is a bar, not a bigger dot: progress along a
              // line rather than one of three equal choices.
              style={{ width: index === step ? 18 : 6 }}
            />
          ))}
        </View>

        {consenting ? null : (
          <Pressable
            onPress={() => void finish(false)}
            className="min-h-tap-min justify-center"
          >
            <Text className="font-core font-medium text-text-secondary">
              Skip
            </Text>
          </Pressable>
        )}
      </View>

      {consenting ? (
        <>
          <View className="px-gutter-screen pt-space-9">
            <Text className="font-core text-title-1 font-semibold text-text-primary">
              {CONSENT.title}
            </Text>
            <Text className="mt-space-5 font-core text-body text-text-secondary">
              {CONSENT.sub}
            </Text>
          </View>

          <View className="flex-1 justify-center px-gutter-screen">
            <ConsentTicks
              tone="ios"
              readPolicy={readPolicy}
              agreeToProcessing={agreeToProcessing}
              onReadPolicy={setReadPolicy}
              onAgreeToProcessing={setAgreeToProcessing}
            />
          </View>
        </>
      ) : (
        <>
          <View className="flex-1 items-center justify-center px-gutter-screen">
            <TutorialArt kind={screen!.art} tone={IOS_TONE} />
          </View>

          <View className="px-gutter-screen pb-space-8">
            <Text className="font-core text-title-1 font-semibold text-text-primary">
              {screen!.title}
            </Text>
            <Text className="mt-space-5 font-core text-body text-text-secondary">
              {screen!.sub}
            </Text>
          </View>
        </>
      )}

      <View className="px-gutter-screen pb-space-8">
        <Pressable
          onPress={() => (consenting ? void finish(true) : setStep(step + 1))}
          disabled={leaving || (consenting && !ready)}
          className="min-h-composer-height w-full items-center justify-center rounded-pill bg-ink-950 active:opacity-90"
        >
          <Text className="font-core text-body font-medium text-text-inverse">
            {consenting ? "Get started" : "Next"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
