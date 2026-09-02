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

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: "offload",
      storagePrefix: "offload",
      storage: SecureStore,
    }),
  ],
});

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

/** Apple first on iOS because the App Store requires it to be at least as
 *  prominent as any other option. Google first on Android because that account
 *  is already on the device and asking for an Apple one there is a detour. */
export const providerOrder: Provider[] =
  Platform.OS === "ios" ? ["apple", "google"] : ["google", "apple"];

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

/** TEMPORARY, for testing the gate. Remove with components/TempSignOut.tsx.
 *
 *  Best effort, and deliberately not blocking on the server. The point is to
 *  get back to the gate; a signOut call that never settles would otherwise
 *  leave the button doing nothing at all, which is the failure mode the
 *  unbounded getCookie() already cost us an afternoon on. The local keys are
 *  cleared either way, so the next launch has no session to find.
 */
export async function signOutForTesting(): Promise<void> {
  await Promise.race([
    authClient.signOut().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  await Promise.all([
    SecureStore.deleteItemAsync("offload_cookie").catch(() => undefined),
    SecureStore.deleteItemAsync("offload_session_data").catch(() => undefined),
  ]);
}
