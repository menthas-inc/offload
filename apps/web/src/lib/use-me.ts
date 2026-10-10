"use client";

// The shell's first question on every screen behind the gate: who is this, and
// have they finished first run?
//
// The answer comes from the server every time rather than from anything the
// client stored. State moves invited -> active by a write only the server
// makes, and an account can be disabled between two page loads.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TodayLayout } from "./today";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export interface Me {
  /** 022. Their own id, for the mark. */
  accountId: string;
  state: "invited" | "active";
  displayName: string | null;
  email: string;
  /** Two letters for the avatar, from the server's one rule rather than a
   *  split done here. Three clients splitting a name is three chances to
   *  disagree about "Ana de Sousa". */
  initials: string;
  needsFirstRun: boolean;
  /** No name yet. Asked for before the app is any use, on the same screen first
   *  run uses, because a name is not something Settings should have to be found
   *  for. */
  needsName: boolean;
  /** Active, and agreed to an older privacy policy or terms: the two ticks
   *  are asked again, alone, before the shell. */
  needsConsent: boolean;
  /** 016. Whether offload may search the web, and whether it may open a link
   *  they pasted. Two different promises, so two switches. */
  webSearch: boolean;
  webLinks: boolean;
  /** 030. Whether the map is on, on every surface: the server's switch. */
  maps?: boolean;
  /** The web's map, which the owner can turn off on its own; the phones do not read it. */
  webMaps?: boolean;
  /** Where they said they are, ISO 3166-1 alpha-2. Null until they say, and
   *  offload then tells the model it does not know rather than assuming. */
  country: string | null;
  /** 023. The account's clock, or null until a device names one. */
  timeZone: string | null;
  followDevice: boolean;
  keptTimeZone: string | null;
  /** 024. The four switches, named as the sends are, the two hours as HH:MM
   *  in the account's zone, and the dot on Activity. */
  notifyDueToday: boolean;
  notifyDueTodayAt: string;
  notifyComingTomorrow: boolean;
  notifyComingTomorrowAt: string;
  notifyPeopleRequests: boolean;
  notifySharedActivity: boolean;
  /** 042. Reminders before the dates that need one, and how many for each
   *  date: Low, Medium or High. */
  notifyReminders: boolean;
  notifyReminderCount: 1 | 2 | 3;
  activityNew: boolean;
  /** 026. Whether mail forwarded from the sign-in address can reach them:
   *  false for an Apple private relay address. */
  mailAvailable: boolean;
  /** 031. The providers this account signs in with, in a fixed order, for
   *  Email's note on My account. */
  signInProviders: ("apple" | "google")[];
  /** The day's model budget is spent or its turns are used: the composer is
   *  closed until the rolling day moves on. */
  atDailyLimit: boolean;
  /** What Apple or Google called them, to fill the field in. Only ever sent to
   *  the account it belongs to, and null when the provider sent nothing. */
  suggestedName: string | null;
  /** 022. Connection requests waiting for their answer: the dot on the
   *  sidebar's Settings and on the My people row. */
  requestsWaiting: number;
  /** 027. Customize Today's layout, resolved by the server against the
   *  defaults, so a kind added later is already in it. `todayLayout` is the
   *  same without open_threads, for phone builds from before it. */
  todayLayoutV2?: TodayLayout;
  /** 042. The whole document, Reminders included. V2 is the same without
   *  it, for builds from before it. Read through `layoutOfMe`. */
  todayLayoutV3?: TodayLayout;
}

/** 022. Ask again and tell every mounted `useMe`, for after a request is
 *  answered, so the dot goes everywhere it is drawn. */
export async function refreshMe(): Promise<void> {
  try {
    const response = await fetch(`${API}/api/me`, { credentials: "include" });
    if (!response.ok) return;
    const me = (await response.json()) as Me;
    cached = me;
    window.dispatchEvent(new CustomEvent<Me>(CHANGED, { detail: me }));
  } catch {
    // Nothing to say: the dot is a hint and the next open reads it again.
  }
}

/** Whether this account still has something to answer before the shell.
 *
 *  Three questions, one gate. They came apart because every account that
 *  existed when 011 shipped had finished first run and had no name, so
 *  "finished first run" stopped being the same as "ready", and an account can
 *  finish it and then see the policy or the terms move. */
export function stillAsking(me: Me): boolean {
  return me.needsFirstRun || me.needsName || me.needsConsent;
}

/** Where somebody asked again may go without agreeing. The terms say whoever
 *  does not agree can take a copy and delete their account: delete is on My
 *  account, and the copy is on Privacy, which its "Make a copy first" opens. */
export const WAY_OUT_PATHS: readonly string[] = ["/settings/account", "/settings/privacy"];

/** Whether the shell holds this account back from where the browser is now.
 *  Read from the address rather than a hook: the shell layout re-renders on
 *  every navigation, and Next has written the address by the time effects run. */
function heldBack(me: Me): boolean {
  if (!stillAsking(me)) return false;
  const through = !me.needsFirstRun && me.needsConsent && WAY_OUT_PATHS.includes(window.location.pathname);
  return !through;
}

