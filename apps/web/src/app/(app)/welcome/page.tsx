"use client";

// First run: three screens, and nothing to fill in.
//
// It is an introduction, not a setup wizard. There is no name to type, no
// permission to grant, no category to pick, because offload's whole claim is
// that it does the filing, and asking a new person to configure the filing first
// would contradict the product on the first screen.
//
// The dots and Skip sit in the same place on all three so nothing moves under
// a thumb, and Skip and Get started do the same thing: nothing is collected,
// so a skipped run is a finished one.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding, useMe } from "../../../lib/use-me";
import styles from "../auth.module.css";

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

export default function WelcomePage() {
  const state = useMe("first-run");
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);

  async function finish() {
    if (leaving) return;
    setLeaving(true);
    // The write happens before the navigation, so Today is never rendered for
    // an account the server still considers mid-onboarding.
    await completeOnboarding();
    router.replace("/today");
  }

  // Held blank rather than showing a spinner: the redirect decision lands in a
  // few milliseconds, and a spinner that flashes reads as slower than nothing.
  if (state.status === "loading") return <main className={styles.screen} />;

  const screen = SCREENS[index]!;
  const last = index === SCREENS.length - 1;

  return (
    <main className={`${styles.screen} ${styles.runScreen}`}>
      <div className={styles.runTop}>
        <div className={styles.dots} role="presentation">
          {SCREENS.map((item, position) => (
            <span
              key={item.claim}
              className={`${styles.dot} ${position === index ? styles.dotOn : ""}`}
            />
          ))}
        </div>
        <button type="button" className={styles.skip} onClick={() => void finish()}>
          Skip
        </button>
      </div>

      <div className={styles.card}>
        <h1 className={styles.claim}>{screen.claim}</h1>
        <p className={styles.quiet}>{screen.quiet}</p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => (last ? void finish() : setIndex(index + 1))}
            disabled={leaving}
          >
            {last ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </main>
  );
}
