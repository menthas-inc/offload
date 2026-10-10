// The token goes before the session does, and once more if the first call
// did not land. 024, from the security review of 2026-09-22 (L5): a token
// left bound past a sign-out is the last account's words on the next
// person's lock screen, and the phone has no later chance, because the
// session it needs is about to end.

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const bodies: unknown[] = [];
let answers: (() => Promise<Response>)[] = [];

vi.mock("../lib/auth", () => ({
  API_URL: "https://api.test",
  authClient: { getCookie: () => "better-auth.session_token=x" },
}));

const { deletePushToken, registerPushToken } = await import("../lib/api");

beforeEach(() => {
  calls.length = 0;
  answers = [];
  bodies.length = 0;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push(url);
    if (typeof init?.body === "string") bodies.push(JSON.parse(init.body));
    const next = answers.shift();
    return next ? next() : Promise.reject(new Error("no answer"));
  });
});

const ok = () => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
const down = () => Promise.resolve(new Response("", { status: 503 }));

describe("deleting the token before sign-out", () => {
  it("asks once when the first call lands", async () => {
    answers = [ok];
    expect(await deletePushToken("ExponentPushToken[phone]")).toBe(true);
    expect(calls).toEqual(["https://api.test/v1/push-tokens"]);
  });

  it("asks once more when the first call fails, and says whether either landed", async () => {
    answers = [down, ok];
    expect(await deletePushToken("ExponentPushToken[phone]")).toBe(true);
    expect(calls).toHaveLength(2);
    answers = [down, down];
    expect(await deletePushToken("ExponentPushToken[phone]")).toBe(false);
    expect(calls).toHaveLength(4);
  });
});

describe("042 registering the token", () => {
  it("says this phone takes a reminder of its own, since this build has the channel and the door", async () => {
    answers = [ok];
    expect(await registerPushToken("ExponentPushToken[phone]", "android")).toBe(true);
    expect(bodies).toEqual([{ token: "ExponentPushToken[phone]", platform: "android", takes: ["reminder"] }]);
  });
});
