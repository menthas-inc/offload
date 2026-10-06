// 039, as the owner changed it: a review code is typed on the sign-in screen
// and rides with that one sign-in. Beside the token when a native sheet signs
// in (Apple on iPhone, Google on Android), in the OAuth state when a browser
// does (Google on iPhone, Apple on Android). Not drawn once the switch is off.
//
// The refusal's signed cookie still matters on a phone: it is how the
// no-invite screen names the address and says a code did not work. The auth
// client fetches with `credentials: "omit"`, so the app keeps it from the
// refused response itself.

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

let authOptions: { fetchOptions?: { onError?: (context: { response: Response }) => void } } = {};
const social: unknown[] = [];
let os = "ios";

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: () => Promise.resolve(),
  getItemAsync: () => Promise.resolve(null),
  setItemAsync: () => Promise.resolve(),
  getItem: () => null,
  setItem: () => undefined,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afu",
}));
vi.mock("react-native", () => ({ Platform: { get OS() { return os; }, select: (o: Record<string, unknown>) => o[os] } }));
vi.mock("expo-apple-authentication", () => ({
  isAvailableAsync: () => Promise.resolve(true),
  signInAsync: () => Promise.resolve({ identityToken: "token-from-apple" }),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: { scheme: "offload", version: "0.1.0", extra: { apiUrl: "https://api.example.test" } } } }));
vi.mock("@better-auth/expo/client", () => ({ expoClient: () => ({ id: "expo" }) }));
vi.mock("better-auth/react", () => ({
  createAuthClient: (options: typeof authOptions) => {
    authOptions = options;
    return {
      signOut: () => Promise.resolve(),
      signIn: {
        social: (args: unknown) => {
          social.push(args);
          return Promise.resolve({ error: null });
        },
      },
      getCookie: () => "",
    };
  },
}));
vi.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: () => undefined,
    hasPlayServices: () => Promise.resolve(true),
    signIn: () => Promise.resolve({ type: "success", data: { idToken: "token-from-google" } }),
  },
}));

process.env["EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"] = "web-client-id.apps.googleusercontent.com";
const { signIn } = await import("../lib/auth");
const { attemptHeaders, forgetAttempt, rememberAttempt } = await import("../lib/attempt");
const { codesOn } = await import("../lib/code");
const { GATE } = await import("../lib/gate");

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

let reply: () => Promise<Response> = () => Promise.resolve(new Response(JSON.stringify({ codes: true })));
const fetched: string[] = [];

beforeEach(() => {
  forgetAttempt();
  social.length = 0;
  fetched.length = 0;
  vi.stubGlobal("fetch", (url: string) => {
    fetched.push(url);
    return reply();
  });
});

describe("the code rides with the sign-in", () => {
  it("beside Apple's token from the native sheet on an iPhone", async () => {
    os = "ios";
    await signIn("apple", "abcd-efgh-jkmn");
    expect(social).toEqual([{ provider: "apple", idToken: { token: "token-from-apple" }, additionalData: { reviewCode: "abcd-efgh-jkmn" } }]);
  });

  it("beside Google's token from the native sheet on Android", async () => {
    os = "android";
    await signIn("google", "abcd-efgh-jkmn");
    expect(social).toEqual([{ provider: "google", idToken: { token: "token-from-google" }, additionalData: { reviewCode: "abcd-efgh-jkmn" } }]);
  });

  it("in the state of a browser sign-in: Google on an iPhone, Apple on Android", async () => {
    os = "ios";
    await signIn("google", "abcd-efgh-jkmn");
    os = "android";
    await signIn("apple", "abcd-efgh-jkmn");
    expect(social).toEqual([
      expect.objectContaining({ provider: "google", callbackURL: "offload://welcome", additionalData: { reviewCode: "abcd-efgh-jkmn" } }),
      expect.objectContaining({ provider: "apple", callbackURL: "offload://welcome", additionalData: { reviewCode: "abcd-efgh-jkmn" } }),
    ]);
  });

  it("and nothing extra rides without one", async () => {
    os = "ios";
    await signIn("apple", "  ");
    expect(social).toEqual([{ provider: "apple", idToken: { token: "token-from-apple" } }]);
  });
});

describe("the switch", () => {
  it("is read from the sign-in options, and off when they cannot be read", async () => {
    expect(await codesOn()).toBe(true);
    expect(fetched).toEqual(["https://api.example.test/api/sign-in/options"]);
    reply = () => Promise.resolve(new Response(JSON.stringify({ codes: false })));
    expect(await codesOn()).toBe(false);
    reply = () => Promise.reject(new Error("offline"));
    expect(await codesOn()).toBe(false);
  });
});

describe("the refusal's proof", () => {
  it("is kept from a refused sign-in's set-cookie, among others, by the auth client itself", () => {
    rememberAttempt("better-auth.state=x; Path=/, offload_attempt=YWJj.123.mac; Path=/; Max-Age=600; HttpOnly");
    expect(attemptHeaders()).toEqual({ cookie: "offload_attempt=YWJj.123.mac" });
    forgetAttempt();
    const headers = new Headers({ "set-cookie": "offload_attempt=YWJj.9.mac; Path=/" });
    authOptions.fetchOptions!.onError!({ response: new Response(null, { status: 400, headers }) });
    expect(attemptHeaders()).toEqual({ cookie: "offload_attempt=YWJj.9.mac" });
    rememberAttempt("offload_attempt=; Path=/; Max-Age=0");
    expect(attemptHeaders()).toEqual({});
  });
});

describe("the words, from the one copy both phones read", () => {
  it("are short, and the refusal names the way back", () => {
    expect(GATE.code).toEqual({
      open: "Have a code?",
      placeholder: "Your code",
      refused: "That code did not work.",
      tryAnother: "Try another code",
    });
  });
});

describe("both phones", () => {
  for (const platform of ["ios", "android"]) {
    it(`sign in on ${platform}: offers the code only with the switch on, and sends it with the provider`, () => {
      const source = read(`components/screens/SignIn.${platform}.tsx`);
      expect(source).toContain("void codesOn().then(setCodes)");
      expect(source).toMatch(/\{codes && codeOpen \? \(\s*<CodeField/);
      expect(source).toMatch(/\{codes && !codeOpen \? \(\s*<CodeLine/);
      expect(source).toContain("signIn(provider, codes ? code : \"\")");
    });

    it(`the refusal on ${platform}: sends the proof, and says a code did not work`, () => {
      const source = read(`components/screens/NoInvite.${platform}.tsx`);
      expect(source).toContain("fetch(`${API_URL}/api/sign-in/attempt`, { headers: attemptHeaders() })");
      expect(source).toContain('setBadCode(data.reason === "code")');
      expect(source).toContain("GATE.code.refused");
      expect(source).toContain("badCode ? GATE.code.tryAnother : GATE.notInvited.switch");
    });
  }
});
