// 037. The thread icon rules every surface shares.
//
// The word list, the pick, the hue, where the wash sits and the colours the
// phones mix by hand, in @offload/widgets so the server and both clients
// cannot disagree about what a thread looks like.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_THREAD_ICON,
  HUE_NAMES,
  THREAD_ICONS,
  THREAD_ICON_NAMES,
  isThreadIcon,
  leastUsedHue,
  mixOklch,
  pickThreadIcon,
  previewThreadIcon,
  threadChange,
  threadIconColors,
  threadIconLabel,
  threadLookAfter,
  threadSeed,
  threadWash,
} from "@offload/widgets";

describe("the list", () => {
  it("is seventy glyphs, each once, each with words", () => {
    expect(THREAD_ICONS).toHaveLength(70);
    expect(new Set(THREAD_ICON_NAMES).size).toBe(70);
    expect(THREAD_ICONS.every((one) => one.words.length > 0)).toBe(true);
    expect(THREAD_ICON_NAMES[0]).toBe("luggage");
    expect(THREAD_ICON_NAMES[69]).toBe("calendar-heart");
  });

  it("knows its own and lasso, and nothing else", () => {
    expect(isThreadIcon("gift")).toBe(true);
    expect(isThreadIcon(DEFAULT_THREAD_ICON)).toBe(true);
    expect(isThreadIcon("../secret")).toBe(false);
    expect(isThreadIcon("globe-2")).toBe(false);
  });

  it("names ten hues", () => {
    expect(HUE_NAMES).toHaveLength(10);
    expect(new Set(HUE_NAMES).size).toBe(10);
  });
});

describe("the pick", () => {
  it("takes the first glyph in order with a word in the name", () => {
    expect(pickThreadIcon("Lisbon trip")).toBe("luggage");
    expect(pickThreadIcon("Dentist")).toBe("stethoscope");
    // `party` is cake's before it is party-popper's.
    expect(pickThreadIcon("Party")).toBe("cake");
    // trip (1) comes before flights (2).
    expect(pickThreadIcon("flights for the trip")).toBe("luggage");
  });

  it("tolerates a plural s both ways", () => {
    expect(pickThreadIcon("Gift ideas")).toBe("gift");
    expect(pickThreadIcon("gifts")).toBe("gift");
    expect(pickThreadIcon("Recipe")).toBe("utensils");
    expect(pickThreadIcon("Trips")).toBe("luggage");
  });

  it("splits on anything that is not a letter or a digit", () => {
    expect(pickThreadIcon("mum's-birthday!")).toBe("cake");
    expect(pickThreadIcon("TAXES/2026")).toBe("receipt");
  });

  it("matches whole words only", () => {
    expect(pickThreadIcon("Carpet")).toBeNull();
    expect(pickThreadIcon("Scatter")).toBeNull();
  });

  it("is null with no match", () => {
    expect(pickThreadIcon("Misc")).toBeNull();
    expect(pickThreadIcon("")).toBeNull();
  });
});

