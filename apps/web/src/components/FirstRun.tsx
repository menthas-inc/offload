"use client";

// 033. First run on the web: the intro, then Before you start, then Bring it
// all in at its own address, then Today.
//
// From `explorations/onboarding-v2.html`. Bring it all in is a page of its
// own, `/welcome/bring`, because connecting a calendar navigates to Google and
// back and a step held here would be gone when it returned.
//
// `replay` is See the tutorial again, from Help (031): the intro alone, its
// button Done and back to Help. It reads `useMe("shell")` so an account that
// finished first run long ago is not sent on to Today, and nothing is written.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Unanswered } from "./Unanswered";
import { completeOnboarding, giveConsent, updateName, useMe } from "../lib/use-me";
import { deviceZone } from "../lib/clock";
import { useCalendars } from "../lib/use-calendars";
import { afterYou, bringCards, firstStep, type Step } from "../lib/first-run";
import { BEFORE, BRING } from "./firstrun/copy";
import { BeforeYouStart } from "./firstrun/BeforeYouStart";
import { Intro } from "./firstrun/Intro";
import styles from "./firstrun/firstrun.module.css";

const BACK_TO_HELP = "/settings/help";

export function FirstRun({ replay = false }: { replay?: boolean }) {
  const state = useMe(replay ? "shell" : "first-run");
  const calendars = useCalendars();
  const router = useRouter();
  const [step, setStep] = useState<Step | null>(null);
  const [nameOnly, setNameOnly] = useState(false);
  const [again, setAgain] = useState(false);
  const [askName, setAskName] = useState(true);
  const [name, setName] = useState("");
  const [readPolicy, setReadPolicy] = useState(false);
  const [agreeToProcessing, setAgreeToProcessing] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [written, setWritten] = useState(false);

  // Latched and seeded on the first identity, never again: a refetch must not
  // overwrite what has been typed or turn the screen into another one.
  const opened = useRef(false);
  useEffect(() => {
    if (state.status !== "ready" || opened.current) return;
    opened.current = true;
    const only = !replay && !state.me.needsFirstRun;
    // The policy or the terms moved since they agreed: first run's last
    // screen, the ticks alone, and never the whole of first run again.
    const asked = only && state.me.needsConsent;
    setAgain(asked);
    setAskName(!asked || state.me.needsName);
    setNameOnly(only && !asked);
    setStep(firstStep({ replay, nameOnly: only }));
    // The suggestion, not the name: `displayName` is null for everybody who
    // reaches first run, `suggestedName` is what the provider said.
    setName(state.me.displayName ?? state.me.suggestedName ?? "");
  }, [state, replay]);

  async function onContinue() {
    if (working) return;
    setWorking(true);
    setFailed(false);
    // The write first, checked: Today is never drawn for an account the
    // server still considers mid first run, and a refusal stays here.
    const recorded = again
      ? (!askName || (await updateName(name.trim())) !== null) && (await giveConsent())
      : nameOnly
        ? (await updateName(name.trim())) !== null
        : await completeOnboarding(name.trim(), deviceZone());
    if (!recorded) {
      setWorking(false);
      setFailed(true);
      return;
    }
    if (nameOnly || again) return router.replace("/today");
    setWritten(true);
  }

  // Draw or skip Bring it all in only once the calendars read has answered:
  // a read still in flight is not "no calendar".
  const me = state.status === "ready" ? state.me : null;
  useEffect(() => {
    if (!written || !me || !calendars.settled) return;
    const cards = bringCards({
      mailAvailable: me.mailAvailable,
      calendarOffer: calendars.available && calendars.connections.length === 0,
      notifications: "unsupported",
    });
    router.replace(afterYou(cards) === "bring" ? "/welcome/bring" : "/today");
  }, [written, me, calendars.settled, calendars.available, calendars.connections.length, router]);

  // Held blank rather than a spinner: the redirect decision lands in a few
  // milliseconds and a spinner that flashes reads as slower than nothing.
  if (state.status === "loading" || (state.status === "ready" && !step)) return <main className={styles.page} />;
  if (state.status === "unreachable") return <Unanswered retry={state.retry} attempt={state.attempt} retryAfter={state.retryAfter} />;

  if (step === "intro") {
    return (
      <Intro
        button={replay ? BRING.done : BEFORE.next}
        onLeave={replay ? () => router.replace(BACK_TO_HELP) : () => setStep("you")}
      />
    );
  }
  return (
    <BeforeYouStart
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
    />
  );
}
