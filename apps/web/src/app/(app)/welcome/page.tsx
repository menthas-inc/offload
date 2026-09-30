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
import { Unanswered } from "../../../components/Unanswered";
import { completeOnboarding, updateName, useMe } from "../../../lib/use-me";
import { deviceZone } from "../../../lib/clock";
import { connectUrl, useCalendars } from "../../../lib/use-calendars";
import {
  CONNECT_BUTTON,
  CONNECT_SUB,
  CONNECT_TITLE,
  ConnectFacts,
  ProviderMark,
} from "../../../components/ConnectBlock";
import { NAME_MAX } from "../../../lib/name";
import { MailOffer, MAIL_OFFER_TITLE } from "../../../components/MailBlock";
import { Icon } from "../../../components/Icon";
import styles from "../auth.module.css";

// The connect screen's copy and mark live in `components/ConnectBlock.tsx`,
// where Settings draws the same screen (019). One source, two doors.
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
  // The optional steps, and they come last. See `offering` below. 026: Mail
  // comes before the calendar here, because connecting a calendar leaves for
  // Google's consent screen and nobody returns to a step after it.
  const [offering, setOffering] = useState<"mail" | "calendar" | null>(null);
  const calendars = useCalendars();

  // Seeded once, from whatever the sign-in backfill found. Once rather than on
  // every change of `state`, because re-seeding would overwrite what somebody
  // had typed the moment anything else refetched.
  const seeded = useRef(false);
  useEffect(() => {
    if (state.status !== "ready" || seeded.current) return;
    seeded.current = true;
    // The suggestion, not the name. `displayName` is null for everybody who
    // reaches this screen; `suggestedName` is what the provider said, held
    // where only this account can see it until it is confirmed here.
    setName(state.me.displayName ?? state.me.suggestedName ?? "");
  }, [state]);

  async function finish() {
    if (leaving) return;
    setLeaving(true);
    // The write happens before the navigation, so Today is never rendered for
    // an account the server still considers mid-onboarding.
    //
    // Two ways to be on this screen and two writes. Somebody mid first run
    // completes it, name and consent in one transaction. Somebody who finished
    // first run before there was a name to give has already consented, so there
    // is nothing to complete: they are here for the field alone and it saves on
    // its own.
    const recorded = nameOnly
      ? (await updateName(name.trim())) !== null
      : await completeOnboarding(name.trim(), deviceZone());
    if (!recorded) {
      // Stay put and let them try again. Going on to Today would show a screen
      // the server still thinks belongs to someone mid-onboarding, and the
      // next reload would send them back here anyway.
      setLeaving(false);
      setFailed(true);
      return;
    }
    // **The calendar offer comes after first run is complete, not inside it.**
    // Connecting leaves for Google's consent screen and comes back, and a round
    // trip through another origin in the middle of onboarding is somebody who
    // can be stranded halfway by a back button. By here the account is already
    // active and consented, so wandering off costs nothing: the next launch
    // lands on Today either way.
    setLeaving(false);
    offerAfter(null);
  }

  /** The next offer after `current`, or Today when there is none left. */
  function offerAfter(current: "mail" | "calendar" | null) {
    const me = state.status === "ready" ? state.me : null;
    if (current === null && me?.mailAvailable) return setOffering("mail");
    if (current !== "calendar" && calendars.available && calendars.connections.length === 0) {
      return setOffering("calendar");
    }
    router.replace("/today");
  }

  // Held blank rather than showing a spinner: the redirect decision lands in a
  // few milliseconds and a spinner that flashes reads as slower than nothing.
  if (state.status === "loading") return <main className={`${styles.page} ${styles.run}`} />;
  if (state.status === "unreachable") return <Unanswered retry={state.retry} />;

  // step 0..2 are the tutorial, step 3 asks for a name and step 4 is the
  // consent. `screen` is undefined on both of the last two, which is what
  // distinguishes them from the tutorial.
  // Somebody who finished first run before 011 has consented and read the
  // tutorial; the only thing missing is the name. They get that screen and
  // nothing else, rather than three screens of introduction they have already
  // seen and a consent they have already given.
  const nameOnly = !state.me.needsFirstRun;
  const offerAhead = state.me.mailAvailable || (calendars.available && calendars.connections.length === 0);

  const screen = nameOnly ? undefined : SCREENS[step];
  const naming = nameOnly || step === SCREENS.length;
  const consenting = !nameOnly && step === SCREENS.length + 1;
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
        {/* **Not now, never Skip.** Skip belongs to the tutorial and means skip
            the tutorial; turning down a connection is a different answer to a
            different question, so the word changes and the position does not. */}
        {offering ? (
          <button type="button" className={styles.skip} onClick={() => offerAfter(offering)}>
            Not now
          </button>
        ) : naming || consenting ? null : (
          <button type="button" className={styles.skip} onClick={() => setStep(SCREENS.length)}>
            Skip
          </button>
        )}
      </div>

      <div className={styles.runMiddle}>
        {screen ? <RunArt kind={screen.art} /> : null}
        {/* The provider's mark, and **never redrawn**: a third party's radius,
            colours and letterforms are their specification, and ninety percent
            right is what people spot instantly on a logo they see every day.
            A dashed stand-in until the official file is dropped in, so a
            missing asset is visible rather than silent. */}
        {offering === "calendar" ? <ProviderMark /> : null}
        {offering === "mail" ? (
          <span className={styles.mailMark} aria-hidden="true">
            <Icon name="mail" size={40} />
          </span>
        ) : null}

        <div className={styles.runCopy}>
          <h1 className={styles.runTitle}>
            {offering === "mail"
              ? MAIL_OFFER_TITLE
              : offering
                ? CONNECT_TITLE
                : screen
                ? screen.title
                : naming
                  ? "What should we call you?"
                  : "Before you start"}
          </h1>
          {offering === "mail" ? null : (
          <p className={styles.runSub}>
            {offering
              ? CONNECT_SUB
              : screen
                ? screen.sub
                : naming
                  ? "This is the name people you share a thread with will see."
                  : "offload holds what you put in it, so it is worth knowing what that means before you put anything in."}
          </p>
          )}
        </div>

        {offering === "mail" && state.status === "ready" ? (
          <MailOffer email={state.me.email} onDone={() => offerAfter("mail")} />
        ) : offering ? (
          /* Two facts, not a feature list: what offload reads, and what it does
             back, both as sentences rather than switches, per the 5 September
             privacy refusal. A switch implies somebody could have set it the
             other way. The strings match the phones exactly; the design system
             marks all of this copy provisional. */
          <ConnectFacts />
        ) : naming ? (
          /* `.consent` is the column both asking screens share, not a consent
             wrapper: same width, same alignment, same moment in the flow. */
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
                if (event.key !== "Enter" || !named) return;
                if (nameOnly) void finish();
                else setStep(step + 1);
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
          {offering === "mail" ? null : offering ? (
            <>
              <a className={styles.runButton} href={connectUrl("first-run")}>
                {CONNECT_BUTTON}
              </a>
            </>
          ) : (
            <button
              type="button"
              className={styles.runButton}
              onClick={() => (consenting || nameOnly ? void finish() : setStep(step + 1))}
              disabled={leaving || (consenting && !ready) || (naming && !named)}
            >
              {nameOnly
                ? "Get started"
                : consenting
                  ? // "Get started" on a screen with another screen after it is
                    // a promise the flow does not keep.
                    offerAhead
                    ? "Next"
                    : "Get started"
                  : "Next"}
            </button>
          )}

          {naming || consenting || offering ? null : (
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
