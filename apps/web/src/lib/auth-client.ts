"use client";

// The browser's half of auth.
//
// The API is a different origin, so every call is credentialed and the session
// lives in an httpOnly cookie the browser sends but JavaScript cannot read.
// That is the point: a token in JavaScript is a token an injected script can
// take.

import { createAuthClient } from "better-auth/react";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

/** Where to come back to after the provider.
 *
 *  The current origin rather than a configured one, so the app returns you to
 *  wherever you actually started: the canonical domain, the platform-generated
 *  one during setup, staging, or localhost. A build-time constant sends
 *  everyone to whichever host was configured when the bundle was made, which is
 *  a redirect to the wrong site for everyone else.
 *
 *  Safe to take from the browser because the server does not trust it: it is
 *  checked against the API's own allowlist, so an attacker-chosen origin is
 *  refused there rather than honoured here. */
const origin = (): string =>
  typeof window === "undefined"
    ? (process.env["NEXT_PUBLIC_WEB_URL"] ?? "http://localhost:4700")
    : window.location.origin;

export const authClient = createAuthClient({
  baseURL: API,
  fetchOptions: { credentials: "include" },
});

/** Google first, on every platform: more people arrive with one. Apple keeps
 *  the filled button, so the pair still reads as two things rather than one
 *  and a spare. Product owner, 2026-09-21. */
export const WEB_PROVIDER_ORDER = ["google", "apple"] as const;

export type Provider = (typeof WEB_PROVIDER_ORDER)[number];

/** `to` is the one other place a sign-in may land: the admin panel, which
 *  asks staff for a fresh one. A closed choice, never a path from the address. */
export async function signIn(provider: Provider, to: "admin" | null = null): Promise<{ error?: string }> {
  const { error } = await authClient.signIn.social({
    provider,
    // Land on first run. The server decides whether that person has already
    // done it, so this is a destination rather than a claim.
    callbackURL: `${origin()}${to === "admin" ? "/admin" : "/welcome"}`,
    errorCallbackURL: `${origin()}/no-invite`,
  });
  return error ? { error: error.message ?? "unknown" } : {};
}