/** The two ticks again, for an active account whose consent is on an older
 *  version. Done only when the identity the server sends back says so: a 200
 *  whose update matched nothing still needs consent, and treating it as done
 *  sent the person straight back here with nothing said. That identity is
 *  announced either way, as a saved name is. */
export async function giveConsent(): Promise<boolean> {
  try {
    const response = await fetch(`${API}/api/consent`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ readPolicy: true, agreeToProcessing: true }),
    });
    if (!response.ok) return false;
    const me = (await response.json()) as Me;
    cached = me;
    window.dispatchEvent(new CustomEvent<Me>(CHANGED, { detail: me }));
    return !me.needsConsent;
  } catch {
    return false;
  }
}

export type MeState =
  | { status: "loading" }
  | { status: "ready"; me: Me }
  /** No answer came: not signed out, and the screen offers to ask again. */
  | {
      status: "unreachable";
      retry: () => void;
      /** 027. How many times it has asked again, so the next wait grows. */
      attempt: number;
      /** 027. Seconds from the server's Retry-After, when it sent one the
       *  browser lets the page read. */
      retryAfter: number | null;
    };

/** A Retry-After in seconds. The date form is read too, since either is
 *  allowed, and anything else is no answer. */
function retryAfterOf(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/** Every mounted `useMe` hears a change to the identity.
 *
 *  The settings index and My account are two panes side by side, each with its
 *  own `useMe` and its own fetch, so a name saved in one would leave the other
 *  showing the old one and the old initials until something remounted it. Same
 *  mechanism `appearance.ts` uses for the theme, and for the same reason. */
const CHANGED = "offload:me-changed";

/** 023. The last identity heard, so a row can draw its date in the account's
 *  clock without asking the server. Filled by `useMe` and by every change. */
let cached: Me | null = null;

export function currentMe(): Me | null {
  return cached;
}

/** The cache goes with the session, so the next person in this browser never
 *  draws a date in the last one's clock. Called by sign-out once the server
 *  has ended the session. 023, from the security review of 2026-09-22. */
export function forgetMe(): void {
  cached = null;
}

/** Hear every change to the identity; returns the way to stop. */
export function onMe(listener: (me: Me) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<Me>).detail);
  window.addEventListener(CHANGED, handler);
  if (cached) listener(cached);
  return () => window.removeEventListener(CHANGED, handler);
}

/** Reads the current account, sending anyone without a session to the gate.
 *  `expect` says which side of first run this screen is for; landing on the
 *  wrong side is a redirect, not an error.
 *
 *  Only a 401 is signed out. On 2026-09-30 Railway's edge answered a 404 for
 *  nine minutes with every service healthy, and when any response that was
 *  not ok meant the gate, a good session was sent there. Anything else, or a
 *  fetch that throws, is `unreachable`: held, with the way to ask again. */
export function useMe(expect: "first-run" | "shell"): MeState {
  const router = useRouter();
  const [state, setState] = useState<MeState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const retry = () => {
      setState({ status: "loading" });
      setAttempt((n) => n + 1);
    };

    fetch(`${API}/api/me`, { credentials: "include" })
      .then(async (response) => {
        if (!live) return;
        if (response.status === 401) {
          // The session ended somewhere else: a staff disable, a deletion
          // mark, a sign out on another device. The cache goes with it, as it
          // does on a sign out from here.
          forgetMe();
          router.replace("/sign-in");
          return;
        }
        if (!response.ok) {
          setState({ status: "unreachable", retry, attempt, retryAfter: retryAfterOf(response) });
          return;
        }
        const me = (await response.json()) as Me;
        cached = me;
        if (!live) return;
        if (expect === "shell" && heldBack(me)) router.replace("/welcome");
        else if (expect === "first-run" && !stillAsking(me)) router.replace("/today");
        else setState({ status: "ready", me });
      })
      .catch(() => {
        // No network, a cross-origin answer without CORS headers, or a body
        // that is not the account. None of them is signed out.
        if (live) setState({ status: "unreachable", retry, attempt, retryAfter: null });
      });

    // A saved name lands here without a refetch: the PATCH already returned
    // the whole identity, initials included.
    const onChanged = (event: Event) => {
      const me = (event as CustomEvent<Me>).detail;
      if (!live || !me) return;
      // The same guard the fetch above applies. It does fire on the first-run
      // side: the welcome screen's name-only mode calls `updateName` from this
      // very hook. What makes that harmless is this early return plus the
      // `replace("/today")` that follows, not the event being impossible.
      if (expect === "shell" ? heldBack(me) : !stillAsking(me)) return;
      setState({ status: "ready", me });
    };
    window.addEventListener(CHANGED, onChanged);

    return () => {
      live = false;
      window.removeEventListener(CHANGED, onChanged);
    };
  }, [expect, router, attempt]);

  // Let through to the way out and then gone anywhere else: back to the
  // question. Every render, because a navigation inside the shell re-renders
  // it without fetching again.
  useEffect(() => {
    if (expect === "shell" && state.status === "ready" && heldBack(state.me)) router.replace("/welcome");
  });

  return state;
}

