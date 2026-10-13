// When the conversation asks the server for its tail. 2026-10-11.
//
// Once when it mounts, which on a cold launch while signed in is the whole
// story. After a sign-out it mounts again with nobody signed in, so that ask
// finds nothing, and without a second one the person who signs in next saw an
// empty conversation until a relaunch. The provider calls this on mount and
// again whenever launch claims the phone for an account: an ask the server
// answered is never repeated, and one that found nothing is asked again.

/** `ask` resolves true when the server answered, an empty tail included. */
export function tailAsker(ask: () => Promise<boolean>): () => void {
  let state: "idle" | "out" | "answered" = "idle";
  // A call while an ask is out, kept for when that ask finds nothing: on a
  // cold launch the mount's ask can still be out when the phone is claimed.
  let again = false;

  const run = (): void => {
    state = "out";
    again = false;
    void ask()
      .catch(() => false)
      .then((answered) => {
        state = answered ? "answered" : "idle";
        if (!answered && again) run();
      });
  };

  return () => {
    if (state === "answered") return;
    if (state === "out") {
      again = true;
      return;
    }
    run();
  };
}
