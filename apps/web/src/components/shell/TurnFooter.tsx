"use client";

// Everything offload has to say about a turn that is not a sentence.
//
// From `components/conversation/TurnFooter` in the design system, folded in on
// 2026-09-14 with 016.
//
// **It belongs to the turn rather than to either bubble**, and that is the whole
// reason it exists. The Done mark used to sit on the person's own sent bubble
// and the thread pills inside offload's reply, which was fine while everything
// that needed saying was said by one or the other. 016 gives a turn a page it
// may have read, and 004 already settled that an ordinary filing turn says
// nothing back, so a turn can have three things to report and no bubble to
// report them in.
//
// Order is fixed: state, then threads, then sources. What happened, where it
// landed, where it came from.

import Link from "next/link";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/composer.module.css";

export interface TurnRef {
  id: string;
  name: string;
}

export interface TurnSource {
  /** The registrable domain, and nothing else: no path, no title, no scheme. */
  domain: string;
  url: string;
}

/** Three, then a count. Six reads are possible in one turn and six chips under a
 *  one-sentence reply is a footnote section. */
const MAX_SOURCES = 3;

export function TurnFooter({
  state,
  refs = [],
  sources = [],
}: {
  state?: "seen" | "done" | null;
  refs?: TurnRef[];
  sources?: TurnSource[];
}) {
  const shown = sources.slice(0, MAX_SOURCES);
  const hidden = sources.length - shown.length;

  // An empty footer is no footer, never a 26px gap.
  if (!state && refs.length === 0 && sources.length === 0) return null;

  return (
    <div className={styles.turnFooter}>
      {state === "seen" ? (
        // The label is the readme's fuller string, because the marker has to say
        // what it means to somebody who cannot see it.
        <span className={styles.seen} aria-label="seen, not answered yet">
          <span aria-hidden="true">👀</span>
        </span>
      ) : null}

      {state === "done" ? (
        <span className={styles.done}>
          <Icon name="check" size={11} />
          Done
        </span>
      ) : null}

      {refs.map((ref) => (
        <Link key={ref.id} href={`/threads/${ref.id}`} className={styles.threadLink}>
          <Icon name="lasso" size={13} />
          {ref.name}
        </Link>
      ))}

      {/* An anchor rather than a chip, because this one leaves the app.
          **The only external link in the conversation**, and the reason it is
          allowed is the source of the string: a domain from the record of what
          was read, rather than a word the page chose. The markup rule bans an
          external link inside a reply because the words there are page-authored
          and a link in offload's voice is a phishing surface. */}
      {shown.map((source) => (
        <a
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className={styles.sourceChip}
        >
          <Icon name="link" size={12} />
          <span className={styles.sourceDomain}>{source.domain}</span>
        </a>
      ))}

      {/* Text, not a chip and not a control: there is no screen listing what a
          turn read, and a chip would promise one. */}
      {hidden > 0 ? <span className={styles.sourceMore}>and {hidden} more</span> : null}
    </div>
  );
}
