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
  const [failed, setFailed] = useState(false);

  const [readPolicy, setReadPolicy] = useState(false);
  const [agreeToProcessing, setAgreeToProcessing] = useState(false);

  async function finish(ask: boolean) {
    if (leaving) return;
    setLeaving(true);
    setFailed(false);

    // The write first. Today is never rendered for an account the server still
    // considers mid-onboarding.
    //
    // And the answer is checked. Discarding it meant a 401 from a session that
    // expired mid-onboarding, or a dropped connection, still navigated to
    // Today with the account left `invited` and no consent recorded, which is
    // the one thing AC-7a is for. Staying put is also the honest outcome: the
    // next launch would send them back here regardless.
    if (!(await completeOnboarding())) {
      setLeaving(false);
      setFailed(true);
      return;
    }

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
  // Disabled while the write is in flight, and while the consent screen is
  // showing with either tick unanswered.
  const blocked = leaving || (consenting && !ready);

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
            // Skip lands on the consent screen, it does not complete first run.
            // Completing here wrote consent_version and consented_at for two
            // ticks nobody was shown, which is the exact thing AC-7a exists to
            // prevent. The web has always done this correctly; only the phones
            // regressed, and the comment at the top of this file already said
            // what the code was supposed to do.
            onPress={() => setStep(TUTORIAL.length)}
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
        {/* Announced, because the button simply stops working otherwise and
            nothing on screen says why. Same copy as the web. */}
        {failed ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="mb-space-5 text-center font-core text-body-sm text-text-on-attention"
          >
            That did not go through. Check your connection and try again.
          </Text>
        ) : null}
        <Pressable
          onPress={() => (consenting ? void finish(true) : setStep(step + 1))}
          disabled={blocked}
          className={`min-h-composer-height w-full items-center justify-center rounded-pill active:opacity-90 ${
            blocked ? "bg-ink-100" : "bg-ink-950"
          }`}
        >
          <Text
            className={`font-core text-body font-medium ${blocked ? "text-ink-400" : "text-text-inverse"}`}
          >
            {consenting ? "Get started" : "Next"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
