"use client";

// The thinking row: what the conversation shows while a turn runs.
//
// From `ui_kits/thinking_row/` in the design system, 2026-10-07. It replaced
// 017's three dots and the 2.5 second wait before the line: the Splash mark
// says working from the first frame, the model's phrase sits beside it as soon
// as one exists, and from ten seconds the Stop pill joins the row. No bubble,
// because nothing in the row is offload speaking. With no phrase it is the mark
// alone; offload never invents one.

import { useEffect, useRef, useState } from "react";
import styles from "../../app/(shell)/composer.module.css";

/** When the way out appears. The product owner's number. 017. */
export const STOP_AFTER_MS = 10_000;

/** How long a phrase stays up before the next may replace it, so two that land
 *  together do not flicker. */
export const PHRASE_FLOOR_MS = 400;

/** How long the old phrase takes to leave, matching the CSS. */
const LEAVE_MS = 350;

type Line = { text: string; key: number };

/** The phrase on screen and the one leaving it, with the floor applied. */
function usePhrase(step: string | null) {
  const [line, setLine] = useState<{ now: Line | null; leaving: Line | null }>({
    now: step ? { text: step, key: 0 } : null,
    leaving: null,
  });
  const shownAt = useRef(step ? Date.now() : 0);
  const keys = useRef(0);

  const current = line.now?.text ?? null;
  useEffect(() => {
    if (step === current) return;
    const wait = Math.max(0, shownAt.current + PHRASE_FLOOR_MS - Date.now());
    const timer = setTimeout(() => {
      shownAt.current = Date.now();
      keys.current += 1;
      const key = keys.current;
      setLine((was) => ({ now: step ? { text: step, key } : null, leaving: was.now }));
    }, wait);
    return () => clearTimeout(timer);
  }, [step, current]);

  const leaving = line.leaving?.key;
  useEffect(() => {
    if (leaving === undefined) return;
    const timer = setTimeout(() => setLine((was) => ({ ...was, leaving: null })), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return line;
}

export function Thinking({
  step,
  since,
  onStop,
}: {
  step: string | null;
  since: number | null;
  onStop: () => void;
}) {
  const [canStop, setCanStop] = useState(false);
  const line = usePhrase(step);

  // A timer to the one threshold left, rather than a clock: the phrase is
  // drawn when it arrives, so only Stop is a time.
  useEffect(() => {
    if (since === null) {
      setCanStop(false);
      return;
    }
    const wait = since + STOP_AFTER_MS - Date.now();
    if (wait <= 0) {
      setCanStop(true);
      return;
    }
    setCanStop(false);
    const timer = setTimeout(() => setCanStop(true), wait);
    return () => clearTimeout(timer);
  }, [since]);

  return (
    // The conversation's own live region already says "offload is thinking"
    // for the whole turn, so the row adds only the phrase, politely.
    <div className={styles.thinking}>
      <Splash />
      {/* Always in the document, so the first phrase is announced too: a
          region born with its text is not read. Hidden while empty. */}
      <span className={styles.phrase} aria-live="polite">
        {line.leaving ? (
          <span
            key={line.leaving.key}
            data-phrase
            className={styles.phraseOut}
            aria-hidden="true"
          >
            {line.leaving.text}
          </span>
        ) : null}
        {line.now ? (
          <span key={line.now.key} data-phrase className={styles.phraseIn}>
            {line.now.text}
          </span>
        ) : null}
      </span>
      {canStop ? (
        <button type="button" className={styles.stop} onClick={onStop}>
          <i aria-hidden="true" />
          Stop
        </button>
      ) : null}
    </div>
  );
}

/** The mark, animated. The geometry and the 3.2s keyframes are the kit's. */
function Splash() {
  return (
    <svg className={styles.splash} width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        className={styles.splashVessel}
        d="M5.5 11.5V15.5a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3V11.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle className={styles.splashLeft} cx="12" cy="14" r="1.05" fill="currentColor" />
      <circle className={styles.splashRight} cx="12" cy="14" r="0.9" fill="currentColor" />
      <circle className={styles.splashCentre} cx="12" cy="14" r="0.75" fill="currentColor" />
      <circle className={styles.splashDot} cx="12" cy="5.25" r="2.6" fill="currentColor" />
    </svg>
  );
}
