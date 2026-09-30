// What a screen behind the gate shows when the account could not be asked
// for: not signed out, so not the gate, and not blank, so not a frame that
// never changes. One clause and the way forward, as a failure is everywhere
// else here. It says nothing about why, because the page cannot see why.

import styles from "./unanswered.module.css";

export function Unanswered({ retry }: { retry: () => void }) {
  return (
    <main className={styles.held}>
      <p className={styles.line} role="alert">
        That didn&rsquo;t go through.{" "}
        <button type="button" className={styles.retry} onClick={retry}>
          Try again
        </button>
      </p>
    </main>
  );
}
