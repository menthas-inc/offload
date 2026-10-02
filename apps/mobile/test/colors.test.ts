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

// 027 AC-31: the scrim's opacity is the token's, per theme, and typed nowhere.
describe("the scrim's opacity", () => {
  it("is --surface-scrim's alpha in each theme", () => {
    const alpha = (value: string) => Number(/,\s*([\d.]+)\)$/.exec(value)?.[1]);
    expect(paletteFor(false).scrimOpacity).toBe(alpha(resolved.light["surface-scrim"]!));
    expect(paletteFor(true).scrimOpacity).toBe(alpha(resolved.dark["surface-scrim"]!));
    expect(paletteFor(false).scrimOpacity).toBe(0.35);
  });

  it("is never typed by hand", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of ["lib/colors.ts", "components/shell/DragSheet.tsx"]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/SCRIM_OPACITY\s*=\s*0\.|scrim\s*=\s*0\./);
    }
  });
});

// 027: a card of rows paints its own ground under each row's swipe.
describe("the fill", () => {
  it("is --surface-fill", () => {
    expect(paletteFor(false).fill).toBe(resolved.light["surface-fill"]);
    expect(paletteFor(true).fill).toBe(resolved.dark["surface-fill"]);
  });
});

describe("the map's values (030)", () => {
  it("are the label tokens, ink for none, the paper ring and the point shadows", () => {
    const light = paletteFor(false);
    expect(light.labels[5]).toBe(resolved.light["label-5"]);
    expect(light.labels[10]).toBe(resolved.light["label-10"]);
    expect(light.labels[0]).toBe(resolved.light["text-primary"]);
    expect(paletteFor(true).paper).toBe(resolved.dark["paper"]);
    expect(light.shadowPoint).toBe(resolved.light["shadow-point"]);
    expect(light.shadowPointPicked).toBe(resolved.light["shadow-point-picked"]);
    expect(light.shadowCallout).toBe(resolved.light["shadow-callout"]);
    // A chip floating over the map: --shadow-1, which is no shadow in dark.
    expect(light.shadowRaised).toBe(resolved.light["shadow-1"]);
    expect(paletteFor(true).shadowRaised).toBe("none");
  });
});
