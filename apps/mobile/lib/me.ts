// Who is signed in, asked of the server rather than remembered.
//
// The same answer web's `use-me.ts` reads, for the same reason: state moves
// `invited` to `active` by a write only the server makes, an account can be
// disabled between two launches, and a display name can change on another
// device. Nothing here is cached.

import { useEffect, useState } from "react";
import { request, send } from "./api";
import { onSignedOut } from "./auth";
import { failed } from "./log";

export interface Me {
  /** 022. Their own id, for the mark. */
  accountId: string;
  state: "invited" | "active";
  displayName: string | null;
  email: string;
  /** Two letters for the avatar, computed by the server so that this screen
   *  and a shared thread's faces cannot disagree about the same person. */
  initials: string;
  needsFirstRun: boolean;
  /** No name yet. See `stillAsking` in `api.ts`, which is the gate. */
  needsName: boolean;
  /** Active, and agreed to an older privacy policy or terms: asked again on
   *  first run's last screen, the ticks alone. */
  needsConsent: boolean;
  /** What Apple or Google called them, to fill the field in. */
  suggestedName: string | null;
  /** 016. Whether offload may search the web, and whether it may open a link
   *  they pasted. Two different promises, so two switches. */
  webSearch: boolean;
  webLinks: boolean;
  /** 030. The server's switch for the map, on every surface. */
  maps?: boolean;
  /** 019. Every calendar write is put to them first. */
  calendarAskFirst: boolean;
  /** Where they said they are, ISO 3166-1 alpha-2. Null until they say, and
   *  offload then tells the model it does not know rather than assuming. */
  country: string | null;
  /** 022. Connection requests waiting for their answer: the dot on the gear
   *  and on the My people row. */
  requestsWaiting: number;
  /** 023. The account's clock, or null until a device names one; every timed
   *  date is drawn in it. */
  timeZone: string | null;
  /** Whether the strip on Today may offer to switch when this phone is
   *  somewhere else. */
  followDevice: boolean;
  /** The one device zone they answered Keep to. */
  keptTimeZone: string | null;
  /** 024. The four switches, named as the sends are, and the two hours as
   *  HH:MM in the account's zone. */
  notifyDueToday: boolean;
  notifyDueTodayAt: string;
  notifyComingTomorrow: boolean;
  notifyComingTomorrowAt: string;
  notifyPeopleRequests: boolean;
  notifySharedActivity: boolean;
  /** 042. Reminders, and How many: one, two or three for each date. */
  notifyReminders: boolean;
  notifyReminderCount: 1 | 2 | 3;
  /** 2026-10-10. The morning names the day's calendar events. */
  notifyCalendar: boolean;
  /** The dot on the bell: Activity holds a row newer than its last opening. */
  activityNew: boolean;
  /** 026. Whether mail forwarded from the sign-in address can reach them:
   *  false for an Apple private relay address. */
  mailAvailable: boolean;
  /** 031. The providers this account signs in with, Apple first. */
  signInProviders: ("apple" | "google")[];
  /** The day's model budget is spent or its turns are used: the composer is
   *  closed until the rolling day moves on. */
  atDailyLimit: boolean;
  /** 027. Customize Today's layout, resolved by the server. */
  /** Customize Today's layout; `todayLayout` is the same without
   *  open_threads, for builds from before it. */
  todayLayoutV2?: import("./today").Layout;
  /** 042. The whole document, with Reminders; V2 is the same without it,
   *  for builds from before it. */
  todayLayoutV3?: import("./today").Layout;
}

/** Ask again, and tell every mounted `useMe`. For after a request is
 *  answered, so the dot goes on every screen that draws it. */
export async function refreshMe(): Promise<void> {
  const since = ends;
  try {
    const { data } = await send<Me>("/api/me");
    if (data) announce(data, since);
  } catch (error) {
    failed("me.refresh", error);
  }
}

/** Every mounted `useMe` hears a change to the identity.
 *
 *  The settings index and My account are two screens in one stack, each with
 *  its own `useMe`, so a name saved on the second would leave the first showing
 *  the old one and the old initials when it came back into view. A module-level
 *  set of listeners is the whole mechanism; there is no store to add. */
type Listener = (me: Me) => void;
const listeners = new Set<Listener>();

/** 023. The last identity heard, so a row can draw its date in the account's
 *  clock without every row asking the server. Filled by the first `useMe`
 *  or by `ensureMe`, and kept current by every write that broadcasts. */
let cached: Me | null = null;
let asking: Promise<void> | null = null;

/** Sessions ended since launch. A request reads it before it goes out, and
 *  an answer that comes back after an end is the last account's: kept by
 *  nothing, told to nobody. */
let ends = 0;

// The cache goes with the session, so the next person on this phone never
// draws a date in the last one's clock.
onSignedOut(() => {
  cached = null;
  asking = null;
  ends += 1;
});

function announce(me: Me, since: number): void {
  if (since !== ends) return;
  cached = me;
  for (const listener of listeners) listener(me);
}

export function currentMe(): Me | null {
  return cached;
}

