"use client";

// The browser's half of auth.
//
// The API is a different origin, so every call is credentialed and the session
// lives in an httpOnly cookie the browser sends but JavaScript cannot read.
// That is the point: a token in JavaScript is a token an injected script can
// take.

import { createAuthClient } from "better-auth/react";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";
const WEB = process.env["NEXT_PUBLIC_WEB_URL"] ?? "http://localhost:4700";

export const authClient = createAuthClient({
  baseURL: API,
  fetchOptions: { credentials: "include" },
});

/** Provider order is per platform, from the design: Apple leads on iOS because
 *  the App Store requires it to be at least as prominent as Google's, Google
 *  leads on Android because that account is already on the device, and web
 *  shows Apple first with Google under it. */
export const WEB_PROVIDER_ORDER = ["apple", "google"] as const;

export type Provider = (typeof WEB_PROVIDER_ORDER)[number];

export async function signIn(provider: Provider): Promise<{ error?: string }> {
  const { error } = await authClient.signIn.social({
    provider,
    // Land on first run. The server decides whether that person has already
    // done it, so this is a destination rather than a claim.
    callbackURL: `${WEB}/welcome`,
    errorCallbackURL: `${WEB}/no-invite`,
  });
  return error ? { error: error.message ?? "unknown" } : {};
}
