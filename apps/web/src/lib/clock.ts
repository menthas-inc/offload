"use client";

// The clock every pane draws dates in. 023.
//
// The account has one zone, set at first run and changed only by the person,
// and every timed date is drawn in it rather than in the browser's; the strip
// on Today is the one thing that says when the two differ. A bare day is a
// date and needs no clock. An account with no zone yet reads in the
// browser's, which is what every pane did before.

import { useEffect, useState } from "react";
import { dayIn } from "@offload/widgets";
import { currentMe, onMe } from "./use-me";

export function deviceZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** The account's clock, else the browser's word. */
export function zoneFor(account: string | null | undefined, device: string | null): string | null {
  return account ?? device;
}

/** The zone to draw in and the day it is there, computed on render so the
 *  first render after midnight moves today and nothing polls for it. */
export function useClock(): { zone: string | null; today: string } {
  const [account, setAccount] = useState<string | null>(currentMe()?.timeZone ?? null);
  useEffect(() => onMe((me) => setAccount(me.timeZone)), []);
  const zone = zoneFor(account, deviceZone());
  return { zone, today: dayIn(new Date(), zone) };
}
