// Owner, 2026-11-17: in a thread, ticking a to-do and moving a row or a note
// draw no Undo line. The change is plain on screen and the person reverses it
// the way they made it. Read from the source, as the layout tests are, since
// the ops render nothing on their own. A failure still comes back as before.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** One function's body: from its declaration to the next one at its depth. */
function body(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const next = source.indexOf("\n  function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("a thread's obvious changes draw no Undo line", () => {
  const cases: [string, string][] = [
    ["components/screens/Thread.tsx", "move"],
    ["components/screens/Thread.tsx", "reorder"],
    ["components/shell/Notes.tsx", "move"],
    ["components/shell/Notes.tsx", "reorder"],
  ];
  for (const [file, name] of cases) {
    it(`${file} ${name}`, () => {
      const op = body(read(file), name);
      expect(op).not.toMatch(/\bdid:/);
      expect(op).not.toMatch(/\bunwrite:/);
      expect(op).not.toMatch(/\bplace:|placeOf\(/);
      // The way back on failure stays.
      expect(op).toMatch(/failed/);
    });
  }

  it("ticks a Todo list row with the plain tick, as every other layout does", () => {
    const thread = read("components/screens/Thread.tsx");
    expect(thread).not.toMatch(/function layoutTick\(/);
    expect(thread).toMatch(/onToggle(=\{|: )tick\b/);
  });
});
