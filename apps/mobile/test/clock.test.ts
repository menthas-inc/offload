// The account's clock, from the phone's side. 023.
//
// Three writes to one route, each one field: Use writes the clock, Keep
// writes the zone they answered Keep to, the switch writes follow. A setter
// that sent the pair could clear a name by accident, which is the rule every
// setter in `me.ts` already keeps.

import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: { path: string; init: RequestInit }[] = [];

/** Held answers, for a request still out when the session ends. */
let hold = false;
const held: (() => void)[] = [];
const later = <T,>(value: T): Promise<T> =>
  hold ? new Promise((resolve) => held.push(() => resolve(value))) : Promise.resolve(value);
const ME = { accountId: "a", timeZone: "Asia/Tokyo", followDevice: true, keptTimeZone: null };

vi.mock("../lib/api", () => ({
  request: async (path: string, init: RequestInit = {}) => {
    sent.push({ path, init });
    return later(ME);
  },
  send: async () => later({ status: 200, data: ME }),
}));
vi.mock("../lib/log", () => ({ failed: () => undefined }));
const signedOut: (() => void)[] = [];
vi.mock("../lib/auth", () => ({ onSignedOut: (listener: () => void) => signedOut.push(listener) }));

const { currentMe, ensureMe, refreshMe, setClock } = await import("../lib/me");
const { zoneFor } = await import("../lib/clock");

beforeEach(() => {
  sent.length = 0;
  hold = false;
  held.length = 0;
});

describe("023 AC-3 the clock's writes", () => {
  it("Use writes the clock and nothing else", async () => {
    const me = await setClock({ timeZone: "Asia/Tokyo" });
    expect(me?.timeZone).toBe("Asia/Tokyo");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.path).toBe("/api/me");
    expect(sent[0]!.init.method).toBe("PATCH");
    expect(JSON.parse(String(sent[0]!.init.body))).toEqual({ timeZone: "Asia/Tokyo" });
  });

  it("Keep writes what was kept; the switch writes follow", async () => {
    await setClock({ keptTimeZone: "Asia/Tokyo" });
    await setClock({ followDevice: false });
    expect(sent.map((call) => JSON.parse(String(call.init.body)))).toEqual([
      { keptTimeZone: "Asia/Tokyo" },
      { followDevice: false },
    ]);
  });
});

describe("the identity goes with the session", () => {
  it("forgets who was signed in once sign-out has ended the session", async () => {
    await setClock({ timeZone: "Asia/Tokyo" });
    expect(currentMe()?.timeZone).toBe("Asia/Tokyo");
    for (const listener of signedOut) listener();
    expect(currentMe()).toBeNull();
  });

  // From the security review of PR 108: a read or a write still out when the
  // session ended answered afterwards, and the last account's identity was
  // back in the cache for the next one.
  it("keeps no answer to a request that was out when the session ended", async () => {
    for (const listener of signedOut) listener();
    hold = true;
    const asked = [ensureMe(), refreshMe(), setClock({ timeZone: "Asia/Tokyo" })];
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const listener of signedOut) listener();
    for (const answer of held) answer();
    await Promise.all(asked);
    expect(currentMe()).toBeNull();
  });
});

describe("023 the zone a screen draws in", () => {
  it("is the account's clock, else the device's word", () => {
    expect(zoneFor("Europe/Lisbon", "Asia/Tokyo")).toBe("Europe/Lisbon");
    expect(zoneFor(null, "Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(zoneFor(undefined, null)).toBeNull();
  });
});
