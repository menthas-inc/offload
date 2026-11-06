// Thread layouts (045) on the phones: the client wiring a logic test cannot
// reach and that the review found wrong. These read the source, like
// loose-screens.test.ts, since they render nothing.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("045 the phone screens", () => {
  it("gives the Todo list tick an Undo, and leaves the other layouts the plain tick", () => {
    const thread = read("components/screens/Thread.tsx");
    const tick = thread.slice(thread.indexOf("function layoutTick("), thread.indexOf("function layoutTick(") + 700);
    expect(tick).toMatch(/threadLayout !== "todo"/);
    expect(tick).not.toMatch(/gallery/);
    expect(tick).toMatch(/unwrite: \(\) => completeContent\(row\.id, false\)/);
    expect(tick).toMatch(/did: "Ticked off"/);
    expect(tick).toMatch(/placeOf\(row\.id, "check", "slot"\)/);
  });

  it("draws the checkbox lead only for the big and check forms, via box", () => {
    const sections = read("components/screens/LayoutSections.tsx");
    expect(sections).toMatch(/const box = section\.form === "big" \|\| section\.form === "check"/);
    // The row passes onToggle only when box is set, so an event or a link in
    // Events/Timeline shows its type tile, not a checkbox.
    expect(sections).toMatch(/\.\.\.\(box \? \{ onToggle: \(\) => handlers\.onToggle\(row\) \} : \{\}\)/);
  });

  it("posts the dismiss and seen routes with no body (send adds no content type)", () => {
    const lib = read("lib/threads.ts");
    for (const fn of ["dismissLayoutSuggestion", "markLayoutSeen"]) {
      const body = lib.slice(lib.indexOf(`function ${fn}`), lib.indexOf(`function ${fn}`) + 300);
      expect(body, fn).toMatch(/send\(`\/v1\/threads\/\$\{threadId\}\/layout-/);
      expect(body, fn).not.toMatch(/body\(/);
    }
  });

  it("opens a layout's notes in the note editor, through the Notes section's own sheet", () => {
    const sections = read("components/screens/LayoutSections.tsx");
    const notes = read("components/shell/Notes.tsx");
    // A Timeline day's note and an Other things note were plain Text that
    // nothing opened. They press into the same sheet the Notes section opens.
    expect(sections).toMatch(/useNoteSheet\(/);
    expect(sections).toMatch(/onPress=\{\(\) => openNote\(note\)\}/);
    expect(sections).not.toMatch(/<Text key=\{(item|note)\.id\}/);
    expect(notes).toMatch(/const \{ open, close \} = useNoteSheet\(/);
    expect(read("components/screens/Thread.tsx")).toMatch(/<LayoutSections[^>]*onSheet=\{setNoteSheet\}/);
  });

  it("resets the suggestion's local hide only on a thread change", () => {
    const thread = read("components/screens/Thread.tsx");
    // setSuggestionGone(false) must not share the heads-up effect (deps include
    // changedAt), or a reload that drops the heads-up revives a dismissed pill.
    const resets = thread.match(/setSuggestionGone\(false\)/g) ?? [];
    expect(resets.length).toBe(1);
    const block = thread.slice(thread.indexOf("setSuggestionGone(false)"));
    expect(block.slice(0, 80)).toMatch(/setSuggestionGone\(false\);\s*setHeadsUp\(null\);\s*\},\s*\[id\]\)/);
  });
});
