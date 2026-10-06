// 039. A review code, redeemed at sign-in.
//
// The code is typed on the sign-in screen and travels with that one sign-in:
// beside the token when a native sheet signs in (`routes/auth.ts` puts it in
// the request's store), and in the OAuth state when a browser does, which
// Better Auth keeps server-side for that attempt and hands back at the
// callback. Never a cookie of its own.
//
// It runs from the providers' `mapProfileToUser`, the one point after the
// provider has said who this is and before Better Auth looks for an account.
// So a good code promotes the address there, through the one promotion there
// is, and Better Auth then finds an invited account and signs it in, through
// the gate's own hooks, with no refusal and no second sign-in. A code that
// does not work leaves everything as it was and marks the refusal that
// follows, so the screen can say it was the code.

import { getOAuthState } from "better-auth/api";
import { carried, markCodeRefused } from "./attempt.js";
import { overLimit, redeem } from "../admin/review-codes.js";
import { setting } from "../settings.js";

/** What a provider's profile tells us, for both of ours. Apple sends
 *  `email_verified` as a string. */
interface Profile {
  email?: unknown;
  email_verified?: unknown;
}

async function codeFromState(): Promise<string | null> {
  try {
    const state = (await getOAuthState()) as { reviewCode?: unknown } | null;
    return typeof state?.reviewCode === "string" && state.reviewCode.length <= 40 ? state.reviewCode : null;
  } catch {
    // Outside a request Better Auth is serving: no state, so no code.
    return null;
  }
}

export async function redeemAtSignIn(profile: Profile): Promise<void> {
  const { code: native, ip } = carried();
  const code = native ?? (await codeFromState());
  if (!code?.trim()) return;
  // Off once offload opens past the waitlist: the code is not looked at.
  if (!(await setting("switch.review_codes"))) return;

  const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
  // Only an address the provider vouches for. Promoting one it does not would
  // make an account, a key and an invite email for somebody nobody checked.
  const verified = profile.email_verified === true || profile.email_verified === "true";
  if (!email || !verified) return markCodeRefused();

  if (await overLimit(email, ip ?? "unknown")) return markCodeRefused();
  if ((await redeem(email, code)) === "refused") markCodeRefused();
}
