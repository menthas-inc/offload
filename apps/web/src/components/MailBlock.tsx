"use client";

// 026. Where the address lives on the web: forwarding an email to offload.
//
// **Inline in Connected apps, as the calendar is**, rather than a third pane:
// Connected apps is already the second pane, and 019 put the calendar's page
// where its row was for that reason. The phones open a page one level down.
//
// **No switch.** Forwarding has nothing to turn on: the address works for
// anybody whose mail comes from the address they signed in with, and the lines
// under it say which one that is, because a work address is the failure people
// will actually have.

import { Icon } from "./Icon";
import { Group, Row } from "./panes/SettingsRows";
import styles from "../app/(shell)/shell.module.css";
import run from "../app/(app)/auth.module.css";

export const MAIL_ADDRESS = "over@to.offload.club";
/** A static card on our own site; the browser hands it to the system's contacts. */
export const MAIL_CARD_PATH = "/offload.vcf";

/** First run offers Mail once: in a first run, to an address mail can come
 *  from. Never on the name-only path somebody who finished first run takes. */
export function mailOffered(me: { mailAvailable: boolean; needsFirstRun: boolean }): boolean {
  return me.mailAvailable && me.needsFirstRun;
}

export function MailBlock({
  email,
  mailAvailable,
  onCopied,
}: {
  email: string;
  mailAvailable: boolean;
  onCopied: () => void;
}) {
  if (!mailAvailable) {
    return (
      <Group label="Mail">
        <Row
          title="Mail"
          note="You signed in with an address Apple keeps private, so mail you forward can't be matched to you."
          value="Unavailable"
          last
        />
      </Group>
    );
  }

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
    <>
      <Group label="Mail">
        <div className={styles.settingsRow}>
          <span className={styles.settingsText}>
            <span className={styles.settingsTitle}>{MAIL_ADDRESS}</span>
          </span>
          <span className={styles.settingsValue}>
            <button
              type="button"
              className={`${styles.sectionAction} ${styles.mailCopy}`}
              aria-label="Copy the address"
              onClick={() => void copy()}
            >
              Copy
            </button>
          </span>
        </div>
        {/* A static card on our own site, downloaded: the browser hands it to
            the system's contacts, and nothing asks for a permission. */}
        <a href={MAIL_CARD_PATH} download="offload.vcf" className={`${styles.settingsRow} ${styles.settingsRowLast}`}>
          <span className={styles.settingsText}>
            <span className={styles.settingsTitle}>Add to contacts</span>
          </span>
          <span className={styles.settingsChevron} aria-hidden="true">
            <Icon name="chevron-right" size={15} />
          </span>
        </a>
      </Group>
      <Group label="How it works">
        <Row
          title={`From ${email}`}
          note={`Forward an email from ${email} and it's filed like anything else you dump. Mail from any other address isn't accepted.`}
        />
        <Row title="Forward by hand" note="Automatic forwarding rules don't work yet." last />
      </Group>
    </>
  );
}

export const MAIL_OFFER_TITLE = "Forward what matters";

/** First run's Mail step: the calendar step's two facts, the page drawing the
 *  mark and the title around them and the button in its own footer, where
 *  the calendar step's Connect sits. */
export function MailOffer({ email }: { email: string }) {
  const facts = [
    ["mail", "Send it an email.", `Forward anything to ${MAIL_ADDRESS} and it's filed.`],
    ["lock", "Only from your address.", `Mail from ${email} is the only mail it accepts.`],
  ] as const;
  return (
    <div className={run.consent}>
        {facts.map(([icon, head, rest]) => (
          <p key={head} className={run.runFact}>
            <Icon name={icon} size={16} />
            <span>
              <b>{head}</b> {rest}
            </span>
          </p>
        ))}
    </div>
  );
}

/** Adding the contact moves on, as Not now does; nothing here can fail in a
 *  way worth a line. */
export function MailOfferButton({ onDone }: { onDone: () => void }) {
  return (
    <a className={run.runButton} href={MAIL_CARD_PATH} download="offload.vcf" onClick={onDone}>
      Add to contacts
    </a>
  );
}
