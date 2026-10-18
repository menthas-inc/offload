// Undo in place on the phones (2026-10-18). These tests render nothing, so they
// hold the source to the decisions; the store and the slot ordering are tested
// in `@offload/widgets`.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("the toast that is left", () => {
  const source = read("components/shell/Toast.tsx");

  it("hands a word with a place to the in-place store rather than drawing it", () => {
    expect(source).toMatch(/if \(place\) return undoStore\.put\(place, message, action\);/);
  });

  it("fades out when its body is tapped, while its action keeps its own press", () => {
    expect(source).toMatch(/<Pressable\s+onPress=\{state\.hide\}/);
    expect(source).toMatch(/exiting=\{FadeOut/);
  });
});

describe("the line", () => {
  const source = read("components/shell/UndoLine.tsx");

  it("is amber in a slot, an alert when it failed, and drops itself before acting", () => {
    expect(source).toMatch(/bg-surface-noticed-soft/);
    expect(source).toMatch(/accessibilityRole=\{entry\.failed \? "alert" : undefined\}/);
    expect(source).toMatch(/undoStore\.drop\(entry\.id, \{ returned: action\.label === "Undo" \}\);\s*void action\.onPress\(\);/);
  });

  it("has no clock on a refusal", () => {
    expect(source).toMatch(/entry\.failed \? null : <Clock/);
  });
});

describe("a refusal under the thing it put back", () => {
  it("is drawn in the grey under form, not in an amber slot", () => {
    expect(read("lib/undo.ts")).toMatch(/return entry\.failed && entry\.form === "slot" \? \{ \.\.\.entry, form: "under" \} : entry;/);
  });
});

// The three reviews of PR 127.
describe("review fixes", () => {
  const line = read("components/shell/UndoLine.tsx");

  it("plates a line whose place is on no screen, as the web does, by counting the lines drawn", () => {
    expect(line).toMatch(/useDrawn\(entry\.form === "plate" \? null : entry\.id\)/);
    expect(read("components/shell/Plate.tsx")).toMatch(/const plates = useUnplaced\(\);/);
    expect(read("lib/undo.ts")).toMatch(/entry\.form === "plate" \|\| !drawn\.has\(entry\.id\)/);
  });

  it("runs the clock under reduced motion, and restarts it when a second action replaces the line", () => {
    expect(line).toMatch(/reduceMotion: ReduceMotion\.Never/);
    expect(line).toMatch(/<Clock key=\{entry\.startedAt\}/);
  });

  it("fades the line out at the end of its window", () => {
    expect(line).toMatch(/exiting: FadeOut\.duration\(240\)/);
  });

  it("takes Android's inks on the grey forms", () => {
    expect(line).toMatch(/isAndroid \? "text-a-on-var" : "text-text-secondary"/);
  });

  it("keeps the toast's action its own element for a screen reader", () => {
    expect(read("components/shell/Toast.tsx")).toMatch(/<Pressable\s+onPress=\{state\.hide\}[^>]*accessible=\{false\}/);
  });

  it("draws a closed day in the disabled ink, the far edge included", () => {
    expect(read("components/shell/MonthGrid.tsx")).toMatch(/closed\?\.\(day\.iso\) \? \{ color: COLOR\.disabledText \}/);
  });

  it("takes a ticked row off its page in Open in your threads for good, as the web does", () => {
    const source = read("components/today/OpenThreads.tsx");
    expect(source).toMatch(/items=\{one\.todos\.filter\(\(row\) => !struck\.has\(row\.id\)\)\}/);
    expect(source).toMatch(/const count = pages\.reduce\(\(sum, one\) => sum \+ one\.count, 0\) - ticked;/);
  });
});
