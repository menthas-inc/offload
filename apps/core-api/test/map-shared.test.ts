// The map's rules every surface shares (030 T3.2).
//
// Pure functions in @offload/widgets, so the three clients cannot draw the
// same thread three ways. The gestures (tap a count dot, open a map) are
// checked on a device; what they rest on is checked here.

import { describe, expect, it } from "vitest";
import {
  ANDROID_DARK_STYLE,
  calloutPadding,
  cluster,
  directionsUrl,
  fitBounds,
  pointFill,
  pointShape,
} from "@offload/widgets";

const labels = [
  { id: "food", colour: 3 },
  { id: "stay", colour: 7 },
  { id: "walk", colour: 1 },
];

describe("pointFill", () => {
  it("is ink with no label", () => {
    expect(pointFill([], labels)).toEqual({ a: null, b: null });
  });

  it("is the label's colour with one", () => {
    expect(pointFill(["stay"], labels)).toEqual({ a: 7, b: null });
  });

  it("splits for two, in the thread's label order rather than the row's", () => {
    expect(pointFill(["stay", "food"], labels)).toEqual({ a: 3, b: 7 });
  });

  it("draws the first two of three or more", () => {
    expect(pointFill(["walk", "stay", "food"], labels)).toEqual({ a: 3, b: 7 });
  });

  it("ignores a label the thread does not have", () => {
    expect(pointFill(["gone", "walk"], labels)).toEqual({ a: 1, b: null });
  });
});

describe("pointShape", () => {
  it("is a square for an event, offload's or a calendar's, and a dot otherwise", () => {
    expect(pointShape("event", "row")).toBe("square");
    expect(pointShape("event", "calendar")).toBe("square");
    expect(pointShape("location", "row")).toBe("dot");
    expect(pointShape("link", "row")).toBe("dot");
  });
});

describe("cluster", () => {
  it("merges points closer than 44px and keeps apart ones further", () => {
    const groups = cluster([
      { key: "a", x: 100, y: 100 },
      { key: "b", x: 120, y: 110 },
      { key: "c", x: 300, y: 300 },
    ]);
    expect(groups.map((g) => g.keys.sort())).toEqual([["a", "b"], ["c"]]);
    expect(groups[0]!.x).toBe(110);
    expect(groups[0]!.y).toBe(105);
  });

  it("splits a pair once they are 44px apart", () => {
    expect(cluster([{ key: "a", x: 0, y: 0 }, { key: "b", x: 44, y: 0 }])).toHaveLength(2);
    expect(cluster([{ key: "a", x: 0, y: 0 }, { key: "b", x: 43, y: 0 }])).toHaveLength(1);
  });

  it("gives the same groups whatever order the points arrive in", () => {
    const points = [
      { key: "a", x: 0, y: 0 },
      { key: "b", x: 30, y: 0 },
      { key: "c", x: 60, y: 0 },
    ];
    const one = cluster(points).map((g) => g.keys.sort().join());
    const two = cluster([...points].reverse()).map((g) => g.keys.sort().join());
    expect(one.sort()).toEqual(two.sort());
  });
});

describe("fitBounds", () => {
  const view = { width: 390, height: 600 };
  const padding = { top: 70, right: 28, bottom: 40, left: 28 };

  it("opens one point at zoom 15, centred in the padded frame", () => {
    // The padding is uneven (70 top, 40 bottom), so the point sits in the
    // middle of what is left, a few metres off the view's own centre.
    const fit = fitBounds([{ lat: 38.7101, lng: -9.1459 }], view, padding);
    expect(fit.zoom).toBe(15);
    expect(fit.center.lat).toBeCloseTo(38.7101, 2);
    expect(fit.center.lng).toBeCloseTo(-9.1459, 3);
    expect(fit.center.lat).toBeGreaterThan(38.7101);
  });

  it("caps the opening fit at 15 for points a few metres apart", () => {
    const fit = fitBounds([{ lat: 38.71, lng: -9.146 }, { lat: 38.7101, lng: -9.1461 }], view, padding);
    expect(fit.zoom).toBe(15);
  });

  it("lets a cluster's split go past 15", () => {
    const fit = fitBounds([{ lat: 38.71, lng: -9.146 }, { lat: 38.7101, lng: -9.1461 }], view, padding, 21);
    expect(fit.zoom).toBeGreaterThan(15);
  });

  it("fits points across a city inside the padding", () => {
    const points = [{ lat: 38.75, lng: -9.2 }, { lat: 38.69, lng: -9.1 }];
    const fit = fitBounds(points, view, padding);
    expect(fit.zoom).toBeLessThan(15);
    expect(fit.zoom).toBeGreaterThan(9);
    expect(fit.center.lng).toBeCloseTo(-9.15, 2);
  });
});

describe("calloutPadding", () => {
  it("is 190px or 40% of the height, whichever is less", () => {
    expect(calloutPadding(800)).toBe(190);
    expect(calloutPadding(400)).toBe(160);
  });
});

describe("directionsUrl", () => {
  it("is Google Maps' directions link with the coordinates and nothing else", () => {
    expect(directionsUrl({ lat: 38.7101, lng: -9.1459, googlePlaceId: null })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=38.7101%2C-9.1459",
    );
  });

  it("adds Google's place id when there is one", () => {
    expect(directionsUrl({ lat: 38.7101, lng: -9.1459, googlePlaceId: "ChIJ_abc-1" })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=38.7101%2C-9.1459&destination_place_id=ChIJ_abc-1",
    );
  });
});

describe("ANDROID_DARK_STYLE", () => {
  it("is a style array Google's SDK accepts", () => {
    expect(Array.isArray(ANDROID_DARK_STYLE)).toBe(true);
    expect(ANDROID_DARK_STYLE.length).toBeGreaterThan(0);
    for (const rule of ANDROID_DARK_STYLE) expect(Array.isArray(rule.stylers)).toBe(true);
  });
});
