"use client";

// 033. Before you start on the web: the name and the two consents on one
// screen, with one button that neither can be skipped past. On the plain
// page. The name-only path is this screen with the name alone.

import { Logo } from "../Logo";
import { Icon } from "../Icon";
import { NAME_MAX } from "../../lib/name";
import { BEFORE, CONSENT, FAILED } from "./copy";
import { RunFooter } from "./RunFooter";
import styles from "./firstrun.module.css";

/** The tick, drawn along its own length, from the design system's Checkbox. */
function Tick() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-inverse)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function BeforeYouStart({
  nameOnly,
  name,
  onName,
  readPolicy,
  agreeToProcessing,
  onReadPolicy,
  onAgreeToProcessing,
  working,
  failed,
  onContinue,
}: {
  nameOnly: boolean;
  name: string;
  onName: (next: string) => void;
  readPolicy: boolean;
  agreeToProcessing: boolean;
  onReadPolicy: (next: boolean) => void;
  onAgreeToProcessing: (next: boolean) => void;
  working: boolean;
  failed: boolean;
  onContinue: () => void;
}) {
  const ready = name.trim().length > 0 && (nameOnly || (readPolicy && agreeToProcessing));

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <Logo size={24} />
      </div>
      <div className={styles.column}>
        <div className={styles.body}>
          <h1 className={styles.title}>{nameOnly ? BEFORE.name : BEFORE.title}</h1>

          <div className={styles.block}>
            {nameOnly ? null : <h2 className={styles.head}>{BEFORE.name}</h2>}
            <input
              className={styles.field}
              type="text"
              value={name}
              autoFocus={nameOnly}
              autoComplete="name"
              maxLength={NAME_MAX}
              placeholder="Your name"
              aria-label="Your name"
              onChange={(event) => onName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && nameOnly && ready) onContinue();
              }}
            />
            <p className={styles.hint}>{BEFORE.nameSub}</p>
          </div>

          {nameOnly ? null : (
            <div className={styles.block}>
              <h2 className={styles.head}>{BEFORE.agree}</h2>
              <label className={styles.tick}>
                <input
                  type="checkbox"
                  className={styles.tickInput}
                  checked={readPolicy}
                  onChange={(event) => onReadPolicy(event.target.checked)}
                />
                <span className={styles.tickBox}>{readPolicy ? <Tick /> : null}</span>
                <span>
                  {CONSENT.policyBefore}
                  <a className={styles.tickLink} href="/privacy" target="_blank" rel="noreferrer">
                    {CONSENT.policyLink}
                  </a>
                  {CONSENT.policyAfter}
                </span>
              </label>
              <label className={styles.tick}>
                <input
                  type="checkbox"
                  className={styles.tickInput}
                  checked={agreeToProcessing}
                  onChange={(event) => onAgreeToProcessing(event.target.checked)}
                />
                <span className={styles.tickBox}>{agreeToProcessing ? <Tick /> : null}</span>
                <span>{CONSENT.processing}</span>
              </label>
              <p className={styles.notice}>
                <span>
                  <Icon name="lock" size={16} />
                </span>
                <span>{CONSENT.note}</span>
              </p>
            </div>
          )}
        </div>

        {failed ? (
          <p className={styles.refusal} role="alert">
            {FAILED}
          </p>
        ) : null}
        <RunFooter main={{ label: BEFORE.next, onPress: onContinue, disabled: !ready || working }} />
      </div>
    </main>
  );
}
