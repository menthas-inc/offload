"use client";

// First run: three screens, and nothing to fill in.
//
// From ui_kits/web_app/WFirstRunGate.jsx. The illustration carries each screen
// and the sentence explains it, rather than the sentence carrying it alone. The
// wordmark and Skip stay in the same place on all three so nothing moves, and
// the progress dots sit under the button where they report rather than offer.
//
// Skip and Get started do the same thing: nothing is collected, so a skipped
// run is a finished one.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "../../../components/Logo";
import { RunArt } from "../../../components/RunArt";
import { completeOnboarding, useMe } from "../../../lib/use-me";
import styles from "../auth.module.css";

const SCREENS = [
  {
    title: "Dump anything",
    sub: "Half a thought, a photo, a voice note. No folders, no tidying.",
    art: "bubbles",
  },
  {
    title: "offload sorts it",
    sub: "Related bits end up together, with the dates and the money attached.",
    art: "things",
  },
  {
    title: "It only interrupts when it matters",
    sub: "Deadlines and answers you are waiting on. Nothing else.",
    art: "notification",
  },
] as const;

export default function WelcomePage() {
  const state = useMe("first-run");
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function finish() {
    if (leaving) return;
    setLeaving(true);
    // The write happens before the navigation, so Today is never rendered for
    // an account the server still considers mid-onboarding.
    const recorded = await completeOnboarding();
    if (!recorded) {
      // Stay put and let them try again. Going on to Today would show a screen
      // the server still thinks belongs to someone mid-onboarding, and the
      // next reload would send them back here anyway.
      setLeaving(false);
      setFailed(true);
      return;
    }
    router.replace("/today");
  }

  // Held blank rather than showing a spinner: the redirect decision lands in a
  // few milliseconds and a spinner that flashes reads as slower than nothing.
  if (state.status === "loading") return <main className={`${styles.page} ${styles.run}`} />;

  const screen = SCREENS[step]!;
  const last = step === SCREENS.length - 1;

  return (
    <main className={`${styles.page} ${styles.run}`}>
      <div className={styles.runTop}>
        <Logo size={22} />
        <button type="button" className={styles.skip} onClick={() => void finish()}>
          Skip
        </button>
      </div>

      <div className={styles.runMiddle}>
        <RunArt kind={screen.art} />

        <div className={styles.runCopy}>
          <h1 className={styles.runTitle}>{screen.title}</h1>
          <p className={styles.runSub}>{screen.sub}</p>
        </div>

        <div className={styles.runFoot}>
          {failed ? (
            <p className={styles.refusal} role="alert" style={{ marginTop: 0 }}>
              That did not go through. Check your connection and try again.
            </p>
          ) : null}
          <button
            type="button"
            className={styles.runButton}
            onClick={() => (last ? void finish() : setStep(step + 1))}
            disabled={leaving}
          >
            {last ? "Get started" : "Next"}
          </button>

          <span className={styles.dots} role="presentation">
            {SCREENS.map((item, index) => (
              <span
                key={item.title}
                className={`${styles.dot} ${index === step ? styles.dotOn : ""}`}
              />
            ))}
          </span>
        </div>
      </div>
    </main>
  );
}
