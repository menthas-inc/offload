// 030 T4.3. The web map's small rules: the List or Map choice kept on the
// device, the pane width that splits the thread, and whether the web may draw
// a map at all.

import { describe, expect, it } from "vitest";
import { MAP_VIEWS_KEPT, readView, splitFor, webMapReady, writeView } from "../src/lib/map-view";

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

describe("the List or Map choice", () => {
  it("is List until a thread is left on Map, and is kept per thread", () => {
    const store = memory();
    expect(readView("t1", store)).toBe("list");
    writeView("t1", "map", store);
    expect(readView("t1", store)).toBe("map");
    expect(readView("t2", store)).toBe("list");
  });

  it("keeps the hundred most recent threads and no more", () => {
    const store = memory();
    for (let i = 0; i < MAP_VIEWS_KEPT + 5; i++) writeView(`t${i}`, "map", store);
    expect(readView("t0", store)).toBe("list");
    expect(readView(`t${MAP_VIEWS_KEPT + 4}`, store)).toBe("map");
    expect(Object.keys(JSON.parse(store.getItem("offload:map-view") ?? "{}"))).toHaveLength(MAP_VIEWS_KEPT);
  });

  it("survives storage that throws or holds rubbish", () => {
    const broken = { ...memory(), getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } as Storage;
    expect(readView("t1", broken)).toBe("list");
    expect(() => writeView("t1", "map", broken)).not.toThrow();
    const rubbish = memory();
    rubbish.setItem("offload:map-view", "{not json");
    expect(readView("t1", rubbish)).toBe("list");
  });
});

describe("the split (AC-14)", () => {
  it("splits at 1016 and wider, and unsplits below 984, with no flip in between", () => {
    expect(splitFor(1016, false)).toBe(true);
    expect(splitFor(1015, false)).toBe(false);
    expect(splitFor(1000, true)).toBe(true);
    expect(splitFor(984, true)).toBe(true);
    expect(splitFor(983, true)).toBe(false);
  });
});

describe("whether the web may draw a map (AC-28)", () => {
  it("needs the server's switch, the key and the map id", () => {
    expect(webMapReady(true, "k", "m")).toBe(true);
    expect(webMapReady(false, "k", "m")).toBe(false);
    expect(webMapReady(true, "", "m")).toBe(false);
    expect(webMapReady(true, "k", undefined)).toBe(false);
  });
});
