// The frame both pre-account screens share: the atmosphere, the mark top left,
// one thing in the middle, Privacy bottom right.
//
// It exists so the landing page and the gate cannot drift apart. Every element
// outside the middle is rendered by this file for both of them, so "the logo
// stays in the same spot" is a fact about the markup rather than two numbers
// that have to be kept equal by hand.

import type { ReactNode } from "react";
import { Atmosphere } from "./Atmosphere";
import { Logo } from "./Logo";
import styles from "./screen.module.css";

export function Screen({
  children,
  atmosphere = true,
}: {
  children: ReactNode;
  /** Off for a document. The atmosphere is centred on the mark and drifts, so
   *  behind a page of running text it is both unreadable and a rAF nobody is
   *  looking at. The frame around it stays identical either way. */
  atmosphere?: boolean;
}) {
  return (
    <div className={styles.screen}>
      {atmosphere ? <Atmosphere /> : null}
      {children}
    </div>
  );
}

/** The mark, and at most one action beside it. */
export function ScreenHeader({ action }: { action?: ReactNode }) {
  return (
    <header className={styles.header}>
      <Logo />
      {action ?? null}
    </header>
  );
}

export function ScreenFooter() {
  return (
    <footer className={styles.footer}>
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
