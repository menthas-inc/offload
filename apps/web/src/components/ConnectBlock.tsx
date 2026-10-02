"use client";

// Bring in your calendar: the one connect screen, entered two ways.
//
// First run's last screen and the Settings calendar page before anything is
// connected draw the same thing, verbatim, and this is where the copy lives so
// the two cannot drift. The phones repeat the strings from `lib/gate.ts`; the
// three have to match. All of it is provisional per the design system.
//
// **The provider's mark is never redrawn.** A third party's radius, colours and
// letterforms are their specification, and ninety percent right is what people
// spot instantly on a logo they see every day. Referenced by path so dropping
// Google's own file into `public/brands/` is the whole of turning it on; until
// then a dashed stand-in makes the missing asset visible rather than silent.

import { useState } from "react";
import { Icon } from "./Icon";
import run from "../app/(app)/auth.module.css";

export const CONNECT_TITLE = "Bring in your calendar";
export const CONNECT_SUB = "So “before the trip” and “after the dentist” mean something.";
export const CONNECT_BUTTON = "Connect Google Calendar";
/** 019. The one sentence Settings adds under the button: connecting is not
 *  consenting to all of them, and this is the only place that can say so
 *  before Google's consent screen. */
export const CONNECT_AFTER = "You choose which calendars after this.";

export const CONNECT_FACTS = [
  ["calendar", "offload reads your days.", "Times, titles and who is on them."],
  [
    "plus",
    "And it can add to them.",
    "Anything you dump with a time on it can land back on your calendar.",
  ],
] as const;

/** 88 on first run's screen, 42 on 031's Connected apps card, 34 beside an
 *  account on the calendar page. */
export function ProviderMark({ size = 88 }: { size?: 88 | 42 | 34 }) {
  const [ok, setOk] = useState(true);
  const small = size === 88 ? undefined : { width: size, height: size };
  if (!ok) {
    return (
      <span
        className={run.providerMark}
        style={small ? { ...small, borderRadius: size === 42 ? 11 : 8 } : undefined}
        aria-hidden="true"
      />
    );
  }
  return (
    <img
      src="/brands/google-calendar.svg"
      alt=""
      width={size}
      height={size}
      className={run.providerMarkImage}
      style={small}
      onError={() => setOk(false)}
    />
  );
}

/** The two facts, as sentences rather than switches, per the 5 September
 *  privacy refusal: a switch implies somebody could have set it the other way. */
export function ConnectFacts() {
  return (
    <div className={run.consent}>
      {CONNECT_FACTS.map(([icon, head, rest]) => (
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

/** The whole screen as a block, for Settings. First run composes the same
 *  pieces inside its own frame. */
export function ConnectBlock({ href }: { href: string }) {
  return (
    <div className={run.connectBlock}>
      <ProviderMark />
      <div className={run.runCopy}>
        <h2 className={run.runTitle}>{CONNECT_TITLE}</h2>
        <p className={run.runSub}>{CONNECT_SUB}</p>
      </div>
      <ConnectFacts />
      <div className={run.runFoot}>
        <a className={run.runButton} href={href}>
          {CONNECT_BUTTON}
        </a>
        <p className={run.connectAfter}>{CONNECT_AFTER}</p>
      </div>
    </div>
  );
}
