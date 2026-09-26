// The clock every screen draws dates in. 023.
//
// The account has one zone, set at first run and changed only by the person,
// and every timed date is drawn in it rather than in whatever zone the phone
// is in now; the strip on Today is the one thing that says when the two
// differ. A bare day is a date and needs no clock at all. An account with no
// zone yet reads in the device's, which is what every screen did before.

import { useEffect, useState } from "react";
import { dayIn } from "@offload/widgets";
import { currentMe, ensureMe, onMe } from "./me";

/** What the runtime says this phone's zone is, or null when it will not say.
 *  Hermes answers on both platforms; the guard is for the day it does not. */
export function deviceZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** The account's clock, else the device's word. */
export function zoneFor(account: string | null | undefined, device: string | null): string | null {
  return account ?? device;
}

/** The zone to draw in and the day it is there, computed on render so the
 *  first render after midnight moves today and nothing polls for it. */
export function useClock(): { zone: string | null; today: string } {
  const [account, setAccount] = useState<string | null>(currentMe()?.timeZone ?? null);
  useEffect(() => {
    void ensureMe();
    return onMe((me) => setAccount(me.timeZone));
  }, []);
  const zone = zoneFor(account, deviceZone());
  return { zone, today: dayIn(new Date(), zone) };
}
