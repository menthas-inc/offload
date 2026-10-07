// F-P2 on the phones: an account memory is stored about the person and read
// back to them. Read from the source, as the other screen tests are, since
// these tests render nothing; the rewrite itself is tested in
// packages/widgets/test/voice.test.ts.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toSecondPerson, toThirdPerson } from "@offload/widgets";

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("a memory speaks to the person it is about", () => {
  it("They are X reads You are X", () => {
    expect(toSecondPerson("They are allergic to penicillin.")).toBe("You are allergic to penicillin.");
    expect(toThirdPerson("You are allergic to penicillin.")).toBe("They are allergic to penicillin.");
  });

  it("in the list, its sentence and its name", () => {
    const row = read("components/memories/MemoryListRow.tsx");
    expect(row).toMatch(/const said = toSecondPerson\(memory\.text\);/);
    expect(row).toMatch(/accessibilityLabel=\{said\}/);
    expect(row).toMatch(/>\s*\{said\}\s*</);
    expect(row).not.toMatch(/\{memory\.text\}/);
  });

  it("on the map, its card and its name", () => {
    const map = read("components/memories/MemoriesMap.tsx");
    expect(map).toMatch(/toSecondPerson\(mark\.memory\.text\)/);
    expect(map).toMatch(/\.map\(\(m\) => \(\{ \.\.\.m, label: toSecondPerson\(m\.label\) \}\)\)/);
    expect(map).toMatch(/cardOf\(\{ \.\.\.mark\.memory, text: said \}, zs\)/);
    expect(map).not.toMatch(/\{mark\.memory\.text\}/);
  });

  it("in the editor, which shows the person's form and saves the stored one", () => {
    const editor = read("components/memories/MemoryEditor.tsx");
    expect(editor).toMatch(/toSecondPerson\(held\.text\)/);
    expect(editor).toMatch(/toThirdPerson\(text\)/);
    expect(editor).toMatch(/submitMemory\(held, stored\(text\), kind\)/);
    expect(editor).toMatch(/onForget\(held \?\? editing\)/);
  });
});
