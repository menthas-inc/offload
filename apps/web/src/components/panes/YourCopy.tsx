"use client";

// 035. Your copy: everything the account can read, in one file.
//
// The web kit draws the block on this pane with one row, `Export everything`
// (`WSettings.jsx`); this is that block in the section format of 031, with the
// states the kit does not draw. What the row says in each is `copyRow`'s,
// shared with the phones.
//
// Read on open, when the window is come back to, and every five seconds only
// while a copy is being made. No state says why: a build that failed sits
// beside Try again, and a press that did not go through is the pane's toast
// with Retry. A session that ended under the page goes to sign in instead.

import { useCallback, useEffect, useState } from "react";
import { copyRow, COPY_POLL_MS, type CopyState } from "@offload/widgets";
import { Group, Row } from "./SettingsRows";
import { askForCopy, COPY_FILE, deleteCopy, fetchCopy, type CopyAnswer } from "../../lib/copy";
import styles from "../../app/(shell)/shell.module.css";

/** A row with the one spinner where its pill would be: being made, or a press
 *  in flight. The words are the status a screen reader hears. */
function Working({ title, note, last }: { title: string; note?: string | null; last?: boolean }) {
  return (
    <div className={`${styles.settingsRow} ${last ? styles.settingsRowLast : ""}`}>
      <span className={styles.settingsText} role="status">
        <span className={styles.settingsTitle}>{title}</span>
        {note ? <span className={styles.settingsNote}>{note}</span> : null}
      </span>
      <span className={styles.settingsSpinner} aria-hidden="true" />
    </div>
  );
}

export function YourCopy({
  zone,
  onFailed,
  onSignedOut,
}: {
  zone: string | null;
  /** A press that did not go through: the line, and the way to press again. */
  onFailed?: (line: string, retry: () => void) => void;
  /** The session ended under the page. */
  onSignedOut?: () => void;
}) {
  const [copy, setCopy] = useState<CopyState | null>(null);
  const [busy, setBusy] = useState<"ask" | "delete" | null>(null);

  /** Take an answer; true when it was a row. */
  const take = useCallback(
    (answer: CopyAnswer): boolean => {
      if (answer === "signed_out") {
        onSignedOut?.();
        return true;
      }
      if (answer) setCopy(answer);
      return answer !== null;
    },
    [onSignedOut],
  );

  useEffect(() => {
    let live = true;
    const read = () =>
      void fetchCopy().then((answer) => {
        if (live) take(answer);
      });
    read();
    // The download opens in another tab, and a copy can end while the pane
    // sits open: coming back reads the row again.
    window.addEventListener("focus", read);
    return () => {
      live = false;
      window.removeEventListener("focus", read);
    };
  }, [take]);

  const making = copy?.state === "making";
  useEffect(() => {
    if (!making) return;
    const timer = setInterval(() => void fetchCopy().then(take), COPY_POLL_MS);
    return () => clearInterval(timer);
  }, [making, take]);

  const ask = useCallback(async (): Promise<void> => {
    setBusy("ask");
    const went = take(await askForCopy());
    setBusy(null);
    if (!went) onFailed?.("Couldn't start your copy", () => void ask());
  }, [onFailed, take]);

  const remove = useCallback(async (): Promise<void> => {
    setBusy("delete");
    const went = take(await deleteCopy());
    setBusy(null);
    if (!went) onFailed?.("Couldn't delete your copy", () => void remove());
  }, [onFailed, take]);

  // Before the first read the row is the idle one, and stays pressable: a
  // read that never arrived is then a press that says so.
  const row = copyRow(copy ?? { state: "idle", readyAt: null, expiresAt: null, nextAt: null }, zone);

  return (
    <Group label="Your copy" icon="archive" caption="Kept for 7 days. One every 7 days.">
      {row.busy || busy === "ask" ? (
        <Working title={row.title} note={row.note} last />
      ) : row.canDelete ? (
        <>
          {/* Another origin, so a new tab: a copy that has gone answers there
              and the app stays where it is. The name is the server's. */}
          <Row title={row.title} note={row.note ?? undefined} href={COPY_FILE} external pill="Download" actionLabel="Download your copy" />
          {busy === "delete" ? (
            <Working title="Delete copy" last />
          ) : (
            <Row title="Delete copy" onClick={() => void remove()} strong last />
          )}
        </>
      ) : row.action ? (
        <Row title={row.title} note={row.note ?? undefined} pill={row.action} onClick={() => void ask()} last />
      ) : (
        <Row title={row.title} last />
      )}
    </Group>
  );
}
