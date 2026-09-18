// Who is signed in, asked of the server rather than remembered.
//
// The same answer web's `use-me.ts` reads, for the same reason: state moves
// `invited` to `active` by a write only the server makes, an account can be
// disabled between two launches, and a display name can change on another
// device. Nothing here is cached.

import { useEffect, useState } from "react";
import { request, send } from "./api";
import { failed } from "./log";

export interface Me {
  state: "invited" | "active";
  displayName: string | null;
  email: string;
  /** Two letters for the avatar, computed by the server so that this screen
   *  and a shared thread's faces cannot disagree about the same person. */
  initials: string;
  needsFirstRun: boolean;
  /** No name yet. See `stillAsking` in `api.ts`, which is the gate. */
  needsName: boolean;
  /** What Apple or Google called them, to fill the field in. */
  suggestedName: string | null;
  /** 016. Whether offload may search the web, and whether it may open a link
   *  they pasted. Two different promises, so two switches. */
  webSearch: boolean;
  webLinks: boolean;
  /** 019. Every calendar write is put to them first. */
  calendarAskFirst: boolean;
  /** Where they said they are, ISO 3166-1 alpha-2. Null until they say, and
   *  offload then tells the model it does not know rather than assuming. */
  country: string | null;
}

/** Every mounted `useMe` hears a change to the identity.
 *
 *  The settings index and My account are two screens in one stack, each with
 *  its own `useMe`, so a name saved on the second would leave the first showing
 *  the old one and the old initials when it came back into view. A module-level
 *  set of listeners is the whole mechanism; there is no store to add. */
type Listener = (me: Me) => void;
const listeners = new Set<Listener>();

/** Null while it is being asked, and null if the ask failed.
 *
 *  A settings screen whose identity block did not load still works: the rows
 *  below it need no server at all. So a failure here draws nothing rather than
 *  a guess or an apology. */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { data } = await send<Me>("/api/me");
        if (live && data) setMe(data);
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

/** Turning a switch. 016.
 *
 *  Patches one field, never the pair and never a name: a settings toggle
 *  sending a display name is a toggle that can clear one by accident. The
 *  server's own schema is the other half of that, where every field is optional
 *  and only what was sent is written.
 *
 *  Broadcast like `saveName`, so every mounted `useMe` has the new state
 *  without a refetch and the switch never disagrees with itself. */
/** The countries somebody can say they are in. 
 *
 *  Fetched rather than shipped: the server validates against the same list it
 *  serves, so a code this offers is always one the patch accepts. */
export async function fetchCountries(): Promise<{ code: string; name: string }[]> {
  const { data } = await send<{ countries: { code: string; name: string }[] }>("/api/countries");
  return data?.countries ?? [];
}

/** Saying where you are. Null clears it, which is a real state: offload then
 *  tells the model it does not know rather than assuming. */
export async function setCountry(country: string | null): Promise<Me | null> {
  try {
    const updated = await request<Me>("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ country }),
    });
    if (!updated) return null;
    for (const listener of listeners) listener(updated);
    return updated;
  } catch (error) {
    failed("me.setCountry", error);
    return null;
  }
}

export async function setWebAccess(
  patch: { webSearch?: boolean; webLinks?: boolean },
): Promise<Me | null> {
  try {
    const updated = await request<Me>("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!updated) return null;
    for (const listener of listeners) listener(updated);
    return updated;
  } catch (error) {
    failed("me.setWebAccess", error);
    return null;
  }
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
  try {
    const updated = await request<Me>("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
    if (!updated) return null;

    for (const listener of listeners) listener(updated);
    return updated;
  } catch (error) {
    failed("me.saveName", error);
    return null;
  }
}
