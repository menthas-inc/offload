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

/** The web client id, which is what the native sheet's id token is issued
 *  for and what the server checks it against. Public, like every client id;
 *  set per build profile in eas.json and locally in .env. */
const GOOGLE_WEB_CLIENT_ID = process.env["EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"];

/** The browser flow. Kept for iOS, where the system's auth session hands the
 *  return URL straight to the app that opened it, and as the fallback where
 *  the native sheet cannot run at all. */
async function googleThroughTheBrowser(): Promise<SignInResult> {
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

/** Google, native where it has to be.
 *
 *  **On Android the browser flow came back as a deep link carrying the
 *  session.** The Expo plugin rewrites the return URL to
 *  `offload://welcome?cookie=...`, and on Android a custom scheme is an intent
 *  any installed app may claim, so an app on the same phone could receive a
 *  working session (security review 2026-09-22, H1). The native sheet hands
 *  this app an ID token instead; the server verifies it against the web client
 *  id and no URL carries a session at any point. iOS keeps the browser flow,
 *  whose auth session returns the URL to the app that opened it, until an iOS
 *  client id exists for the native sheet there too. */
export async function signInWithGoogle(): Promise<SignInResult> {
  if (Platform.OS !== "android" || !GOOGLE_WEB_CLIENT_ID) return googleThroughTheBrowser();

  let GoogleSignin: typeof import("@react-native-google-signin/google-signin").GoogleSignin;
  try {
    ({ GoogleSignin } = await import("@react-native-google-signin/google-signin"));
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    await GoogleSignin.hasPlayServices();
  } catch {
    // No native module in this build, or no Play services on this device:
    // the browser flow is the only door left. Rare, and better than no door.
    return googleThroughTheBrowser();
  }

  let idToken: string | null = null;
  try {
    const result = await GoogleSignin.signIn();
    if (result.type === "cancelled") return { ok: false, reason: "cancelled" };
    idToken = result.data?.idToken ?? null;
  } catch {
    return { ok: false, reason: "failed" };
  }
  if (!idToken) return { ok: false, reason: "failed" };

  // The id token goes to our API, which verifies it against Google's keys and
  // the web client id. Nothing here decides anything, exactly as with Apple.
  const { error } = await authClient.signIn.social({ provider: "google", idToken: { token: idToken } });
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

  // 024. The push token is deleted on the server first, while the session
  // can still say whose it is: after sign-out the route would refuse it, and
  // the next account on this phone would hear this one's words.
  for (const handler of signingOut) {
    await handler().catch(() => undefined);
  }

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
  await Promise.all(SESSION_KEYS.map((key) => forget(key)));
  for (const listener of signedOut) listener();
}

const signedOut = new Set<() => void>();
const signingOut = new Set<() => Promise<void>>();

/** Run before the session ends, with the session still valid, for anything
 *  the server holds in this session's name. */
export function beforeSignOut(handler: () => Promise<void>): void {
  signingOut.add(handler);
}

/** Hear the session end on this device, for anything holding a copy of who
 *  was signed in: the identity cache kept the last account's clock and name
 *  in memory for the next person on a shared phone until a screen asked
 *  again. 023, from the security review of 2026-09-22. */
export function onSignedOut(listener: () => void): void {
  signedOut.add(listener);
}

/** A key and, when the plugin split its value, the chunks under it.
 *
 *  Values over 1,800 characters are written as `<key>.0..N` beneath a marker,
 *  `ba-chunks:N`, because the native stores refuse a long value. Deleting the
 *  marker alone left the chunks, which is where the token would have been
 *  (security review 2026-09-22, L31). The marker is read first, so the count
 *  is the plugin's and not a guess. */
async function forget(key: string): Promise<void> {
  const stored = await SecureStore.getItemAsync(key).catch(() => null);
  const count = stored?.startsWith("ba-chunks:") ? Number(stored.slice("ba-chunks:".length)) : 0;
  const keys = [key, ...Array.from({ length: Number.isInteger(count) && count > 0 ? count : 0 }, (_, i) => `${key}.${i}`)];
  await Promise.all(keys.map((k) => SecureStore.deleteItemAsync(k).catch(() => undefined)));
}
