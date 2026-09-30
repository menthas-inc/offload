import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios", select: (o: Record<string, unknown>) => o["ios"] } }));
vi.mock("nativewind", () => ({ useColorScheme: () => ({ colorScheme: "light" }) }));

const { paletteFor } = await import("../lib/colors");
const { resolved } = await import("@offload/tokens");

describe("the scrim", () => {
  // Found in review, 2026-09-30: the scrim was the `ink-950` ramp, which flips
  // to #EDEDED in dark, so every sheet dimmed the page to white and the
  // receded page sat on a white ground under light status bar text.
  it("is dark ink in both themes", () => {
    expect(paletteFor(true).scrim).toBe(paletteFor(false).scrim);
    expect(paletteFor(false).scrim).toBe(resolved.light["ink-950"]);
  });
});

describe("the plate's shadow", () => {
  // Found on the Pixel, 2026-09-30: the plate drew no shadow on Android.
  // `elevation` is Android's only reading of the old shadow props, and its
  // light sits above the screen, so a plate lit from above casts nothing
  // upward. The kits draw `--shadow-sheet`, which is a box-shadow, and React
  // Native draws a box-shadow on both platforms.
  it("is the sheet shadow token in each theme", () => {
    expect(paletteFor(false).plateShadow).toBe(resolved.light["shadow-sheet"]);
    expect(paletteFor(true).plateShadow).toBe(resolved.dark["shadow-sheet"]);
  });
});
