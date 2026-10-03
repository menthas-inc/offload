"use client";

// 026. Where the address lives on the web: forwarding an email to offload.
//
// **No switch.** Forwarding has nothing to turn on: the address works for
// anybody whose mail comes from the address they signed in with, and the line
// under it says which one that is, because a work address is the failure
// people will actually have.
//
// 031: a card in Connected apps beside the calendar's, always shown, with the
// address, Copy and Add to contacts on it. The phones keep a Mail page for How
// it works; on the web the card's note says the two things that page did.

import { Icon } from "./Icon";
import { Row, StatusPill } from "./panes/SettingsRows";
import styles from "../app/(shell)/shell.module.css";

export const MAIL_ADDRESS = "over@to.offload.club";
/** A static card on our own site; the browser hands it to the system's contacts. */
export const MAIL_CARD_PATH = "/offload.vcf";
/** Why an Apple hidden email cannot use it. A fact, not a diagnosis. */
export const MAIL_RELAY_NOTE =
  "You signed in with an address Apple keeps private, so mail you forward can't be matched to you.";

export function MailCard({
  email,
  mailAvailable,
  onCopied,
}: {
  email: string;
  mailAvailable: boolean;
  onCopied: () => void;
}) {
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(MAIL_ADDRESS);
      onCopied();
    } catch {
      // A browser that refuses the clipboard leaves the address on screen to
      // select, which is the same outcome with one more step.
    }
  }

  return (
    <div className={styles.appCard}>
      <div className={styles.appHead}>
        <span className={styles.appMark} data-tone="mail" aria-hidden="true">
          <Icon name="mail" size={21} />
        </span>
        <span className={styles.appText}>
          <span className={styles.appName}>Mail</span>
          <span className={styles.appLine}>
            {mailAvailable ? "Forward an email and it's filed like anything you dump" : MAIL_RELAY_NOTE}
          </span>
        </span>
        <StatusPill tone="neutral">{mailAvailable ? "Ready" : "Unavailable"}</StatusPill>
      </div>
      {mailAvailable ? (
        <div className={styles.appRows}>
          <Row
            title={MAIL_ADDRESS}
            tabular
            note={`Only mail from ${email} is accepted. Forward by hand.`}
            pill="Copy"
            pillIcon="copy"
            actionLabel="Copy the address"
            onClick={() => void copy()}
          />
          {/* Downloaded: the browser hands it to the system's contacts, and
              nothing asks for a permission. */}
          <Row title="Add to contacts" href={MAIL_CARD_PATH} download="offload.vcf" last />
        </div>
      ) : null}
    </div>
  );
}
