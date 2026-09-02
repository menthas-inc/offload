// Joining the waitlist, shared by both platforms.
//
// The endpoint answers `{status:"ok"}` for every address on purpose: already an
// account, rate limited, brand new and outright failed are deliberately
// indistinguishable, and it sleeps to a floor of 250ms so the branch cannot be
// timed either. So there is nothing here to branch on, and a client that showed
// "already registered" would be handing back exactly what the server spent that
// effort hiding. Success is the only outcome this can report.

import { API_URL } from "./auth";

/** Deliberately loose. The server validates with zod and is the authority; this
 *  only catches the obvious typo before a round trip, and a stricter pattern
 *  here would reject addresses that are actually valid. */
export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 2 && trimmed.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** Resolves once the address has been sent. Never rejects and never reports a
 *  reason, per the note above. */
export async function joinWaitlist(email: string): Promise<void> {
  try {
    await fetch(`${API_URL}/v1/waitlist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // No honeypot field: the server's `company` is for scripts that fill
      // every input on a page. There is no page here, and sending it empty
      // would only be noise.
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
  } catch {
    // Swallowed on purpose. The screen says the same thing either way, because
    // the server says the same thing either way.
  }
}
