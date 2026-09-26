// The token goes before the session does, and once more if the first call
// did not land. 024, from the security review of 2026-09-22 (L5): a token
// left bound past a sign-out is the last account's words on the next
// person's lock screen, and the phone has no later chance, because the
// session it needs is about to end.

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let answers: (() => Promise<Response>)[] = [];

vi.mock("../lib/auth", () => ({
  API_URL: "https://api.test",
  authClient: { getCookie: () => "better-auth.session_token=x" },
}));

const { deletePushToken } = await import("../lib/api");

beforeEach(() => {
  calls.length = 0;
  answers = [];
  vi.stubGlobal("fetch", (url: string) => {
    calls.push(url);
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
