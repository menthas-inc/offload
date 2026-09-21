// Auth on the phones.
//
// The session lives in expo-secure-store, not in AsyncStorage. AsyncStorage is
// a plain file in the app container: readable on a jailbroken device, and
// included in an unencrypted iTunes backup. A session token is a credential.
//
// Two sign-in paths, and the difference is not a preference:
//
//   Apple  native, through expo-apple-authentication. The sheet is part of the
//          OS, there is no browser, and Apple's review guidelines expect the
//          native control on iOS rather than a web redirect.
//
//   Google browser-based, through Better Auth's Expo plugin. Native Google
//          sign-in needs @react-native-google-signin and a reversed client id
//          that only exists once the EAS project and iOS credentials do (task
//          E2). The browser flow works today and is the same gate; swapping it
//          for the native sheet later changes this file and nothing else.

import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";
import Constants from "expo-constants";

/** The API base. A phone is not on localhost, so a device build needs the
 *  machine's LAN address here rather than a loopback that resolves to itself.
 *  See docs/local-dev.md. */
export const API_URL =
  (Constants.expoConfig?.extra?.["apiUrl"] as string | undefined) ??
  process.env["EXPO_PUBLIC_API_URL"] ??
  "http://localhost:4701";

/** Secure storage, pinned to this device.
 *
 *  **`expo-secure-store` defaults to `WHEN_UNLOCKED`, which is the
 *  accessibility class that migrates when a phone restores from an encrypted
 *  backup**, and `@better-auth/expo` calls `setItemAsync` with no options at
 *  all. So without this, a backup restored onto different hardware carries a
 *  working session for the rest of its thirty days, with no sign-in.
 *
 *  Only writes need the option; reads take the value however it was stored.
 *
 *  *iOS only, and stated rather than implied: `keychainAccessible` is marked
 *  `@platform ios` in expo-secure-store's own types. Android uses the Keystore
 *  under a different model and this says nothing about it.*
 */
const deviceOnly = {
  ...SecureStore,
  setItemAsync: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  setItem: (key: string, value: string) =>
    SecureStore.setItem(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
};

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: "offload",
      storagePrefix: "offload",
      storage: deviceOnly,
    }),
  ],
});

/** Rewrite an already-stored session under the stricter class.
 *
 *  Accessibility is applied when a value is written and there is no re-encrypt
 *  on read, so anyone who signed in before this shipped keeps the old class
 *  until something rewrites it, which may not happen inside thirty days. Read
 *  it and put it straight back, once, on launch. */
export async function pinExistingSession(): Promise<void> {
  for (const key of SESSION_KEYS) {
    const value = await SecureStore.getItemAsync(key).catch(() => null);
    if (value === null) continue;
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }).catch(() => undefined);
  }
}

/** Everything on this device that stands for a session.
 *
 *  The names the plugin actually uses, from its own source: `storagePrefix`
 *  plus `_cookie` and `_session_data`. Read out of the package rather than
 *  guessed. **One list, because two places knowing what a session is made of
 *  is how one of them ends up out of date**: `pinExistingSession` rewrites
 *  these and `signOut` deletes them, and anything added later is added once. */
const SESSION_KEYS = ["offload_cookie", "offload_session_data"] as const;

export type Provider = "apple" | "google";

/** What the gate screens do next.
 *
 *  `no-invite` is its own outcome rather than an error string, because the two
 *  need different screens and folding them together is how the no-invite
 *  screen became unreachable on both phones: every refusal, including "you
 *  were never invited", surfaced as the generic banner on the gate itself. The
 *  web client had an errorCallbackURL and the phones had nothing. */
export type SignInResult = { ok: true } | { ok: false; reason: "no-invite" | "failed" | "cancelled" };

/** Better Auth surfaces the gate's refusal through its own error vocabulary.
 *  Anything that means "the account exists but may not in", or "there is no
 *  account", is the no-invite screen; everything else is a genuine failure. */
function classify(message: string | undefined): "no-invite" | "failed" {
  const text = (message ?? "").toLowerCase();
  const refused = ["no-invite", "not linked", "account not linked", "signup", "sign up", "forbidden", "unable to create"];
  return refused.some((needle) => text.includes(needle)) ? "no-invite" : "failed";
}

