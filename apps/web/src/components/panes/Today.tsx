"use client";

// Today, as a pane.
//
// Thin on purpose. Today is a view assembled from threads, calendars and
// notes, and two of those three do not exist, so what it has is the
// invitation and the three examples. Tapping an example fills the composer
// rather than submitting it, because the first thing that lands in an account
// should be something the person meant, not a sample.
//
// The composer used to be here and is in the shell now, under every pane. The
// kit always said so: "one composer, under both panes, spanning the window. It
// never belongs to a pane." An example therefore reaches it through an event
// rather than through a prop, which is the price of the composer not being
// anybody's child.

import { Icon } from "../Icon";
import { ZoneStrip } from "../shell/ZoneStrip";
import pane from "../../app/(shell)/shell.module.css";
import styles from "../../app/(shell)/today.module.css";

// The kit's three, verbatim, and the same three both phones show from
// apps/mobile/lib/gate.ts. Web had invented its own set once, which is the
// drift the shared copy on mobile exists to stop, except nothing shares it with
// web. Until there is one source both clients read, these are kept identical by
// hand.
const EXAMPLES = [
  "Book the Alfama flat for the 14th",
  "Ana can only travel the 14th to the 17th",
  "Oak brackets, 30cm, matte black",
] as const;

// The kit's line, verbatim, from WFirstRun.
const DAY_ONE_INVITATION =
  "Dump the first thing and offload will sort it. You do not need to pick a place for it, or name it, or come back and tidy it up.";

/** How an example reaches a composer that is nobody's child.
 *
 *  A custom event rather than a store or a context, because this is the only
 *  thing that ever crosses that boundary and a store would be scaffolding for
 *  one message. If a second thing needs to talk to the composer, that is the
 *  moment to build the store, not before. */
export const FILL_COMPOSER = "offload:fill-composer";

export function TodayPane() {
  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>Today</h1>
          {/* The kit's own sub for this state, and it stays honest until Today
              is a view over an agenda and a week rather than an invitation. */}
          <p className={pane.paneSub}>Nothing in here yet</p>
        </div>
      </div>

      <div className={pane.paneBody}>
        <div className={styles.today}>
          {/* 023. The one place the browser's own zone appears. */}
          <ZoneStrip />
          <p className={styles.emptyTitle}>{DAY_ONE_INVITATION}</p>

          <div className={styles.examples}>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className={styles.example}
                onClick={() =>
                  window.dispatchEvent(new CustomEvent(FILL_COMPOSER, { detail: example }))
                }
              >
                <Icon name="arrow-up" size={14} className={styles.exampleMark} />
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
