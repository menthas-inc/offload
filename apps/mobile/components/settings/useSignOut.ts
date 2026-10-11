// Signing out, from the index and from My account. 031 put a second Sign out
// on My account; the two are one behaviour, so they are one hook.

import { useState } from "react";
import { signOut } from "../../lib/auth";
import type { ToastState } from "../shell/Toast";

export function useSignOut(toast: ToastState): { leaving: boolean; leave: () => Promise<void> } {
  const [leaving, setLeaving] = useState(false);

  async function leave(): Promise<void> {
    if (leaving) return;
    setLeaving(true);
    try {
      // Nothing after this. Once the server has agreed, the phone's copy of
      // the account goes with the session, voice notes included
      // (`lib/device-data.ts`), and the root layout starts the screens again
      // at the gate, this one with them.
      await signOut();
    } catch {
      setLeaving(false);
      // What happened, and the way forward next to it. Not why: this cannot
      // see whether the network or the server was the problem and would be
      // wrong about it.
      toast.show("That didn't go through.", { label: "Try again", onPress: () => void leave() });
    }
  }

  return { leaving, leave };
}
