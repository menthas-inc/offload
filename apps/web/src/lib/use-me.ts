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
  state: "invited" | "active";
  displayName: string | null;
  email: string;
  /** Two letters for the avatar, from the server's one rule rather than a
   *  split done here. Three clients splitting a name is three chances to
   *  disagree about "Ana de Sousa". */
  initials: string;
  needsFirstRun: boolean;
}

export type MeState = { status: "loading" } | { status: "ready"; me: Me };

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
        if (!live) return;
        if (me.needsFirstRun && expect === "shell") router.replace("/welcome");
        else if (!me.needsFirstRun && expect === "first-run") router.replace("/today");
        else setState({ status: "ready", me });
      })
      .catch(() => {
        // A network failure is not a signed-out state, so it does not bounce
        // anyone to the gate. The screen stays on its loading frame and a
        // reload retries.
      });

    return () => {
      live = false;
    };
  }, [expect, router]);

  return state;
}

/** Returns whether the server actually recorded it.
 *
 *  Not void: a network failure or a session that expired mid-onboarding used
 *  to throw out of here, which left the caller's "leaving" flag stuck true and
 *  every button on the screen disabled with no way back but a reload. */
export async function completeOnboarding(): Promise<boolean> {
  try {
    const response = await fetch(`${API}/api/onboarding/complete`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      // Both ticks, and the server refuses anything else. Sent as the literal
      // pair rather than one "consented" flag so that adding or changing a
      // consent is a change the server can see, not a boolean that silently
      // starts meaning something else.
      body: JSON.stringify({ readPolicy: true, agreeToProcessing: true }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
