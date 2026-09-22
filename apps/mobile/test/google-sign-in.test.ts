// Google on Android goes native, so the session never rides a deep link.
//
// Security review 2026-09-22, H1. The browser flow came back to the app as
// `offload://welcome?cookie=...`, and on Android a custom scheme is an intent
// any installed app may claim. The native sheet hands the app an ID token,
// which the server verifies against the web client id, and no URL carries a
// session at any point.

import { beforeEach, describe, expect, it, vi } from "vitest";

const social: unknown[] = [];
let nativeSignIn: () => Promise<unknown> = () => Promise.resolve({ type: "success", data: { idToken: "id-token-from-google" } });
let hasPlayServices = true;

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: () => Promise.resolve(),
  getItemAsync: () => Promise.resolve(null),
  setItemAsync: () => Promise.resolve(),
  getItem: () => null,
  setItem: () => undefined,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afu",
}));
vi.mock("react-native", () => ({ Platform: { OS: "android", select: (o: Record<string, unknown>) => o["android"] } }));
vi.mock("expo-apple-authentication", () => ({
  isAvailableAsync: () => Promise.resolve(false),
  signInAsync: () => Promise.resolve({}),
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: { scheme: "offload", version: "0.1.0", extra: {} } } }));
vi.mock("@better-auth/expo/client", () => ({ expoClient: () => ({ id: "expo" }) }));
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    signOut: () => Promise.resolve(),
    signIn: {
      social: (args: unknown) => {
        social.push(args);
        return Promise.resolve({ error: null });
      },
    },
    getCookie: () => "",
  }),
}));
vi.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: () => undefined,
    hasPlayServices: () => (hasPlayServices ? Promise.resolve(true) : Promise.reject(new Error("no play services"))),
    signIn: () => nativeSignIn(),
  },
}));

process.env["EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"] = "web-client-id.apps.googleusercontent.com";
const { signInWithGoogle } = await import("../lib/auth");

beforeEach(() => {
  social.length = 0;
  hasPlayServices = true;
  nativeSignIn = () => Promise.resolve({ type: "success", data: { idToken: "id-token-from-google" } });
});

describe("Google on Android", () => {
  it("sends the native sheet's id token and opens no browser", async () => {
    expect(await signInWithGoogle()).toEqual({ ok: true });
    expect(social).toEqual([{ provider: "google", idToken: { token: "id-token-from-google" } }]);
  });

  it("is cancelled when the sheet is", async () => {
    nativeSignIn = () => Promise.resolve({ type: "cancelled", data: null });
    expect(await signInWithGoogle()).toEqual({ ok: false, reason: "cancelled" });
    expect(social).toHaveLength(0);
  });

  it("falls back to the browser only when the native sheet cannot run at all", async () => {
    hasPlayServices = false;
    expect(await signInWithGoogle()).toEqual({ ok: true });
    expect(social).toHaveLength(1);
    expect((social[0] as { callbackURL?: string }).callbackURL).toBe("offload://welcome");
  });
});
