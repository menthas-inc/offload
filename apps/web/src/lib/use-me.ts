"use client";

// The shell's first question on every screen behind the gate: who is this, and
// have they finished first run?
//
// The answer comes from the server every time rather than from anything the
// client stored. State moves invited -> active by a write only the server
// makes, and an account can be disabled between two page loads.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
  /** 016. Whether offload may search the web, and whether it may open a link
   *  they pasted. Two different promises, so two switches. */
  webSearch: boolean;
  webLinks: boolean;
  /** Where they said they are, ISO 3166-1 alpha-2. Null until they say, and
   *  offload then tells the model it does not know rather than assuming. */
  country: string | null;
  /** 023. The account's clock, or null until a device names one. */
  timeZone: string | null;
  followDevice: boolean;
  keptTimeZone: string | null;
  /** What Apple or Google called them, to fill the field in. Only ever sent to
   *  the account it belongs to, and null when the provider sent nothing. */
  suggestedName: string | null;
  /** 022. Connection requests waiting for their answer: the dot on the
   *  sidebar's Settings and on the My people row. */
  requestsWaiting: number;
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
 *  Two questions, one gate. They came apart because every account that existed
 *  when 011 shipped had finished first run and had no name, so "finished first
 *  run" stopped being the same as "ready". */
export function stillAsking(me: Me): boolean {
  return me.needsFirstRun || me.needsName;
}

export type MeState = { status: "loading" } | { status: "ready"; me: Me };

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

/** Hear every change to the identity; returns the way to stop. */
export function onMe(listener: (me: Me) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<Me>).detail);
  window.addEventListener(CHANGED, handler);
  if (cached) listener(cached);
  return () => window.removeEventListener(CHANGED, handler);
}

/** Reads the current account, sending anyone without a session to the gate.
 *  `expect` says which side of first run this screen is for; landing on the
 *  wrong side is a redirect, not an error. */
export function useMe(expect: "first-run" | "shell"): MeState {
  const router = useRouter();
  const [state, setState] = useState<MeState>({ status: "loading" });

  useEffect(() => {
    let live = true;

    fetch(`${API}/api/me`, { credentials: "include" })
      .then(async (response) => {
        if (!live) return;
        if (!response.ok) {
          router.replace("/sign-in");
          return;
        }
        const me = (await response.json()) as Me;
        cached = me;
        if (!live) return;
        if (stillAsking(me) && expect === "shell") router.replace("/welcome");
        else if (!stillAsking(me) && expect === "first-run") router.replace("/today");
        else setState({ status: "ready", me });
      })
      .catch(() => {
        // A network failure is not a signed-out state, so it does not bounce
        // anyone to the gate. The screen stays on its loading frame and a
        // reload retries.
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
      if (stillAsking(me) !== (expect === "first-run")) return;
      setState({ status: "ready", me });
    };
    window.addEventListener(CHANGED, onChanged);

    return () => {
      live = false;
      window.removeEventListener(CHANGED, onChanged);
    };
  }, [expect, router]);

  return state;
}

/** Returns whether the server actually recorded it.
 *
 *  Not void: a network failure or a session that expired mid-onboarding used
 *  to throw out of here, which left the caller's "leaving" flag stuck true and
 *  every button on the screen disabled with no way back but a reload. */
export async function completeOnboarding(displayName: string): Promise<boolean> {
  try {
    const response = await fetch(`${API}/api/onboarding/complete`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      // Both ticks, and the server refuses anything else. Sent as the literal
      // pair rather than one "consented" flag so that adding or changing a
      // consent is a change the server can see, not a boolean that silently
      // starts meaning something else.
      body: JSON.stringify({ readPolicy: true, agreeToProcessing: true, displayName }),
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
