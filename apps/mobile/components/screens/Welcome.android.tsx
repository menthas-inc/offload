// First run, from ui_kits/android_app/M3FirstRun.jsx.
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

import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { TutorialArt, M3_TONE } from "../TutorialArt";
import { CONSENT, NAME_STEP, TUTORIAL } from "../../lib/gate";
import { ConsentTicks } from "../ConsentTicks";
import { NameField } from "../NameField";
import { completeOnboarding } from "../../lib/api";
import { useMe } from "../../lib/me";

export default function Welcome() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const [readPolicy, setReadPolicy] = useState(false);
  const [agreeToProcessing, setAgreeToProcessing] = useState(false);
  const [name, setName] = useState("");

  // Seeded once, from whatever the sign-in backfill found, and empty when it
  // found nothing, which is what Apple does when somebody declines to share
  // their name. Once rather than on every change of `me`, or a refetch would
  // overwrite what had been typed.
  const me = useMe();
  const seeded = useRef(false);
  useEffect(() => {
    if (!me || seeded.current) return;
    seeded.current = true;
    setName(me.displayName ?? "");
  }, [me]);

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
    if (!(await completeOnboarding(name.trim()))) {
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

  // 0..2 are the tutorial, 3 asks for a name and 4 is the consent, which is a
  // screen rather than a footnote on the third: the kit's "three screens and nothing to fill in"
  // stays true, and a consent that has to be specific cannot sit under an
  // illustration about notifications. It carries no dot, because it is not one
  // of the three.
  const screen = TUTORIAL[step];
  const naming = step === TUTORIAL.length;
  const consenting = step === TUTORIAL.length + 1;
  const named = name.trim().length > 0;
  const ready = readPolicy && agreeToProcessing;
  // Disabled while the write is in flight, and while the consent screen is
  // showing with either tick unanswered.
  const blocked = leaving || (consenting && !ready) || (naming && !named);

  return (
    <SafeAreaView className="flex-1 bg-a-surface">
      {/* The name step puts a text field on this screen, and the button that
          leaves it sits at the bottom. "padding" on both platforms, for the
          reason the waitlist screen writes out in full: this app is edge to
          edge, and under edge to edge Android ignores adjustResize, so the
          window does not move and the button ends up under the keyboard.
          Inert on every step that has no field. */}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <View className="flex-row items-center justify-between px-gutter-screen pt-space-6">
          <View className="flex-row items-center gap-space-3">
            {(naming || consenting ? [] : TUTORIAL).map((item, index) => (
              <View
                key={item.title}
                className={`h-space-3 rounded-pill ${index === step ? "bg-a-on" : "bg-a-c-high"}`}
                // The active step is a bar, not a bigger dot: progress along a
                // line rather than one of three equal choices.
                style={{ width: index === step ? 18 : 6 }}
              />
            ))}
          </View>

          {/* Skip has always meant "skip the tutorial", and it lands on the name
            rather than the consent, because both screens that ask something sit
            behind it. A Skip that jumped a required field would be a dead end
            with a disabled button on the next screen. */}
          {naming || consenting ? null : (
            <Pressable
              // Skip lands on the name screen and completes nothing.
              // Completing here wrote consent_version and consented_at for two
              // ticks nobody was shown, which is the exact thing AC-7a exists to
              // prevent. The web has always done this correctly; only the phones
              // regressed, and the comment at the top of this file already said
              // what the code was supposed to do.
              onPress={() => setStep(TUTORIAL.length)}
              className="min-h-tap-min justify-center"
            >
              <Text
                className="font-core font-medium text-blue-700"
                style={{ fontSize: 14, lineHeight: 20 }}
              >
                Skip
              </Text>
            </Pressable>
          )}
        </View>

        {naming ? (
          <>
            <View className="px-gutter-screen pt-space-9">
              <Text
                className="font-core font-semibold text-a-on"
                style={{ fontSize: 28, lineHeight: 33, letterSpacing: -0.4 }}
              >
                {NAME_STEP.title}
              </Text>
              <Text
                className="mt-space-5 font-core text-body text-a-on-var"
                style={{ fontSize: 16, lineHeight: 24, letterSpacing: 0.16 }}
              >
                {NAME_STEP.sub}
              </Text>
            </View>

            <View className="flex-1 px-gutter-screen pt-space-8">
              <NameField
                tone="android"
                value={name}
                onChange={setName}
                onSubmit={() => {
                  if (named) setStep(step + 1);
                }}
                autoFocus
              />
            </View>
          </>
        ) : consenting ? (
          <>
            <View className="px-gutter-screen pt-space-9">
              <Text
                className="font-core font-semibold text-a-on"
                style={{ fontSize: 28, lineHeight: 33, letterSpacing: -0.4 }}
              >
                {CONSENT.title}
              </Text>
              <Text
                className="mt-space-5 font-core text-body text-a-on-var"
                style={{ fontSize: 16, lineHeight: 24, letterSpacing: 0.16 }}
              >
                {CONSENT.sub}
              </Text>
            </View>

            <View className="flex-1 justify-center px-gutter-screen">
              <ConsentTicks
                tone="android"
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
              <TutorialArt kind={screen!.art} tone={M3_TONE} />
            </View>

            <View className="px-gutter-screen pb-space-8">
              <Text
                className="font-core font-semibold text-a-on"
                style={{ fontSize: 28, lineHeight: 33, letterSpacing: -0.4 }}
              >
                {screen!.title}
              </Text>
              <Text
                className="mt-space-5 font-core text-body text-a-on-var"
                style={{ fontSize: 16, lineHeight: 24, letterSpacing: 0.16 }}
              >
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
            className={`min-h-a-row-height w-full items-center justify-center rounded-pill active:opacity-90 ${
              blocked ? "bg-ink-100" : "bg-blue-600"
            }`}
          >
            <Text
              className={`font-core text-body font-medium ${blocked ? "text-ink-400" : "text-text-inverse"}`}
            >
              {consenting ? "Get started" : "Next"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
