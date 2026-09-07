// Who is signed in, asked of the server rather than remembered.
//
// The same answer web's `use-me.ts` reads, for the same reason: state moves
// `invited` to `active` by a write only the server makes, an account can be
// disabled between two launches, and a display name can change on another
// device. Nothing here is cached.

import { useEffect, useState } from "react";
import { send } from "./api";
import { failed } from "./log";

export interface Me {
  state: "invited" | "active";
  displayName: string | null;
  email: string;
  /** Two letters for the avatar, computed by the server so that this screen
   *  and a shared thread's faces cannot disagree about the same person. */
  initials: string;
  needsFirstRun: boolean;
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
    void (async () => {
      try {
        const { data } = await send<Me>("/api/me");
        if (live && data) setMe(data);
      } catch (error) {
        failed("me.fetch", error);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return me;
}
