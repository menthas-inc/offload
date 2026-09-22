// The account's clock, from the phone's side. 023.
//
// Three writes to one route, each one field: Use writes the clock, Keep
// writes the zone they answered Keep to, the switch writes follow. A setter
// that sent the pair could clear a name by accident, which is the rule every
// setter in `me.ts` already keeps.

import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: { path: string; init: RequestInit }[] = [];

vi.mock("../lib/api", () => ({
  request: async (path: string, init: RequestInit = {}) => {
    sent.push({ path, init });
    return { accountId: "a", timeZone: "Asia/Tokyo", followDevice: true, keptTimeZone: null };
  },
  send: async () => ({ status: 200, data: null }),
}));
vi.mock("../lib/log", () => ({ failed: () => undefined }));

const { setClock } = await import("../lib/me");
const { zoneFor } = await import("../lib/clock");

beforeEach(() => {
  sent.length = 0;
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

describe("023 the zone a screen draws in", () => {
  it("is the account's clock, else the device's word", () => {
    expect(zoneFor("Europe/Lisbon", "Asia/Tokyo")).toBe("Europe/Lisbon");
    expect(zoneFor(null, "Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(zoneFor(undefined, null)).toBeNull();
  });
});
