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
import { AdminLink } from "../../../components/AdminLink";
import { useMe } from "../../../lib/use-me";
import styles from "../auth.module.css";

// The kit's three, verbatim, and the same three both phones show from
// apps/mobile/lib/gate.ts. Web had invented its own set and its own
// invitation line, which is the drift the shared copy on mobile exists to
// stop, except nothing shared it with web. Until there is one source both
// clients read, these have to be kept identical by hand.
const EXAMPLES = [
  "Book the Alfama flat for the 14th",
  "Ana can only travel the 14th to the 17th",
  "Oak brackets, 30cm, matte black",
] as const;

const DAY_ONE_INVITATION =
  "Dump the first thing and offload will sort it. You do not need to pick a place for it, or name it, or come back and tidy it up.";

export default function TodayPage() {
  const state = useMe("shell");
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  if (state.status === "loading") return <main className={styles.todayScreen} />;

  return (
    <main className={styles.todayScreen}>
      <AdminLink />
      <div className={styles.today}>
        <p className={styles.emptyTitle}>{DAY_ONE_INVITATION}</p>

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