describe("the hue", () => {
  it("is the least used, ties to the lowest", () => {
    expect(leastUsedHue([])).toBe(1);
    expect(leastUsedHue([1])).toBe(2);
    expect(leastUsedHue([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(1);
    expect(leastUsedHue([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2])).toBe(3);
    expect(leastUsedHue([2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 1])).toBe(2);
  });

  it("ignores what is not a hue", () => {
    expect(leastUsedHue([0, 11, 1])).toBe(2);
  });
});

describe("the wash", () => {
  it("is placed by the id's tail and is always the same", () => {
    const id = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
    const seed = threadSeed(id);
    expect(seed).toBe(0x2e3f4a5b);
    expect(threadSeed(id)).toBe(seed);
    expect(threadWash(seed)).toEqual({ x: seed % 100, y: (seed >>> 7) % 100, angle: (seed >>> 3) % 360 });
  });

  it("tells two threads made in the same millisecond apart", () => {
    expect(threadSeed("0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b")).not.toBe(threadSeed("0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c"));
  });

  it("gives an unreadable id a seed anyway", () => {
    expect(threadSeed("new")).toBe(0);
    expect(threadWash(0)).toEqual({ x: 0, y: 0, angle: 0 });
  });
});

describe("the colours", () => {
  // Built from parts so no colour is written here as a literal: the first
  // label hue, white and black.
  const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  const BLUE = hex(12, 123, 176);
  const WHITE = hex(255, 255, 255);
  const BLACK = hex(0, 0, 0);
  const DARK_PAGE = hex(28, 27, 25);
  const channels = (colour: string) => [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16)) as [number, number, number];
  const lum = (colour: string) => {
    const [r, g, b] = channels(colour);
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };

  it("mixes in oklch, and ends at its ends", () => {
    expect(mixOklch(BLUE, WHITE, 1)).toBe(BLUE);
    expect(mixOklch(BLUE, WHITE, 0)).toBe(WHITE);
    expect(mixOklch(BLUE, BLACK, 0)).toBe(BLACK);
  });

  it("gives a light ground lighter than the hue and a glyph darker than it, and the reverse in dark", () => {
    const light = threadIconColors(BLUE, "light", WHITE);
    expect(lum(light.ground)).toBeGreaterThan(lum(BLUE));
    expect(lum(light.glyph)).toBeLessThan(lum(BLUE));
    const dark = threadIconColors(BLUE, "dark", DARK_PAGE);
    expect(lum(dark.ground)).toBeLessThan(lum(BLUE));
    expect(lum(dark.glyph)).toBeGreaterThan(lum(BLUE));
    expect(light.ring).toBe("rgba(12, 123, 176, 0.18)");
  });

  it("keeps the hue's own hue against white", () => {
    // A fifth of a blue into white is a pale blue, not a pale grey or pink.
    const [r, g, b] = channels(threadIconColors(BLUE, "light", WHITE).ground);
    expect(b).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(r);
  });
});

describe("Edit thread", () => {
  const offloads = { name: "Lisbon", icon: "plane", hue: 3, iconSetBy: "offload" as const };
  const persons = { ...offloads, iconSetBy: "person" as const };

  it("previews the icon a rename would pick, while the pick is offload's and the grid is untouched", () => {
    expect(previewThreadIcon(offloads, { name: "Dentist", icon: null })).toBe("stethoscope");
    // No match keeps what is there, as the server does.
    expect(previewThreadIcon(offloads, { name: "Lisbon 2027", icon: null })).toBe("plane");
    expect(previewThreadIcon(offloads, { name: " Lisbon ", icon: null })).toBe("plane");
    expect(previewThreadIcon(persons, { name: "Dentist", icon: null })).toBe("plane");
    expect(previewThreadIcon(offloads, { name: "Dentist", icon: "wine" })).toBe("wine");
  });

  it("sends only what changed, and nothing when nothing did", () => {
    expect(threadChange(offloads, { name: "Lisbon", icon: null, hue: 3 })).toBeNull();
    expect(threadChange(offloads, { name: "  Lisbon ", icon: "plane", hue: 3 })).toBeNull();
    expect(threadChange(offloads, { name: "Dentist", icon: null, hue: 3 })).toEqual({ name: "Dentist" });
    expect(threadChange(offloads, { name: "Lisbon", icon: "wine", hue: 3 })).toEqual({ icon: "wine" });
    expect(threadChange(offloads, { name: "Lisbon", icon: null, hue: 4 })).toEqual({ hue: 4 });
    expect(threadChange(offloads, { name: "", icon: "wine", hue: 3 })).toBeNull();
  });

  it("sends the previewed icon with a new hue, since the server picks nothing once a person has", () => {
    expect(threadChange(offloads, { name: "Dentist", icon: null, hue: 4 })).toEqual({ name: "Dentist", icon: "stethoscope", hue: 4 });
    expect(threadChange(persons, { name: "Dentist", icon: null, hue: 4 })).toEqual({ name: "Dentist", hue: 4 });
  });

  it("draws the pick as the person's once an icon or a hue was sent, and as it was after a name alone", () => {
    const shown = { name: "Dentist", icon: "stethoscope", hue: 3 };
    expect(threadLookAfter(offloads, { name: "Dentist" }, shown)).toEqual({ ...shown, iconSetBy: "offload" });
    expect(threadLookAfter(offloads, { icon: "wine" }, { name: "Lisbon", icon: "wine", hue: 3 })).toEqual({ name: "Lisbon", icon: "wine", hue: 3, iconSetBy: "person" });
    expect(threadLookAfter(offloads, { hue: 4 }, { name: "Lisbon", icon: "plane", hue: 4 }).iconSetBy).toBe("person");
    expect(threadLookAfter(persons, { name: "Dentist" }, { name: "Dentist", icon: "plane", hue: 3 }).iconSetBy).toBe("person");
  });

  it("names a glyph for a screen reader", () => {
    expect(threadIconLabel("plane")).toBe("Plane");
    expect(threadIconLabel("flower-2")).toBe("Flower");
    expect(threadIconLabel("tree-pine")).toBe("Tree pine");
    expect(threadIconLabel("gamepad-2")).toBe("Gamepad");
  });
});
