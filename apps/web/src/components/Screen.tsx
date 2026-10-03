// The frame both pre-account screens share: the atmosphere, the mark top left,
// one thing in the middle, Privacy bottom right.
//
// It exists so the landing page and the gate cannot drift apart. Every element
// outside the middle is rendered by this file for both of them, so "the logo
// stays in the same spot" is a fact about the markup rather than two numbers
// that have to be kept equal by hand.

import type { ReactNode } from "react";
import { Atmosphere } from "./Atmosphere";
import Link from "next/link";
import { Logo } from "./Logo";
import styles from "./screen.module.css";

export function Screen({
  children,
  atmosphere = true,
}: {
  children: ReactNode;
  /** `"pinned"` for a document: the same background, held to the window rather
   *  than to the page, because a page of running text is many screens tall and
   *  an atmosphere centred on it would sit halfway down the article. */
  atmosphere?: boolean | "pinned";
}) {
  return (
    <div className={styles.screen}>
      {atmosphere ? <Atmosphere pinned={atmosphere === "pinned"} /> : null}
      {children}
    </div>
  );
}

/** The mark, and at most one action beside it.
 *
 *  The mark goes home. It is the first thing anybody tries on a marketing site
 *  and the only navigation the privacy page has, so without it a reader who
 *  followed a link to /privacy has no way back to what the product is. */
export function ScreenHeader({ action }: { action?: ReactNode }) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.home} aria-label="offload, home">
        <Logo />
      </Link>
      {action ?? null}
    </header>
  );
}

export function ScreenFooter() {
  return (
    <footer className={styles.footer}>
      <a className={styles.footerLink} href="mailto:hello@offload.club">
        hello@offload.club
      </a>
      <span aria-hidden="true">·</span>
      <a className={styles.footerLink} href="/terms">
        Terms
      </a>
      <span aria-hidden="true">·</span>
      <a className={styles.footerLink} href="/privacy">
        Privacy
      </a>
    </footer>
  );
}

/** The centred column between the header and the footer. */
export function ScreenMain({ children }: { children: ReactNode }) {
  return <main className={styles.main}>{children}</main>;
}

export { styles as screenStyles };
