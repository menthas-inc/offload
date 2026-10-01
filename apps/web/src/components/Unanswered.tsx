"use client";

// What a screen behind the gate shows when the account could not be asked
// for: not signed out, so not the gate, and not blank. 027 split the one line
// into the readme's two states, alone in the page's centre:
//
// - **No network**: offload picks up when the browser says it is back, on the
//   `online` event, and asks nothing before then.
// - **A network and no answer**: it asks again on its own on the shared
//   schedule, about 2, 4 and 8 seconds and then about every 15, never sooner
//   than a Retry-After the server sent, and not at all while the tab is
//   hidden. "Trying again." and nothing about why: a page cannot tell an outage
//   from a captive portal, and offload does not diagnose itself.
//
// Never the danger colour. It is not the person's mistake.

import { useEffect, useState } from "react";
import { retryDelay } from "@offload/widgets";
import styles from "./unanswered.module.css";

const isOffline = (): boolean => typeof navigator !== "undefined" && navigator.onLine === false;

export function Unanswered({
  retry,
  attempt = 0,
  retryAfter = null,
}: {
  retry: () => void;
  /** How many times the shell has asked already, so the wait grows. */
  attempt?: number;
  /** Seconds, from the server's Retry-After, when it sent one. */
  retryAfter?: number | null;
}) {
  const [offline, setOffline] = useState(isOffline);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);

  useEffect(() => {
    const down = () => setOffline(true);
    const up = () => {
      setOffline(false);
      retry();
    };
    const seen = () => setHidden(document.hidden);
    window.addEventListener("offline", down);
    window.addEventListener("online", up);
    document.addEventListener("visibilitychange", seen);
    return () => {
      window.removeEventListener("offline", down);
      window.removeEventListener("online", up);
      document.removeEventListener("visibilitychange", seen);
    };
  }, [retry]);

  // Not answering: one timer at a time, started again whenever the tab is
  // shown, since a hidden tab asks nothing.
  useEffect(() => {
    if (offline || hidden) return;
    const wait = Math.max(retryDelay(attempt), (retryAfter ?? 0) * 1000);
    const timer = setTimeout(retry, wait);
    return () => clearTimeout(timer);
  }, [offline, hidden, attempt, retryAfter, retry]);

  return (
    <main className={styles.held}>
      <div className={styles.block} role="status">
        <p className={styles.title}>{offline ? "You're offline" : "offload isn't answering"}</p>
        <p className={styles.line}>{offline ? "offload picks up when you're back." : "Trying again."}</p>
        <button type="button" className={styles.retry} onClick={retry}>
          <span className={styles.retryPill}>Try again</span>
        </button>
      </div>
    </main>
  );
}
