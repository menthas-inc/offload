"use client";

// The landing page. One scroll, one action. The first screen is the claim,
// "offload <verb> for you", with the verb cycling through the six things it
// actually does. Under it, the story says in plain words what offload is and
// that it works with Google Calendar and why, which is what Google's OAuth
// review opens this page to read; then the waitlist again.
//
// The frame, the mark, the header row, the Privacy line and the background, is
// components/Screen.tsx and is shared with the gate. This page alone asks for
// its scroll mode (handoff/APPLY-2026-10-04-landing.md).

import { useEffect, useRef, useState } from "react";
import { LandingStory } from "../../components/LandingStory";
import { Screen, ScreenFooter, ScreenHeader, screenStyles } from "../../components/Screen";
import styles from "./page.module.css";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

const WORDS = ["remembers", "organizes", "sorts", "files", "keeps", "tracks"];

/** How long the word takes to leave, and the same again to arrive. Matches
 *  --word-cycle in the stylesheet, which owns the transition. */
const CYCLE_MS = 1120;
const HOLD_MS = 5000;

/** The turbulence displacement at full bleed, in the units of the filter's
 *  user space, calibrated against the headline size it was drawn at. Scaled by
 *  the rendered size so a phone gets a smear and not a smudge. */
const BLEED = 30;
const BLEED_AT = 92;

// Deliberately loose. The server is the only thing that can actually say
// whether an address exists, so this rejects what is obviously not one and
// nothing else.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type State = "idle" | "sending" | "sent";

