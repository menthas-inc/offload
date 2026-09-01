"use client";

// Today, on day one.
//
// The empty state is not a zero and not an illustration of one. It is an
// invitation in offload's own voice plus three dashed examples, and tapping an
// example fills the composer rather than submitting it. The first thing that
// lands in an account should be something the person meant, not a sample.
//
// The composer is present because on an empty screen the answer is always the
// same: dump something. Nothing it accepts is wired up yet.

import { useRef, useState } from "react";
import { useMe } from "../../../lib/use-me";
import styles from "../auth.module.css";

const EXAMPLES = [
  "Ana's birthday is in March, she wants the ceramics class",
  "flight to Lisbon on the 14th, check in opens the day before",
  "that podcast about the bridge collapse, listen on the train",
] as const;

export default function TodayPage() {
  const state = useMe("shell");
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  if (state.status === "loading") return <main className={styles.screen} />;

  const firstName = state.me.displayName?.trim().split(/\s+/)[0];

  return (
    <main className={styles.screen} style={{ alignItems: "flex-start", paddingTop: 96 }}>
      <div className={styles.today}>
        <p className={styles.emptyTitle}>
          {firstName ? `Nothing here yet, ${firstName}.` : "Nothing here yet."} Dump the first
          thing and offload will start filing.
        </p>

        <div className={styles.examples}>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className={styles.example}
              onClick={() => {
                setDraft(example);
                input.current?.focus();
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.composer}>
        <div className={styles.composerInner}>
          <input
            ref={input}
            className={styles.composerInput}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Dump anything"
            aria-label="Dump anything"
          />
          <button type="button" className={styles.send} disabled={draft.trim().length === 0} aria-label="Send">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </main>
  );
}
