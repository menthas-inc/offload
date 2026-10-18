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
    expect(read("lib/undo.ts")).toMatch(/entry\.failed && entry\.form === "slot" \? \{ \.\.\.entry, form: "under" as const \} : entry/);
  });
});
