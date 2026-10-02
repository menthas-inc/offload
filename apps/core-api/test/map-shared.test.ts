// The map's rules every surface shares (030 T3.2).
//
// Pure functions in @offload/widgets, so the three clients cannot draw the
// same thread three ways. The gestures (tap a count dot, open a map) are
// checked on a device; what they rest on is checked here.

import { describe, expect, it } from "vitest";
import {
  calloutPadding,
  cluster,
  directionsUrl,
  fitBounds,
  hitCircle,
  pointFill,
  pointPasses,
  pointShape,
  splitZoom,
  calloutPan,
  kindWord,
  metresPerPixel,
  panned,
  screenOf,
  worldPixel,
  zoomOf,
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
  it("merges points closer than a finger's target and keeps apart ones further", () => {
    const groups = cluster([
      { key: "a", x: 100, y: 100 },
      { key: "b", x: 120, y: 110 },
      { key: "c", x: 300, y: 300 },
    ]);
    expect(groups.map((g) => g.keys.sort())).toEqual([["a", "b"], ["c"]]);
    expect(groups[0]!.x).toBe(110);
    expect(groups[0]!.y).toBe(105);
  });

  it("splits a pair once they are a target apart", () => {
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
  it("is 190 or 40% of the height, whichever is less", () => {
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

describe("splitZoom", () => {
  it("separates a count dot's points, past the opening fit's limit", () => {
    const view = { width: 390, height: 600 };
    const padding = { top: 70, right: 28, bottom: 40, left: 28 };
    const fit = splitZoom([{ lat: 38.71, lng: -9.146 }, { lat: 38.7101, lng: -9.1461 }], view, padding);
    expect(fit.zoom).toBeGreaterThan(15);
    expect(fit.zoom).toBeLessThanOrEqual(21);
  });
});

describe("hitCircle", () => {
  // About 1.2m a pixel at zoom 17 in Lisbon; 300m is drawn large there.
  const near = 1.2;
  const circles = [
    { key: "alfama", lat: 38.7113, lng: -9.1301 },
    { key: "graca", lat: 38.7163, lng: -9.1301 },
  ];

  it("picks the circle a tap lands inside", () => {
    expect(hitCircle({ lat: 38.7123, lng: -9.1301 }, circles, near)).toBe("alfama");
  });

  it("picks the nearer centre when two circles overlap", () => {
    expect(hitCircle({ lat: 38.7136, lng: -9.1301 }, circles, near)).toBe("alfama");
    expect(hitCircle({ lat: 38.7141, lng: -9.1301 }, circles, near)).toBe("graca");
  });

  it("misses outside every circle", () => {
    expect(hitCircle({ lat: 38.73, lng: -9.1301 }, circles, near)).toBeNull();
  });

  it("gives a circle drawn smaller than a finger a target of its own", () => {
    // Zoomed far out, 300m is a few pixels; a tap 15 pixels from the centre
    // still picks it.
    const far = 500;
    const tap = { lat: 38.7113 + (15 * far) / 111_320, lng: -9.1301 };
    expect(hitCircle(tap, circles.slice(0, 1), far)).toBe("alfama");
  });
});

describe("pointPasses (AC-19, AC-15)", () => {
  const point = (labelIds: string[], source: "row" | "calendar" = "row") => ({ labelIds, source });
  it("lets everything through with no pick", () => {
    expect(pointPasses(point([]), { labels: [], none: false })).toBe(true);
    expect(pointPasses(point([], "calendar"), { labels: [], none: false })).toBe(true);
  });
  it("keeps a row carrying a picked label, or no label when that is picked", () => {
    expect(pointPasses(point(["food"]), { labels: ["food"], none: false })).toBe(true);
    expect(pointPasses(point(["stay"]), { labels: ["food"], none: false })).toBe(false);
    expect(pointPasses(point([]), { labels: [], none: true })).toBe(true);
    expect(pointPasses(point(["stay"]), { labels: [], none: true })).toBe(false);
  });
  it("hides a calendar's event under any pick, since it carries no labels", () => {
    expect(pointPasses(point([], "calendar"), { labels: [], none: true })).toBe(false);
    expect(pointPasses(point([], "calendar"), { labels: ["food"], none: false })).toBe(false);
  });
});

describe("screen positions without the map's projection (T4.12)", () => {
  it("puts a point in world pixels on Web Mercator", () => {
    expect(worldPixel({ lat: 0, lng: 0 }, 0)).toEqual({ x: 128, y: 128 });
    const a = worldPixel({ lat: 38.7069, lng: -9.1459 }, 15);
    const b = worldPixel({ lat: 38.7069, lng: -9.1449 }, 15);
    // A thousandth of a degree of longitude at zoom 15 is about 23 pixels.
    expect(b.x - a.x).toBeCloseTo(23.3, 1);
    expect(b.y).toBeCloseTo(a.y, 6);
  });

  it("knows how many metres a pixel covers, shrinking toward the poles", () => {
    expect(metresPerPixel(0, 0)).toBeCloseTo(156_543, 0);
    expect(metresPerPixel(60, 10)).toBeCloseTo(156_543.03392 / 2 / 1024, 3);
  });

  it("reads a zoom from the span a phone's map reports", () => {
    // 390 points showing a twentieth of a degree is about zoom 13.
    expect(zoomOf(0.05, 390)).toBeCloseTo(Math.log2((390 / 256) * (360 / 0.05)), 6);
    expect(zoomOf(360, 256)).toBeCloseTo(0, 6);
  });
});

describe("what a point is called (AC-17)", () => {
  it("uses the vocabulary's words", () => {
    expect(["location", "event", "link", "task"].map(kindWord)).toEqual(["place", "event", "link", "to-do"]);
  });
});

describe("keeping the callout inside the frame (AC-17)", () => {
  const camera = { center: { lat: 38.71, lng: -9.14 }, zoom: 14 };
  const size = { width: 390, height: 600 };

  it("places a point on screen from the camera alone", () => {
    expect(screenOf(camera.center, camera, size)).toEqual({ x: 195, y: 300 });
    const east = screenOf({ lat: 38.71, lng: -9.13 }, camera, size);
    expect(east.x).toBeGreaterThan(195);
    expect(east.y).toBeCloseTo(300, 6);
  });

  it("pans nothing when the callout already fits", () => {
    expect(calloutPan({ x: 195, y: 300 }, size)).toEqual({ dx: 0, dy: 0 });
  });

  it("pans a point near an edge or the top far enough for the callout", () => {
    expect(calloutPan({ x: 40, y: 300 }, size)).toEqual({ dx: -86, dy: 0 });
    expect(calloutPan({ x: 380, y: 300 }, size)).toEqual({ dx: 116, dy: 0 });
    expect(calloutPan({ x: 195, y: 100 }, size)).toEqual({ dx: 0, dy: -90 });
  });

  it("moves the camera by that many pixels", () => {
    const moved = panned(camera, 100, 0);
    expect(screenOf(camera.center, { ...camera, center: moved }, size).x).toBeCloseTo(95, 6);
  });
});