/** Hear every change to the identity; returns the way to stop. */
export function onMe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ask once, for whoever needs the identity before a `useMe` has run. Every
 *  caller shares one request in flight. */
export function ensureMe(): Promise<void> {
  if (cached) return Promise.resolve();
  if (asking) return asking;
  const since = ends;
  const mine: Promise<void> = send<Me>("/api/me")
    .then(({ data }) => {
      if (data) announce(data, since);
    })
    .catch((error) => failed("me.ensure", error))
    .finally(() => {
      // A session's end lets go of it, and a later ask may be out by now.
      if (asking === mine) asking = null;
    });
  asking = mine;
  return mine;
}

/** Null while it is being asked, and null if the ask failed.
 *
 *  A settings screen whose identity block did not load still works: the rows
 *  below it need no server at all. So a failure here draws nothing rather than
 *  a guess or an apology. */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let live = true;
    const since = ends;
    void (async () => {
      try {
        const { data } = await send<Me>("/api/me");
        if (!data || since !== ends) return;
        cached = data;
        if (live) setMe(data);
      } catch (error) {
        failed("me.fetch", error);
      }
    })();
    const listener: Listener = (next) => {
      if (live) setMe(next);
    };
    listeners.add(listener);

    return () => {
      live = false;
      listeners.delete(listener);
    };
  }, []);

  return me;
}

/** The countries somebody can say they are in.
 *
 *  Fetched rather than shipped: the server validates against the same list it
 *  serves, so a code this offers is always one the patch accepts. */
export async function fetchCountries(): Promise<{ code: string; name: string }[]> {
  const { data } = await send<{ countries: { code: string; name: string }[] }>("/api/countries");
  return data?.countries ?? [];
}

/** One write to the account, handed to every mounted `useMe` once the
 *  server has it. Null on a refusal or a failure, logged under `where`. */
async function patchMe(where: string, body: object): Promise<Me | null> {
  const since = ends;
  try {
    const updated = await request<Me>("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!updated) return null;
    announce(updated, since);
    return updated;
  } catch (error) {
    failed(where, error);
    return null;
  }
}

/** Saying where you are. Null clears it, which is a real state: offload then
 *  tells the model it does not know rather than assuming. */
export async function setCountry(country: string | null): Promise<Me | null> {
  return patchMe("me.setCountry", { country });
}

/** Turning a switch. 016.
 *
 *  Patches one field, never the pair and never a name: a settings toggle
 *  sending a display name is a toggle that can clear one by accident. The
 *  server's own schema is the other half of that, where every field is optional
 *  and only what was sent is written.
 *
 *  Broadcast like `saveName`, so every mounted `useMe` has the new state
 *  without a refetch and the switch never disagrees with itself. */
export async function setWebAccess(
  patch: { webSearch?: boolean; webLinks?: boolean },
): Promise<Me | null> {
  return patchMe("me.setWebAccess", patch);
}

/** The account's clock. 023.
 *
 *  One field a call. Use writes `timeZone`, and the server clears
 *  `keptTimeZone` with it; Keep writes `keptTimeZone`; the switch on Date and
 *  time writes `followDevice`. No Undo, because each is one tap from its
 *  reverse. Null on a refusal or a failure, and the strip puts itself back. */
export async function setClock(patch: {
  timeZone?: string;
  followDevice?: boolean;
  keptTimeZone?: string | null;
}): Promise<Me | null> {
  return patchMe("me.setClock", patch);
}

/** The switches and the hours. 024. One field a call, as every setter here. */
export async function setNotify(patch: {
  notifyDueToday?: boolean;
  notifyDueTodayAt?: string;
  notifyComingTomorrow?: boolean;
  notifyComingTomorrowAt?: string;
  notifyPeopleRequests?: boolean;
  notifySharedActivity?: boolean;
  notifyReminders?: boolean;
  notifyReminderCount?: 1 | 2 | 3;
  notifyCalendar?: boolean;
}): Promise<Me | null> {
  return patchMe("me.setNotify", patch);
}

/** Setting your name. 011.
 *
 *  Returns the identity the server sent back rather than a boolean, and hands
 *  it to every mounted `useMe`: initials are computed there, in one place, and
 *  a client recomputing its own two letters is the drift 010 moved them
 *  server-side to stop.
 *
 *  Null on a refusal or a failure. The screen says what happened next to the
 *  control that retries it; it does not work out which one it was. */
export async function saveName(displayName: string): Promise<Me | null> {
  return patchMe("me.saveName", { displayName });
}

/** The two ticks again, for an active account whose consent is on an older
 *  version of the privacy policy or terms.
 *
 *  Done only when the identity the server sends back says so: a 200 whose
 *  update matched nothing still needs consent, and treating it as done sent
 *  the person straight back to the question with nothing said. That identity
 *  is handed to every mounted `useMe` either way, as a saved name is. */
export async function giveConsent(): Promise<boolean> {
  const since = ends;
  try {
    const updated = await request<Me>("/api/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ readPolicy: true, agreeToProcessing: true }),
    });
    if (!updated) return false;
    announce(updated, since);
    return !updated.needsConsent;
  } catch (error) {
    failed("me.giveConsent", error);
    return false;
  }
}
