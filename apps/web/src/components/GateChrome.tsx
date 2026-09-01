// The frame every pre-shell screen shares: wordmark top left, one card in the
// middle, the legal line bottom left. From ui_kits/web_app/WFirstRunGate.jsx.

import type { ReactNode } from "react";
import { Logo } from "./Logo";
import styles from "../app/(app)/auth.module.css";

export function GateChrome({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <Logo size={22} />
      <div className={styles.middle}>{children}</div>
      <p className={`${styles.caption} ${styles.captionLeft}`}>Terms · Privacy</p>
    </main>
  );
}

export function GateCard({ children }: { children: ReactNode }) {
  return <div className={styles.card}>{children}</div>;
}

/** The provider glyphs. Apple's is one path in currentColor so it inverts on
 *  the dark button; Google's is its four fixed brand colours, which is the one
 *  place in this product a colour is not a token because it is not ours. */
export function AppleMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "block" }}>
      <path d="M16.37 1.43c0 1.14-.42 2.2-1.25 3.02-.9.9-2.02 1.42-3.02 1.33-.06-1.08.44-2.2 1.26-3.03.86-.87 2.1-1.4 3.01-1.32zM20.9 8.6c-1.7-.1-3.1.96-3.9.96-.83 0-2.05-.92-3.38-.9-1.74.03-3.35 1.01-4.24 2.57-1.82 3.15-.47 7.82 1.3 10.38.86 1.25 1.9 2.65 3.25 2.6 1.3-.05 1.8-.84 3.37-.84 1.57 0 2.02.84 3.38.82 1.4-.03 2.29-1.27 3.15-2.53.98-1.45 1.38-2.85 1.4-2.92-.03-.01-2.7-1.04-2.72-4.12-.03-2.58 2.1-3.82 2.2-3.88-1.2-1.77-3.07-1.97-3.71-2.01z" />
    </svg>
  );
}

export function GoogleMark({ size = 17 }: { size?: number }) {
  return (
    /* eslint-disable no-restricted-syntax -- Google's four brand colours are
       mandated by their branding requirements for the sign-in button and are
       not ours to substitute. The adherence rule is correct to stop every other
       literal; this is the exception, logged in the design system's decisions. */
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ display: "block" }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
    /* eslint-enable no-restricted-syntax */
  );
}
