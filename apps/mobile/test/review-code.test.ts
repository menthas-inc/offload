// 039. A review code on the phones' no-invite screen.
//
// The proof of who is asking is the refusal's signed `offload_attempt` cookie.
// The auth client fetches with `credentials: "omit"`, so the phone's own cookie
// store never holds it: the app keeps it from the refused response and sends
// it back with the attempt read and the code. Without that the screen had no
// address on a phone, and so no code to offer.

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

let authOptions: { fetchOptions?: { onError?: (context: { response: Response }) => void } } = {};

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: () => Promise.resolve(),
  getItemAsync: () => Promise.resolve(null),
  setItemAsync: () => Promise.resolve(),
  getItem: () => null,
  setItem: () => undefined,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afu",
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios", select: (o: Record<string, unknown>) => o["ios"] } }));
vi.mock("expo-apple-authentication", () => ({ isAvailableAsync: () => Promise.resolve(true), signInAsync: () => Promise.resolve({}) }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { scheme: "offload", version: "0.1.0", extra: { apiUrl: "https://api.example.test" } } } }));
vi.mock("@better-auth/expo/client", () => ({ expoClient: () => ({ id: "expo" }) }));
vi.mock("better-auth/react", () => ({
  createAuthClient: (options: typeof authOptions) => {
    authOptions = options;
    return { signOut: () => Promise.resolve(), signIn: { social: () => Promise.resolve({ error: null }) }, getCookie: () => "" };
  },
}));

await import("../lib/auth");
const { attemptHeaders, forgetAttempt, rememberAttempt } = await import("../lib/attempt");
const { redeemCode } = await import("../lib/code");
const { GATE } = await import("../lib/gate");

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

let sent: Array<{ url: string; init?: RequestInit | undefined }> = [];
let reply: () => Promise<Response> = () => Promise.resolve(new Response(JSON.stringify({ status: "in" })));

beforeEach(() => {
  forgetAttempt();
  sent = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    sent.push({ url, init });
    return reply();
  });
});

describe("the refusal's proof", () => {
  it("is kept from a refused sign-in's set-cookie, among others", () => {
    rememberAttempt("better-auth.state=x; Path=/, offload_attempt=YWJj.123.mac; Path=/; Max-Age=600; HttpOnly");
    expect(attemptHeaders()).toEqual({ cookie: "offload_attempt=YWJj.123.mac" });
  });

  it("is nothing without one, and forgotten when cleared", () => {
    rememberAttempt(null);
    expect(attemptHeaders()).toEqual({});
    rememberAttempt("offload_attempt=YWJj.123.mac; Path=/");
    rememberAttempt("offload_attempt=; Path=/; Max-Age=0");
    expect(attemptHeaders()).toEqual({});
  });

  it("is read off every refused auth request by the auth client itself", () => {
    const headers = new Headers({ "set-cookie": "offload_attempt=YWJj.9.mac; Path=/" });
    authOptions.fetchOptions!.onError!({ response: new Response(null, { status: 400, headers }) });
    expect(attemptHeaders()).toEqual({ cookie: "offload_attempt=YWJj.9.mac" });
  });
});

describe("using a code", () => {
  it("posts the code with the proof, and spends the proof when it lets them in", async () => {
    rememberAttempt("offload_attempt=YWJj.123.mac; Path=/");
    reply = () => Promise.resolve(new Response(JSON.stringify({ status: "in" })));
    expect(await redeemCode("abcd-efgh-jkmn")).toBe("in");
    expect(sent[0]!.url).toBe("https://api.example.test/api/sign-in/code");
    expect(sent[0]!.init).toMatchObject({ method: "POST", headers: { "content-type": "application/json", cookie: "offload_attempt=YWJj.123.mac" } });
    expect(JSON.parse(String(sent[0]!.init!.body))).toEqual({ code: "abcd-efgh-jkmn" });
    expect(attemptHeaders()).toEqual({});
  });

  it("passes on refused and sign-in, and calls a request that never landed failed", async () => {
    reply = () => Promise.resolve(new Response(JSON.stringify({ status: "refused" })));
    expect(await redeemCode("x")).toBe("refused");
    reply = () => Promise.resolve(new Response(JSON.stringify({ status: "sign-in" })));
    expect(await redeemCode("x")).toBe("sign-in");
    reply = () => Promise.reject(new Error("offline"));
    expect(await redeemCode("x")).toBe("failed");
    reply = () => Promise.resolve(new Response("{}", { status: 500 }));
    expect(await redeemCode("x")).toBe("failed");
  });
});

describe("the words, from the one copy both phones read", () => {
  it("are short, with the way forward beside each refusal", () => {
    expect(GATE.code).toEqual({
      open: "Have a code?",
      placeholder: "Your code",
      use: "Use code",
      refused: "That code did not work.",
      signIn: "Sign in again to use a code.",
      failed: "That did not go through, try again.",
      signInButton: "Sign in",
    });
    expect(GATE.admitted).toEqual({ title: "You are in", sub: "Sign in once more with the same account.", signIn: "Sign in" });
  });
});

describe("both no-invite screens", () => {
  for (const file of ["components/screens/NoInvite.ios.tsx", "components/screens/NoInvite.android.tsx"]) {
    it(`${file} sends the proof with the attempt read and offers a code only with an address`, () => {
      const source = read(file);
      expect(source).toContain("fetch(`${API_URL}/api/sign-in/attempt`, { headers: attemptHeaders() })");
      expect(source).toMatch(/\{email && !disabled \? \(\s*<HaveACode/);
      expect(source).toContain("admitted ? GATE.admitted");
    });
  }

  it("share one code entry, which uses the code copy and the redemption", () => {
    const source = read("components/screens/HaveACode.tsx");
    expect(source).toContain("redeemCode(code)");
    for (const key of ["open", "placeholder", "use", "refused", "signIn", "failed", "signInButton"]) {
      expect(source).toContain(`GATE.code.${key}`);
    }
  });
});