export default function Landing() {
  const [state, setState] = useState<State>("idle");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  // A honeypot. Real people never see it; scripts fill everything.
  const [company, setCompany] = useState("");

  const [index, setIndex] = useState(0);
  const [out, setOut] = useState(false);
  const outRef = useRef(false);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const bleedRef = useRef<SVGFEDisplacementMapElement | null>(null);
  const wakeBleed = useRef<(() => void) | null>(null);

  outRef.current = out;

  // The cycle. Reduced motion opts out of the whole thing rather than shortening
  // it: the point of the animation is the dissolve, and a word that swaps every
  // five seconds with no transition is just a page that will not sit still.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let arriving = 0;
    const interval = window.setInterval(() => {
      setOut(true);
      arriving = window.setTimeout(() => {
        setIndex((current) => (current + 1) % WORDS.length);
        // Two frames, not one. The new word has to be painted at full blur
        // before the class comes off, or the browser has nothing to
        // transition from and it appears instantly.
        requestAnimationFrame(() => requestAnimationFrame(() => setOut(false)));
      }, CYCLE_MS);
    }, HOLD_MS);

    // The bleed is an SVG attribute, which CSS cannot transition, so it is
    // eased by hand towards whichever end the word is at.
    //
    // It runs while a word is dissolving or arriving and stops the moment it
    // gets there, which is most of the time: the word holds for seconds between
    // swaps and the loop has nothing to do in any of them. Left running, every
    // frame recalculated style to read the font size and wrote an attribute
    // that re-runs the title's displacement filter, which measured as the
    // single most expensive thing on the page.
    let frame = 0;
    let scale = 0;
    let size = BLEED_AT;

    const measure = () => {
      if (titleRef.current) size = parseFloat(getComputedStyle(titleRef.current).fontSize) || BLEED_AT;
    };

    const tick = () => {
      const map = bleedRef.current;
      // Clear the handle on the way out, or the loop is neither running nor
      // restartable and the dissolve stops for the life of the page.
      if (!map) {
        frame = 0;
        return;
      }
      const target = outRef.current ? (BLEED * size) / BLEED_AT : 0;
      scale += (target - scale) * 0.06;
      const done = Math.abs(target - scale) < 0.01;
      if (done) scale = target;
      map.setAttribute("scale", scale.toFixed(2));
      frame = done ? 0 : requestAnimationFrame(tick);
    };

    // Woken by the swap, not polled. `out` is what the loop is chasing, so a
    // change to it is the only thing that can give it somewhere to go.
    wakeBleed.current = () => {
      measure();
      if (!frame) frame = requestAnimationFrame(tick);
    };

    measure();
    window.addEventListener("resize", measure);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(arriving);
      window.removeEventListener("resize", measure);
      wakeBleed.current = null;
      cancelAnimationFrame(frame);
    };
  }, []);

  // Both ends of the swap wake it: the word leaving and the next one arriving.
  useEffect(() => {
    wakeBleed.current?.();
  }, [out]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;

    const address = email.trim();
    if (!address) {
      setError("Add your email so we know where to write.");
      return;
    }
    if (!LOOKS_LIKE_EMAIL.test(address)) {
      setError("That does not look like an email address.");
      return;
    }

    setError("");
    setState("sending");

    try {
      await fetch(`${API}/v1/waitlist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, company }),
      });
    } catch {
      // Deliberately swallowed. The server answers identically whatever
      // happens, so surfacing a network error here would be the one thing on
      // this page that tells someone which branch ran. The error line above is
      // for what we can judge ourselves, which is the shape of the address.
    }

    setSentTo(address);
    setState("sent");
  }

  const word = WORDS[index];

  /** The waitlist, which the page shows twice: under the claim and again at
   *  the end. One state behind both, so joining from either answers both, and
   *  `at` keeps their ids apart. */
  const waitlist = (at: "top" | "end") => {
    const id = (name: string) => (at === "top" ? name : `${name}-end`);
    return state === "sent" ? (
      <p className={styles.done} role="status">
        You are on the list. We will email <span className={styles.doneAddress}>{sentTo}</span> when your account is
        ready to use.
      </p>
    ) : (
      <>
        <form id={id("waitlist")} className={styles.form} onSubmit={submit} noValidate>
          <label htmlFor={id("email")} className={styles.srOnly}>
            Email address
          </label>
          <input
            id={id("email")}
            className={styles.input}
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            aria-invalid={error !== ""}
            aria-describedby={id("waitlist-error")}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError("");
            }}
          />
          <input
            className={styles.trap}
            type="text"
            name="company"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />
          <button className={styles.button} type="submit" disabled={state === "sending"}>
            Join the waitlist
          </button>
        </form>
        <p id={id("waitlist-error")} className={styles.error} role="alert">
          {error}
        </p>
      </>
    );
  };

  /** The scroll mark goes to where the panel has arrived with its first step
   *  in it, which is most of one window down. */
  const toStory = () => window.scrollTo({ top: window.innerHeight * 0.95, behavior: "smooth" });

  return (
    <Screen scroll>
      <ScreenHeader
        action={
          <a className={screenStyles.action} href="/sign-in">
            Sign in
          </a>
        }
      />

      <main className={styles.main}>
        <section className={styles.first}>
          <div className={styles.hero}>
            <svg className={styles.defs} focusable="false" aria-hidden="true">
              <defs>
                <filter id="wordBleed" x="-40%" y="-50%" width="180%" height="200%">
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency="0.018 0.026"
                    numOctaves="3"
                    seed="5"
                    result="n"
                  />
                  <feDisplacementMap
                    ref={bleedRef}
                    in="SourceGraphic"
                    in2="n"
                    scale="0"
                    xChannelSelector="R"
                    yChannelSelector="G"
                  />
                </filter>
              </defs>
            </svg>

            <h1 ref={titleRef} className={styles.title}>
              <span className={styles.line}>offload</span>
              <span className={styles.line}>
                <span className={styles.cycle} data-state={out ? "out" : "in"}>
                  <span className={styles.word}>{word}</span>
                  <span className={`${styles.ghost} ${styles.ghostViolet}`} aria-hidden="true">
                    {word}
                  </span>
                  <span className={`${styles.ghost} ${styles.ghostAmber}`} aria-hidden="true">
                    {word}
                  </span>
                  <span className={`${styles.ghost} ${styles.ghostBlue}`} aria-hidden="true">
                    {word}
                  </span>
                </span>
              </span>
              <span className={styles.line}>for you</span>
            </h1>

            <p className={styles.sub}>
              Dump whatever is cluttering your mind, and offload sorts it for you.
            </p>

            {waitlist("top")}
          </div>

          <button type="button" className={styles.cue} onClick={toStory} data-scroll-cue>
            <span className={styles.cueMark} aria-hidden="true">
              <i className={styles.cueDot} />
              <b className={styles.cueVessel} />
            </span>
            <span>See how it works</span>
          </button>
        </section>

        <LandingStory />

        <section className={styles.closing} data-landing-end>
          <h2 className={styles.closingTitle}>offload keeps track for you</h2>
          <p className={styles.closingBody}>
            offload is invite only for now. Join the waitlist and we will email you when your account is ready to use.
          </p>
          {waitlist("end")}
        </section>
      </main>

      <ScreenFooter />
    </Screen>
  );
}
