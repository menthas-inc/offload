// Writes the screen has already drawn: `perform` and `reverse` are
// `@offload/widgets`, both clients; this is the count of what is in flight.
//
// **A reload yields to a write in flight.** A screen that has drawn a change
// must not read the server's copy back while the change is still travelling,
// or the read undoes the change for the length of a round trip. `useWrites`
// counts what is in flight and reloads once nothing is; a reload that lands
// while something is in flight is dropped by the screen, which checks `idle`
// before applying it.

import { useCallback, useRef } from "react";
import type { Writes } from "@offload/widgets";

export { perform, reverse } from "@offload/widgets";
export type { Reversible, ToastAction, Toaster, Writes } from "@offload/widgets";

/** The count of writes in flight, and the reload that runs when it settles. */
export function useWrites(reload: () => Promise<void>): Writes {
  const inFlight = useRef(0);
  const latest = useRef(reload);
  latest.current = reload;

  const track = useCallback(async (write: Promise<boolean>): Promise<boolean> => {
    inFlight.current += 1;
    try {
      return await write;
    } catch {
      return false;
    } finally {
      inFlight.current -= 1;
      // A reload that fails after a write that failed is the same outage, and
      // the toast has already said so; it is not a second thing to report.
      if (inFlight.current === 0) latest.current().catch(() => undefined);
    }
  }, []);

  const idle = useCallback(() => inFlight.current === 0, []);

  return { track, idle };
}