/** Returns whether the server actually recorded it.
 *
 *  Not void: a network failure or a session that expired mid-onboarding used
 *  to throw out of here, which left the caller's "leaving" flag stuck true and
 *  every button on the screen disabled with no way back but a reload. */
export async function completeOnboarding(
  displayName: string,
  /** 023. The browser's zone, which becomes the account's clock. Left out
   *  rather than sent empty when the runtime will not say. */
  timeZone: string | null = null,
): Promise<boolean> {
  try {
    const response = await fetch(`${API}/api/onboarding/complete`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      // Both ticks, and the server refuses anything else. Sent as the literal
      // pair rather than one "consented" flag so that adding or changing a
      // consent is a change the server can see, not a boolean that silently
      // starts meaning something else.
      body: JSON.stringify({
        readPolicy: true,
        agreeToProcessing: true,
        displayName,
        ...(timeZone ? { timeZone } : {}),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Turning a switch. 016.
 *
 *  Patches one field, never the pair and never a name: a settings toggle that
 *  sends a display name is one that can clear a name by accident. The server's
 *  schema is the other half of that, where every field is optional and only
 *  what was sent is written. */
/** The countries somebody can say they are in. Fetched rather than shipped: the
 *  server validates against the same list it serves. */
export async function fetchCountries(): Promise<{ code: string; name: string }[]> {
  try {
    const response = await fetch(`${API}/api/countries`, { credentials: "include" });
    if (!response.ok) return [];
    const body = (await response.json()) as { countries: { code: string; name: string }[] };
    return body.countries;
  } catch {
    return [];
  }
}

/** Saying where you are. Null clears it, which is a real state. */
export async function updateCountry(country: string | null): Promise<Me | null> {
  try {
    const response = await fetch(`${API}/api/me`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ country }),
    });
    if (!response.ok) return null;
    const me = (await response.json()) as Me;
    cached = me;
    window.dispatchEvent(new CustomEvent<Me>(CHANGED, { detail: me }));
    return me;
  } catch {
    return null;
  }
}

/** The account's clock. 023.
 *
 *  One field a call. Use writes `timeZone`, and the server clears
 *  `keptTimeZone` with it; Keep writes `keptTimeZone`; the switch on Date and
 *  time writes `followDevice`. No Undo, because each is one tap from its
 *  reverse. Null on a refusal or a failure, and the strip puts itself back. */
export async function updateClock(patch: {
  timeZone?: string;
  followDevice?: boolean;
  keptTimeZone?: string | null;
}): Promise<Me | null> {
  try {
    const response = await fetch(`${API}/api/me`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) return null;
    const me = (await response.json()) as Me;
    cached = me;
    window.dispatchEvent(new CustomEvent<Me>(CHANGED, { detail: me }));
    return me;
  } catch {
    return null;
  }
}

/** 027. Customize Today's layout, the whole document, one write a gesture.
 *  Null on a refusal or a failure, and the pane puts itself back. */
export async function updateTodayLayout(todayLayout: TodayLayout): Promise<Me | null> {
  try {
    const response = await fetch(`${API}/api/me`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ todayLayout }),
    });
    if (!response.ok) return null;
    const me = (await response.json()) as Me;
    cached = me;
    window.dispatchEvent(new CustomEvent<Me>(CHANGED, { detail: me }));
    return me;
  } catch {
    return null;
  }
}

/** The switches and the hours. 024. One field a call. */
export async function updateNotify(patch: {
  notifyDueToday?: boolean;
  notifyDueTodayAt?: string;
  notifyComingTomorrow?: boolean;
  notifyComingTomorrowAt?: string;
  notifyPeopleRequests?: boolean;
  notifySharedActivity?: boolean;
  notifyReminders?: boolean;
  notifyReminderCount?: 1 | 2 | 3;
}): Promise<Me | null> {
  try {
    const response = await fetch(`${API}/api/me`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) return null;
    const me = (await response.json()) as Me;
    cached = me;
    window.dispatchEvent(new CustomEvent<Me>(CHANGED, { detail: me }));
    return me;
  } catch {
    return null;
  }
}

export async function updateWebAccess(patch: {
  webSearch?: boolean;
  webLinks?: boolean;
}): Promise<Me | null> {
  try {
    const response = await fetch(`${API}/api/me`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) return null;

    const me = (await response.json()) as Me;
    cached = me;
    window.dispatchEvent(new CustomEvent<Me>(CHANGED, { detail: me }));
    return me;
  } catch {
    return null;
  }
}

/** Setting your name. 011.
 *
 *  Returns the whole identity rather than a boolean, because the server's
 *  reply is what the caller should hold next: initials come from one rule on
 *  the server, and a client that patched the name locally would be recomputing
 *  its own two letters and drifting from every other surface.
 *
 *  Null on a refusal or a failure. The screen says what happened; it does not
 *  guess which one it was. */
export async function updateName(displayName: string): Promise<Me | null> {
  try {
    const response = await fetch(`${API}/api/me`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
    if (!response.ok) return null;

    const me = (await response.json()) as Me;
    cached = me;
    window.dispatchEvent(new CustomEvent<Me>(CHANGED, { detail: me }));
    return me;
  } catch {
    return null;
  }
}
