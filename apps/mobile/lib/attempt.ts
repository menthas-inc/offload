// 039. The refusal's proof, kept in memory for the no-invite screen.
//
// When the gate turns a sign-in away, the server sets a signed, ten-minute
// `offload_attempt` cookie naming the address it checked. The web's browser
// keeps it. The phones' auth client fetches with `credentials: "omit"`, so the
// phone's cookie store never does, and the no-invite screen had no address and
// nothing to check a review code against. The auth client hands every refused
// response's `set-cookie` here, and the screen sends the value back the way
// the browser would.
//
// Memory only, never storage: it is worth ten minutes, it names an address,
// and the next refusal replaces it.

let attempt: string | null = null;

const NAME = "offload_attempt";

/** Keep the proof from a response's `set-cookie`, which a phone's fetch joins
 *  with commas when there are several. A cleared cookie forgets it. */
export function rememberAttempt(setCookie: string | null | undefined): void {
  if (!setCookie) return;
  const match = new RegExp(`(?:^|[;,]\\s*)${NAME}=([^;,\\s]*)`).exec(setCookie);
  if (!match) return;
  attempt = match[1] ? match[1] : null;
}

export function forgetAttempt(): void {
  attempt = null;
}

/** The header that carries the proof, or none. */
export function attemptHeaders(): Record<string, string> {
  return attempt ? { cookie: `${NAME}=${attempt}` } : {};
}
