// S10. The action a swipe reveals is a target the size of the panel, not the
// word in it: a bare Text with onPress is about 18pt tall, under the 44 a
// finger needs. Read from the source, as the other row tests are.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe.each([
  ["components/memories/MemoryListRow.tsx", "Forget"],
  ["components/shell/ThreadRow.tsx", "Delete"],
])("%s", (file, word) => {
  const source = read(file);
  // The revealed panel, from its clay ground to the end of its Animated.View.
  const panel = source.slice(source.indexOf("bg-surface-danger"), source.indexOf("</Animated.View>"));

  it(`reveals ${word} as a Pressable that fills the panel and is at least 44 high`, () => {
    expect(panel).toMatch(/<Pressable\b/);
    expect(panel).toMatch(/accessibilityRole="button"/);
    // Fills the panel, which is the row's height, and never under the
    // tokens' tap-min, which is 44.
    expect(panel).toMatch(/className="[^"]*\bflex-1\b[^"]*\bself-stretch\b[^"]*"/);
    expect(panel).toMatch(/className="[^"]*\bmin-h-tap-min\b/);
    expect(panel).toMatch(new RegExp(`>\\s*${word}\\s*<`));
  });

  it("puts no onPress on the Text", () => {
    expect(panel).not.toMatch(/<Text\b[^>]*onPress=/);
  });
});
