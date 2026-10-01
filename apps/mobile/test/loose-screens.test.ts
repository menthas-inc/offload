// 028 Not in a thread on the phones: what the screens draw, read from their
// source, since these tests render nothing. Each is one line of a component
// that a logic test cannot reach and that the client review found wrong.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const LOOSE_FILES = [
  "lib/loose.ts",
  "components/loose/LooseGroup.tsx",
  "components/loose/useLooseRows.tsx",
  "components/loose/CreateThreadSheet.tsx",
  "components/loose/Suggestion.tsx",
  "components/loose/TypeChips.tsx",
  "components/screens/Loose.tsx",
];

describe("028 the screens", () => {
  it("names no identifier item: an entry, as the wire does", () => {
    for (const file of LOOSE_FILES) {
      // FlatList hands its row over as `item`, and `items-` is a class.
      const code = read(file).replace(/renderItem=\{\(\{ item: /g, "").replace(/\bitems-[a-z]+/g, "");
      expect(code, file).not.toMatch(/\bLooseItem\b|\bitems?\b|\bItem\b/);
    }
  });

  it("gives the suggestion a full tap target while it draws 32", () => {
    const source = read("components/loose/Suggestion.tsx");
    expect(source).toMatch(/hitSlop=\{\{ top: \(TARGET - DRAWN\) \/ 2, bottom: \(TARGET - DRAWN\) \/ 2 \}\}/);
  });

  it("fills the create sheet's tick from the accent alias, not the ramp", () => {
    const source = read("components/loose/CreateThreadSheet.tsx");
    expect(source).not.toMatch(/moss-\d00/);
    expect(source).toMatch(/bg-surface-accent\b(?!-)/);
  });

  it("draws the chip row once, for the group and the full list", () => {
    for (const file of ["components/loose/LooseGroup.tsx", "components/screens/Loose.tsx"]) {
      const source = read(file);
      expect(source, file).toMatch(/<TypeChips\b/);
      expect(source, file).not.toMatch(/<Chip\b/);
    }
  });

  it("counts the group's heading, chips and All link less what has left", () => {
    const source = read("components/loose/LooseGroup.tsx");
    expect(source).not.toMatch(/\bgone\b/);
    expect(source).toMatch(/const counts = less\(summary\b/);
    expect(source).not.toMatch(/summary\.(count|byType)/);
  });

  it("asks what is worth remembering when a note is opened from Not in a thread", () => {
    expect(read("components/shell/Notes.tsx")).toMatch(/placeholder = "What is true about this thread\?"/);
    expect(read("components/loose/useLooseRows.tsx")).toMatch(/placeholder="What is worth remembering\?"/);
  });

  it("labels Today's way to a row's thread by whether it has one", () => {
    expect(read("components/today/useTodayRows.tsx")).toMatch(/label: openThreadLabel\(acting\.threadName\)/);
  });
});
