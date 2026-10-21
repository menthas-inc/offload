// 046 Today glass, the phones. Shape tests over the source, the house pattern.
//
//   pnpm --filter @offload/mobile test today-glass

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("046 de-band, Today only (AC-1)", () => {
  it("pins every Today section to the raised ground and draws no band fill", () => {
    const band = read("components/today/Band.tsx");
    // The context is forced on, not alternated: cards are raised everywhere.
    expect(band).toMatch(/BandContext\.Provider value=\{true\}/);
    expect(band).not.toMatch(/const inBand = index % 2/);
    // Off-Today is untouched: the shared helpers and the fill are unchanged.
    expect(band).toMatch(/export function useInBand\(/);
    expect(band).toMatch(/isAndroid \? "bg-a-c-low" : "bg-surface-fill"/);
  });
});

describe("046 field (AC-2), drift (AC-4)", () => {
  it("is static images from the shared layout, never a shader", () => {
    const f = read("components/today/TodayField.tsx");
    expect(f).toMatch(/TODAY_FIELD/);
    expect(f).toMatch(/from "react-native"/);
    expect(f).toMatch(/Image/);
    expect(f).not.toMatch(/react-native-skia/);
  });
  it("drifts on the UI thread, paused on blur and stilled under reduce motion", () => {
    const f = read("components/today/TodayField.tsx");
    expect(f).toMatch(/useReduceMotion/);
    expect(f).toMatch(/useFocusEffect/);
    expect(f).toMatch(/withRepeat/);
    expect(f).toMatch(/cancelAnimation/);
    // Reduce motion short-circuits before the loop starts.
    expect(f).toMatch(/if \(reduce\)/);
  });
  it("is mounted behind Today's content", () => {
    expect(read("components/today/TodayScreen.tsx")).toMatch(/<TodayField \/>/);
  });
});

describe("046 one reduce-motion reader (AC-4)", () => {
  it("the shared hook exists", () => {
    expect(read("lib/reduce-motion.ts")).toMatch(/export function useReduceMotion\(\): boolean/);
  });
});

describe("046 plate and sheet glass (AC-5, AC-7, AC-8)", () => {
  it("GlassBackdrop blurs on iOS and is opaque on Android / reduce transparency", () => {
    const g = read("components/shell/GlassBackdrop.tsx");
    expect(g).toMatch(/from "expo-blur"/);
    expect(g).toMatch(/isReduceTransparencyEnabled/);
    expect(g).toMatch(/isAndroid \|\| reduceTransparency/);
    expect(g).toMatch(/bg-surface-plate/);
  });
  it("the plate shows the glass and mounts the prism pulse only while filing", () => {
    const p = read("components/shell/Plate.tsx");
    expect(p).toMatch(/<GlassBackdrop \/>/);
    expect(p).toMatch(/\$\{CORNERS\} overflow-hidden/);
    expect(p).toMatch(/pulseAt \? \(/);
    expect(p).toMatch(/arriveOnMount/);
  });
  it("the conversation sheet uses the same glass", () => {
    expect(read("components/shell/Conversation.tsx")).toMatch(/<GlassBackdrop sheet \/>/);
  });
});
