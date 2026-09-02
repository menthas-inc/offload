"use client";

// The landing page. One screen, one action, and the claim is the whole of it:
// "offload <verb> for you", with the verb cycling through the six things it
// actually does rather than a list of features nobody reads.
//
// The frame, the mark, the header row, the Privacy line and the moving
// background, is components/Screen.tsx and is shared verbatim with the gate, so
// clicking Sign in moves a card in over a page that does not change.

import { useEffect, useRef, useState } from "react";
import { Screen, ScreenFooter, ScreenHeader, ScreenMain, screenStyles } from "@/components/Screen";
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
    let frame = 0;
    let scale = 0;
    const tick = () => {
      const map = bleedRef.current;
      if (map) {
        const size = titleRef.current
          ? parseFloat(getComputedStyle(titleRef.current).fontSize) || BLEED_AT
          : BLEED_AT;
        const target = outRef.current ? (BLEED * size) / BLEED_AT : 0;
        scale += (target - scale) * 0.06;
        map.setAttribute("scale", scale.toFixed(2));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(arriving);
      cancelAnimationFrame(frame);
    };
  }, []);

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

  return (
    <Screen>
      <ScreenHeader
        action={
          <a className={screenStyles.action} href="/sign-in">
            Sign in
          </a>
        }
      />

      <ScreenMain>
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
            Dump things that clutter your mind and let us organize them for you.
          </p>

          {state === "sent" ? (
            <p className={styles.done} role="status">
              You are on the list. We will email{" "}
              <span className={styles.doneAddress}>{sentTo}</span> when your account is ready to
              use.
            </p>
          ) : (
            <>
              <form id="waitlist" className={styles.form} onSubmit={submit} noValidate>
                <label htmlFor="email" className={styles.srOnly}>
                  Email address
                </label>
                <input
                  id="email"
                  className={styles.input}
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  aria-invalid={error !== ""}
                  aria-describedby="waitlist-error"
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
              <p id="waitlist-error" className={styles.error} role="alert">
                {error}
              </p>
            </>
          )}
        </div>
      </ScreenMain>

      <ScreenFooter />
    </Screen>
  );
}
