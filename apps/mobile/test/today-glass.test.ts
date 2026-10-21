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

describe("046 field (AC-2), still (owner, 2026-10-21)", () => {
  it("is static images from the shared layout, never a shader", () => {
    const f = read("components/today/TodayField.tsx");
    expect(f).toMatch(/TODAY_FIELD/);
    expect(f).toMatch(/from "react-native"/);
    expect(f).toMatch(/Image/);
    expect(f).not.toMatch(/react-native-skia/);
  });
  it("does not move: no animation of any kind", () => {
    const f = read("components/today/TodayField.tsx");
    expect(f).not.toMatch(/react-native-reanimated/);
    expect(f).not.toMatch(/withRepeat|useSharedValue|useAnimatedStyle/);
  });
  it("is mounted behind Today's content", () => {
    expect(read("components/today/TodayScreen.tsx")).toMatch(/<TodayField \/>/);
  });
  it("covers at least the screen: the scroll content grows to fill it", () => {
    // A short Today ended the field where the content ended (owner, 2026-10-21).
    expect(read("components/today/TodayScreen.tsx")).toMatch(/contentContainerClassName="grow pb-space-8"/);
  });
});

describe("046 small grey text never sits on the field (AC-3)", () => {
  // Found by the live check: the calendar's empty days and the section counts
  // drew --text-tertiary straight onto the densest bloom.
  it("the two-week calendar sits on one raised card", () => {
    const screen = read("components/today/TodayScreen.tsx");
    const at = screen.indexOf("<MonthGrid");
    expect(screen.slice(at - 120, at)).toMatch(/<Ground className=\{`\$\{cardShape\} p-space-4`\}>/);
  });
  it("a section count is a small raised pill", () => {
    const head = read("components/today/DayParts.tsx");
    const fn = head.slice(head.indexOf("export function SectionHead"), head.indexOf("export function EventsStrip"));
    expect(fn).toMatch(/rounded-pill bg-surface-raised/);
  });
});

describe("046 plate and sheet glass (AC-5, AC-7, AC-8)", () => {
  it("GlassBackdrop blurs on iOS and Android 12+, opaque below 12, under reduce transparency, and for the Android sheet", () => {
    const g = read("components/shell/GlassBackdrop.tsx");
    expect(g).toMatch(/from "expo-blur"/);
    expect(g).toMatch(/isReduceTransparencyEnabled/);
    expect(g).toMatch(/Number\(Platform\.Version\) >= 31/);
    // Never two live blurs on Android (AC-8): the sheet stays opaque there.
    expect(g).toMatch(/\(isAndroid && \(sheet \|\| !androidBlur\)\) \|\| reduceTransparency/);
    expect(g).toMatch(/bg-surface-plate/);
  });
  it("Android blurs the screens through one BlurTargetView, a sibling of the plate", () => {
    const g = read("components/shell/GlassBackdrop.tsx");
    expect(g).toMatch(/blurMethod="dimezisBlurViewSdk31Plus"/);
    expect(g).toMatch(/blurTarget=\{glassTarget\}/);
    const layout = read("app/_layout.tsx");
    expect(layout).toMatch(/<BlurTargetView ref=\{glassTarget\}/);
    // The plate is mounted after the target closes, never inside it.
    expect(layout.indexOf("</BlurTargetView>")).toBeLessThan(layout.indexOf("<Shell />"));
  });
  it("the tint stretches to the plate's full height, home-indicator inset included", () => {
    // Without a viewBox the 100% rect stopped above the inset, and the bare blur
    // under the tabs read as a separate band (seen on iOS, 2026-10-21).
    const g = read("components/shell/GlassBackdrop.tsx");
    expect(g).toMatch(/viewBox="0 0 1 1"/);
    expect(g).toMatch(/preserveAspectRatio="none"/);
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
