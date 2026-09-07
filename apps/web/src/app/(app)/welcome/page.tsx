"use client";

// First run: three screens with nothing to fill in, and then one that asks.
//
// From ui_kits/web_app/WFirstRunGate.jsx. The illustration carries each screen
// and the sentence explains it, rather than the sentence carrying it alone. The
// wordmark and Skip stay in the same place so nothing moves, and the progress
// dots sit under the button where they report rather than offer.
//
// The consent is a fourth screen rather than a footnote on the third, and that
// is deliberate twice over. The kit's rule survives intact: the tutorial is
// still three screens and still has nothing to fill in. And consent that has to
// be specific cannot sit underneath an illustration about notifications, where
// it reads as small print on something else. It carries no dot, because it is
// not one of the three.
//
// Skip therefore skips the tutorial and lands here rather than completing first
// run. Nobody has to read the three screens; everybody has to answer this.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "../../../components/Logo";
import { RunArt } from "../../../components/RunArt";
import { completeOnboarding, useMe } from "../../../lib/use-me";
import { NAME_MAX } from "../../../lib/name";
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
    art: "threads",
  },
  {
    title: "It only interrupts when it matters",
    sub: "Deadlines and answers you are waiting on. Nothing else.",
    art: "notification",
  },
] as const;

/** The tick, drawn along its own length. Straight from the design system's
 *  Checkbox, which both phone kits animate the same way. */
function Tick() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--text-inverse)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path className={styles.tickMark} d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export default function WelcomePage() {
  const state = useMe("first-run");
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [readPolicy, setReadPolicy] = useState(false);
  const [agreeToProcessing, setAgreeToProcessing] = useState(false);
  const [name, setName] = useState("");

  // Seeded once, from whatever the sign-in backfill found. Once rather than on
  // every change of `state`, because re-seeding would overwrite what somebody
  // had typed the moment anything else refetched.
  const seeded = useRef(false);
  useEffect(() => {
    if (state.status !== "ready" || seeded.current) return;
    seeded.current = true;
    setName(state.me.displayName ?? "");
  }, [state]);

  async function finish() {
    if (leaving) return;
    setLeaving(true);
    // The write happens before the navigation, so Today is never rendered for
    // an account the server still considers mid-onboarding.
    const recorded = await completeOnboarding(name.trim());
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

  // step 0..2 are the tutorial, step 3 asks for a name and step 4 is the
  // consent. `screen` is undefined on both of the last two, which is what
  // distinguishes them from the tutorial.
  const screen = SCREENS[step];
  const naming = step === SCREENS.length;
  const consenting = step === SCREENS.length + 1;
  const named = name.trim().length > 0;
  const ready = readPolicy && agreeToProcessing;

  return (
    <main className={`${styles.page} ${styles.run}`}>
      <div className={styles.runTop}>
        <Logo size={22} />
        {/* Skip has always meant "skip the tutorial", and it now lands on the
            name rather than the consent, because both screens that ask
            something sit behind it. A Skip that jumped past a required field
            would be a dead end with a disabled button on the next screen. */}
        {naming || consenting ? null : (
          <button type="button" className={styles.skip} onClick={() => setStep(SCREENS.length)}>
            Skip
          </button>
        )}
      </div>

      <div className={styles.runMiddle}>
        {screen ? <RunArt kind={screen.art} /> : null}

        <div className={styles.runCopy}>
          <h1 className={styles.runTitle}>
            {screen ? screen.title : naming ? "What should we call you?" : "Before you start"}
          </h1>
          <p className={styles.runSub}>
            {screen
              ? screen.sub
              : naming
                ? "This is the name people you share a thread with will see."
                : "offload holds what you put in it, so it is worth knowing what that means before you put anything in."}
          </p>
        </div>

        {naming ? (
          <div className={styles.consent}>
            <input
              className={styles.nameField}
              type="text"
              value={name}
              autoFocus
              autoComplete="name"
              maxLength={NAME_MAX}
              placeholder="Your name"
              aria-label="Your name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && named) setStep(step + 1);
              }}
            />
          </div>
        ) : null}

        {consenting ? (
          <div className={styles.consent}>
            <label className={styles.tick}>
              <input
                type="checkbox"
                className={styles.tickInput}
                checked={readPolicy}
                onChange={(event) => setReadPolicy(event.target.checked)}
              />
              <span className={styles.tickBox}>{readPolicy ? <Tick /> : null}</span>
              <span className={styles.tickLabel}>
                I have read the{" "}
                <a className={styles.tickLink} href="/privacy" target="_blank" rel="noreferrer">
                  privacy policy
                </a>
                .
              </span>
            </label>

            <label className={styles.tick}>
              <input
                type="checkbox"
                className={styles.tickInput}
                checked={agreeToProcessing}
                onChange={(event) => setAgreeToProcessing(event.target.checked)}
              />
              <span className={styles.tickBox}>{agreeToProcessing ? <Tick /> : null}</span>
              <span className={styles.tickLabel}>
                I understand offload will hold whatever I dump in, which can include health, money
                and other private matters, and I agree to it being processed to run offload.
              </span>
            </label>

            <p className={styles.consentNote}>
              We do not recommend sharing passwords, card numbers or government IDs in any AI tool.
            </p>
          </div>
        ) : null}

        <div className={styles.runFoot}>
          {failed ? (
            <p className={styles.refusal} role="alert" style={{ marginTop: 0 }}>
              That did not go through. Check your connection and try again.
            </p>
          ) : null}
          <button
            type="button"
            className={styles.runButton}
            onClick={() => (consenting ? void finish() : setStep(step + 1))}
            disabled={leaving || (consenting && !ready) || (naming && !named)}
          >
            {consenting ? "Get started" : "Next"}
          </button>

          {naming || consenting ? null : (
            <span className={styles.dots} role="presentation">
              {SCREENS.map((item, index) => (
                <span
                  key={item.title}
                  className={`${styles.dot} ${index === step ? styles.dotOn : ""}`}
                />
              ))}
            </span>
          )}
        </div>
      </div>
    </main>
  );
}
