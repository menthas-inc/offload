// Signing out, from the index and from My account. 031 put a second Sign out
// on My account; the two are one behaviour, so they are one hook.

import { useState } from "react";
import { useRouter } from "expo-router";
import { signOut } from "../../lib/auth";
import { forgetPlayback } from "../shell/SentVoice";
import type { ToastState } from "../shell/Toast";

export function useSignOut(toast: ToastState): { leaving: boolean; leave: () => Promise<void> } {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function leave(): Promise<void> {
    if (leaving) return;
    setLeaving(true);
    try {
      await signOut();
      // Only now. Everything before this point could still have failed.
      // 021. And the device copies of any voice note being heard go with
      // the session.
      forgetPlayback();
      router.replace("/");
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
