// 033. First run: the intro, Before you start, Bring it all in, then Today.
//
// From `explorations/onboarding-v2.html` and its handoff. Three screens after
// sign in where there were seven. One component for both phones, with a
// `tone`: the words and the order are the same and only the chrome forks.
//
// The steps are state inside one screen, as they were, so moving between them
// mounts nothing and Android's back is handled here.
//
// `replay`, 031: Help's See the tutorial again. The intro alone, its button
// Done and back to Help, with nothing written or asked.

import { useEffect, useRef, useState } from "react";
import { BackHandler, KeyboardAvoidingView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { completeOnboarding } from "../../lib/api";
import { useCalendars } from "../../lib/calendars";
import { deviceZone } from "../../lib/clock";
import { afterYou, backFrom, bringCards, firstStep, type Card, type NotificationOffer, type Step } from "../../lib/firstRun";
import { BEFORE, BRING } from "../../lib/gate";
import { giveConsent, saveName, useMe } from "../../lib/me";
import { register } from "../../lib/notifications";
import { ToastHost, useToast } from "../shell/Toast";
import { BeforeYouStart } from "./BeforeYouStart";
import { BringItIn } from "./BringItIn";
import { Intro } from "./Intro";
import { SKIN, type Tone } from "./skin";

export function FirstRun({ tone, replay = false }: { tone: Tone; replay?: boolean }) {
  const router = useRouter();
  const me = useMe();
  const calendars = useCalendars();
  const toast = useToast();

  const [step, setStep] = useState<Step | null>(null);
  const [nameOnly, setNameOnly] = useState(false);
  const [again, setAgain] = useState(false);
  const [askName, setAskName] = useState(true);
  const [name, setName] = useState("");
  const [readPolicy, setReadPolicy] = useState(false);
  const [agreeToProcessing, setAgreeToProcessing] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  // Written and waiting for the reads that decide whether Bring it all in is
  // drawn. They almost always land during the intro.
  const [decided, setDecided] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);

  // Whether the system has ever asked, read once as first run opens. Not
  // re-read after the card asks, so the card answers in place rather than
  // vanishing.
  const [notify, setNotify] = useState<NotificationOffer | null>(null);
  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then((answer) => setNotify(answer.status === "undetermined" ? "ask" : "decided"))
      .catch(() => setNotify("decided"));
  }, []);

  // Latched on the first identity, never recomputed: finishing first run
  // flips `needsFirstRun`, and a recomputed path would turn the screen into
  // the name-only one under somebody's thumb. Seeded once for the same
  // reason: a refetch must not overwrite what has been typed.
  const opened = useRef(false);
  useEffect(() => {
    if (!me || opened.current) return;
    opened.current = true;
    const only = !replay && !me.needsFirstRun;
    // The policy or the terms moved since they agreed: first run's last
    // screen, the ticks alone, and never the whole of first run again.
    const asked = only && me.needsConsent;
    setAgain(asked);
    setAskName(!asked || me.needsName);
    setNameOnly(only && !asked);
    setStep(firstStep({ replay, nameOnly: only }));
    // The suggestion, not the name: `displayName` is null for everybody who
    // reaches first run, `suggestedName` is what the provider said.
    setName(me.displayName ?? me.suggestedName ?? "");
  }, [me, replay]);

  // Back to Help, or to Help when a deep link opened it with nothing behind.
  const close = () => (router.canGoBack() ? router.back() : router.replace("/settings/help"));
  const today = () => router.replace("/today");

  // Before you start goes back to the intro; Bring it all in leaves for
  // Today, as Skip for now does, since the account is active by then. Held
  // while the write is in flight.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      // Asked again has no intro behind it to go back to.
      const next = backFrom(step ?? "intro", { nameOnly: nameOnly || again, working });
      if (next === "intro") setStep("intro");
      else if (next === "today") router.replace("/today");
      return next !== "system";
    });
    return () => sub.remove();
  }, [step, nameOnly, again, working, router]);

  async function onContinue() {
    if (working) return;
    setWorking(true);
    setFailed(false);
    const recorded = again
      ? (!askName || (await saveName(name.trim())) !== null) && (await giveConsent())
      : nameOnly
        ? (await saveName(name.trim())) !== null
        : // The write first, checked. Today is never drawn for an account the
          // server still considers mid first run, and a refusal stays here.
          await completeOnboarding(name.trim(), deviceZone());
    if (!recorded) {
      setWorking(false);
      setFailed(true);
      return;
    }
    // Already active, so nothing more to offer: straight to Today.
    if (again) return today();
    if (nameOnly) return today();
    // The account is active now. A phone that already allows notifications
    // has no card to press, and its launch registration was refused while
    // this account was in first run; `register` does nothing without leave.
    void register();
    setDecided(true);
  }

  // Draw or skip, only from settled reads: a fetch still in flight is not "no
  // card". A calendars read that failed settles as unavailable.
  useEffect(() => {
    if (!decided || !me || calendars.loading || notify === null) return;
    setDecided(false);
    const next = bringCards({
      mailAvailable: me.mailAvailable,
      calendarOffer: calendars.available && calendars.connections.length === 0,
      notifications: notify,
    });
    if (afterYou(next) === "today") return today();
    setCards(next);
    setWorking(false);
    setStep("bring");
  }, [decided, me, calendars.loading, calendars.available, calendars.connections.length, notify]);

  const page = SKIN[tone].page;
  // Held blank until the identity lands: which screen this person needs is
  // not known before it, and the launch gate just fetched it, so it is warm.
  if (!me || !step) return <SafeAreaView className={`flex-1 ${page}`} />;

  return (
    <SafeAreaView className={`flex-1 ${page}`}>
      {/* "padding" on both platforms: this app is edge to edge, where Android
          ignores adjustResize, so without it the footer sits under the
          keyboard on Before you start. Inert on the screens with no field. */}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        {step === "intro" ? (
          <Intro tone={tone} button={replay ? BRING.done : BEFORE.next} onLeave={replay ? close : () => setStep("you")} />
        ) : step === "you" ? (
          <BeforeYouStart
            tone={tone}
            again={again}
            askName={askName}
            nameOnly={nameOnly}
            name={name}
            onName={setName}
            readPolicy={readPolicy}
            agreeToProcessing={agreeToProcessing}
            onReadPolicy={setReadPolicy}
            onAgreeToProcessing={setAgreeToProcessing}
            working={working}
            failed={failed}
            onContinue={() => void onContinue()}
            // Pushed over the question, so Back comes back to it unanswered.
            onWayOut={() => router.push("/settings/account")}
          />
        ) : (
          <BringItIn
            tone={tone}
            cards={cards}
            email={me.email}
            connected={calendars.connections.length > 0}
            onCalendarReturn={calendars.reload}
            toast={toast}
            onLeave={today}
          />
        )}
      </KeyboardAvoidingView>
      <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
        <ToastHost state={toast} />
      </View>
    </SafeAreaView>
  );
}
