// Launch when nothing answers. 027.
//
// Two things can be true and the screen says which: there is no network, or
// there is one and offload is not answering. Neither is the person's fault and
// neither is drawn as a failure in danger red. Both ask again on their own:
// the first when the network returns, the second on a schedule with jitter,
// never sooner than the server asked.

import { retryDelay } from "@offload/widgets";

export type LaunchFailure = "offline" | "unanswered";

export const LAUNCH_COPY: Record<LaunchFailure, { title: string; line: string }> = {
  offline: { title: "You're offline", line: "offload picks up when you're back." },
  unanswered: { title: "offload isn't answering", line: "Trying again." },
};

/** Null when the phone will not say whether it is online: treated as online,
 *  so the screen keeps asking rather than waiting for an event. */
export function failureOf(online: boolean | null): LaunchFailure {
  return online === false ? "offline" : "unanswered";
}

/** How long to wait before asking again, in milliseconds. */
export function nextWait(attempt: number, retryAfterSeconds: number | null, random: () => number = Math.random): number {
  return Math.max(retryDelay(attempt, random), (retryAfterSeconds ?? 0) * 1000);
}