/** Google first everywhere: more people arrive with one. iOS led with Apple
 *  on a reading of the App Store's rule that it be at least as prominent as
 *  any other option; the rule is about size and reach, not order, and the
 *  second row is the same height and on screen without scrolling, which is
 *  what it asks. Apple keeps its filled treatment. Product owner, 2026-09-21. */
export const providerOrder: Provider[] = ["google", "apple"];

export async function signInWithApple(): Promise<SignInResult> {
  // Android gets the browser flow, the same one Google uses there.
  //
  // expo-apple-authentication is the native sheet and exists only on iOS, but
  // Sign in with Apple itself is not iOS-only, and the Android kit offers it.
  // Hiding the button off iOS meant an invited person whose account is an
  // Apple one had no way in on Android at all.
  if (Platform.OS !== "ios") {
    const { error } = await authClient.signIn.social({
      provider: "apple",
      callbackURL: "offload://welcome",
      errorCallbackURL: "offload://no-invite",
    });
    return error ? { ok: false, reason: classify(error.message) } : { ok: true };
  }

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) return { ok: false, reason: "failed" };

    // The id token goes to our API, which verifies it against Apple's keys.
    // Nothing here decides anything: the gate runs on the server, because a
    // client that could decide would be a client worth tampering with.
    const { error } = await authClient.signIn.social({
      provider: "apple",
      idToken: { token: credential.identityToken },
    });
    // Apple's native sheet has no redirect, so there is no errorCallbackURL to
    // carry a refusal. The outcome is classified here instead and the screen
    // navigates.
    return error ? { ok: false, reason: classify(error.message) } : { ok: true };
  } catch (thrown) {
    // Apple reports a cancelled sheet as a thrown error with this code, which
    // is not a failure and must not surface as one.
    const code = (thrown as { code?: string })?.code;
    if (code === "ERR_REQUEST_CANCELED") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "failed" };
  }
}

export async function signInWithGoogle(): Promise<SignInResult> {
  const { error } = await authClient.signIn.social({
    provider: "google",
    callbackURL: "offload://welcome",
    // Without this a refused sign-in comes back as a generic error and the
    // no-invite screen is never reached. The scheme is already in the API's
    // trusted origins, and the server checks it there rather than trusting it
    // from here.
    errorCallbackURL: "offload://no-invite",
  });
  return error ? { ok: false, reason: classify(error.message) } : { ok: true };
}

export function signIn(provider: Provider): Promise<SignInResult> {
  return provider === "apple" ? signInWithApple() : signInWithGoogle();
}

/** Whether to offer Apple at all.
 *
 *  Everywhere except iOS the answer is yes, because the browser flow works
 *  anywhere. On iOS it depends on the native sheet actually being available,
 *  which asking is cheaper than assuming: a dead button is worse than an
 *  absent one. */
export async function appleAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return true;
  return AppleAuthentication.isAvailableAsync();
}

/** Leaving, properly.
 *
 *  **The order is the whole of it: the server first, the keys second.** The
 *  scaffolding this replaces raced the call against three seconds and cleared
 *  the keys either way, which is right for a debug button and wrong for the
 *  real control. A phone that clears its keys after a failed call looks signed
 *  out while the account's session lives for up to thirty days, and it has
 *  forgotten who it was, so there is nothing left to retry with. On a shared
 *  device that is somebody else's account left open.
 *
 *  The bound stays, because an unbounded `signOut()` is how a button ends up
 *  doing nothing forever and this repository has already paid an afternoon for
 *  that. What changed is what happens when it expires: nothing is cleared and
 *  the caller is told. */
const PATIENCE_MS = 8_000;

export class SignOutFailed extends Error {
  constructor() {
    super("sign out did not complete");
  }
}

/** Resolves only once the server has ended the session, and the local keys are
 *  gone. Throws `SignOutFailed` otherwise, with the device still signed in. */
export async function signOut(): Promise<void> {
  const expired = Symbol("expired");

  const outcome = await Promise.race([
    authClient.signOut().then(
      () => "done" as const,
      () => "failed" as const,
    ),
    new Promise<typeof expired>((resolve) => setTimeout(() => resolve(expired), PATIENCE_MS)),
  ]);

  if (outcome !== "done") throw new SignOutFailed();

  // Only now. This is the one place that knows what a session is made of on
  // this device, so anything added later is added here rather than at a call
  // site that would not know to.
  await Promise.all(
    SESSION_KEYS.map((key) => SecureStore.deleteItemAsync(key).catch(() => undefined)),
  );
}
