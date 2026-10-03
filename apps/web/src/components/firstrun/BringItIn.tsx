"use client";

// 033. Bring it all in on the web: Mail and Calendar as optional cards.
//
// Its own page, `/welcome/bring`, because connecting a calendar is a full
// navigation to Google and back: a step held in state would be gone when it
// returns. The account is active by now, so the page reads it as the shell
// does. Notifications are a phone's, so there is no third card here.
//
// *Connected* is what the calendars read says, never what the URL says.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "../Logo";
import { Icon } from "../Icon";
import { ProviderMark } from "../ConnectBlock";
import { MAIL_ADDRESS, MAIL_CARD_PATH } from "../MailBlock";
import { Unanswered } from "../Unanswered";
import { bringCards } from "../../lib/first-run";
import { connectUrl, useCalendars } from "../../lib/use-calendars";
import { useMe } from "../../lib/use-me";
import { BRING } from "./copy";
import { RunFooter } from "./RunFooter";
import styles from "./firstrun.module.css";

export function BringItIn() {
  const state = useMe("shell");
  const calendars = useCalendars();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const me = state.status === "ready" ? state.me : null;
  // Calendar stays drawn once it is connected here, with its pill. First run
  // only sends somebody here with nothing connected yet.
  const cards = me
    ? bringCards({ mailAvailable: me.mailAvailable, calendarOffer: calendars.available, notifications: "unsupported" })
    : [];
  const today = () => router.replace("/today");
  // Nothing to offer, which a page reached by URL can find: Today, rather
  // than a title over nothing.
  const empty = me !== null && calendars.settled && cards.length === 0;
  useEffect(() => {
    if (empty) router.replace("/today");
  }, [empty, router]);

  // Drawn once the calendars have answered, so returning from Google does
  // not paint Mail alone and then push the calendar in under it.
  if (state.status === "loading" || (me && (!calendars.settled || empty))) return <main className={styles.page} />;
  if (state.status === "unreachable") return <Unanswered retry={state.retry} attempt={state.attempt} retryAfter={state.retryAfter} />;

  const connected = calendars.connections.length > 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(MAIL_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A browser that refuses the clipboard leaves the address on screen.
    }
  }

  const line = BRING.mail.line(state.me.email);
  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <Logo size={24} />
      </div>
      <div className={`${styles.column} ${styles.columnWide}`}>
        <div className={styles.body}>
          <h1 className={styles.title}>{BRING.title}</h1>
          <p className={styles.lead}>{BRING.lead}</p>

          <div className={styles.offers}>
            {cards.includes("mail") ? (
              <div className={styles.offer}>
                <div className={styles.offerHead}>
                  <span className={`${styles.mark} ${styles.markMail}`} aria-hidden="true">
                    <Icon name="mail" size={21} />
                  </span>
                  <span className={styles.offerText}>
                    <span className={styles.offerTitle}>{BRING.mail.title}</span>
                    <span className={styles.offerLine}>
                      {line[0]}
                      <span className={styles.address}>{line[1]}</span>
                      {line[2]}
                    </span>
                  </span>
                </div>
                <div className={styles.offerButtons}>
                  <button type="button" className={styles.offerButton} onClick={() => void copy()}>
                    <Icon name="copy" size={15} />
                    {BRING.mail.copy}
                  </button>
                  <a className={styles.offerButton} href={MAIL_CARD_PATH} download="offload.vcf">
                    {BRING.mail.contacts}
                  </a>
                </div>
                <span role="status" className={styles.offerLine}>
                  {copied ? BRING.mail.copied : null}
                </span>
              </div>
            ) : null}

            {cards.includes("calendar") ? (
              <div className={styles.offer}>
                <div className={styles.offerHead}>
                  <ProviderMark size={44} />
                  <span className={styles.offerText}>
                    <span className={styles.offerTitle}>{BRING.calendar.title}</span>
                    <span className={styles.offerLine}>{BRING.calendar.line}</span>
                  </span>
                </div>
                <div className={styles.offerButtons}>
                  {connected ? (
                    <span className={styles.connected}>{BRING.calendar.connected}</span>
                  ) : (
                    <a className={`${styles.offerButton} ${styles.offerButtonMain}`} href={connectUrl("first-run-bring")}>
                      {BRING.calendar.connect}
                    </a>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <RunFooter skip={{ label: BRING.skip, onPress: today }} main={{ label: BRING.done, onPress: today }} />
      </div>
    </main>
  );
}
