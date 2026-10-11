// 030 T4.11. The phones' map rules: the List or Map choice kept per thread on
// the phone, whether a map may be drawn at all, and what the bar holds while
// the switch is in it.

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const classes = new Map<string, unknown>();
let broken = false;
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => {
    if (broken) throw new Error("locked");
    return store.get(key) ?? null;
  },
  setItem: (key: string, value: string, options?: { keychainAccessible?: unknown }) => {
    if (broken) throw new Error("locked");
    store.set(key, value);
    classes.set(key, options?.keychainAccessible);
  },
  deleteItemAsync: async () => undefined,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afu-device-only",
}));

const { MAP_VIEWS_KEPT, readView, writeView, mapsReady, barTools, emptyLine } = await import("../lib/map-view");

beforeEach(() => {
  store.clear();
  broken = false;
});

describe("the List or Map choice", () => {
  // Thread ids are the account's: a backup restored onto another phone
  // carries nothing of them (security review of PR 108).
  it("is kept for this device only", () => {
    writeView("t1", "map");
    expect(classes.get("offload_map_views")).toBe("afu-device-only");
  });

  it("is List until a thread is left on Map, per thread", () => {
    expect(readView("t1")).toBe("list");
    writeView("t1", "map");
    expect(readView("t1")).toBe("map");
    expect(readView("t2")).toBe("list");
    writeView("t1", "list");
    expect(readView("t1")).toBe("list");
  });

  it("keeps only the most recent threads left on Map, small enough for one stored value", () => {
    const id = (i: number) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
    for (let i = 0; i < MAP_VIEWS_KEPT + 5; i++) writeView(id(i), "map");
    expect(readView(id(0))).toBe("list");
    expect(readView(id(MAP_VIEWS_KEPT + 4))).toBe("map");
    const raw = [...store.values()][0]!;
    expect(raw.length).toBeLessThan(2048);
  });

  it("survives a store that throws or holds rubbish", () => {
    broken = true;
    expect(readView("t1")).toBe("list");
    expect(() => writeView("t1", "map")).not.toThrow();
    broken = false;
    store.set("offload_map_views", "{not json");
    expect(readView("t1")).toBe("list");
  });
});

describe("whether a map is drawn (AC-28)", () => {
  it("needs the server's switch, a key in this build, and a point", () => {
    expect(mapsReady({ serverOn: true, available: true, hasPoint: true })).toBe(true);
    expect(mapsReady({ serverOn: false, available: true, hasPoint: true })).toBe(false);
    expect(mapsReady({ serverOn: true, available: false, hasPoint: true })).toBe(false);
    expect(mapsReady({ serverOn: true, available: true, hasPoint: false })).toBe(false);
  });
});

describe("the bar with the switch in it (AC-13)", () => {
  it("moves labels and calendars to the top of More", () => {
    expect(barTools({ switchShown: true, labels: true, calendars: true })).toEqual({ inBar: [], moreFirst: ["labels", "calendars"] });
    expect(barTools({ switchShown: true, labels: false, calendars: true })).toEqual({ inBar: [], moreFirst: ["calendars"] });
  });

  it("leaves the bar as it was without the switch", () => {
    expect(barTools({ switchShown: false, labels: true, calendars: true })).toEqual({ inBar: ["labels", "calendars"], moreFirst: [] });
  });
});

describe("a pick with nothing on the map (AC-19)", () => {
  it("says what the list says, in the same words", () => {
    expect(emptyLine(["Stay", "Food"])).toBe("Nothing under Stay and Food on the map.");
    expect(emptyLine([])).toBe("Nothing without a label on the map.");
  });
});
