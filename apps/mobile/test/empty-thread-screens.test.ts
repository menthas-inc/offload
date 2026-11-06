// 2026-10-31. A new thread had no way to start a to do on the phones either:
// Add a note was in the More sheet and nothing else was. Both are there, and
// an empty thread offers both in the middle of the screen. These read the
// source, like thread-layouts-screens.test.ts, since they render nothing.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const thread = readFileSync(new URL("../components/screens/Thread.tsx", import.meta.url), "utf8");

describe("an empty thread's ways in, on the phones", () => {
  it("raises To do's quick add from one place, with its own words", () => {
    const raise = thread.slice(thread.indexOf("const raiseTodo = "), thread.indexOf("const raiseTodo = ") + 400);
    expect(raise).toMatch(/write: "quickAdd"/);
    expect(raise).toMatch(/section: "todo"/);
    expect(raise).toMatch(/title: "Add to To do"/);
  });

  it("puts Add a to do in the More sheet beside Add a note, on Default", () => {
    const more = thread.slice(thread.indexOf("<RowActionSheet"), thread.indexOf("onClose={() => setMoreOpen(false)}"));
    expect(more).toMatch(/isDefaultLayout\s*\?\s*\[\{ label: "Add a to do", icon: "square-check-big", run: raiseTodo \}\]/);
    expect(more).toMatch(/label: "Add a note", icon: "brain", run: raiseNote/);
  });

  it("offers both on an empty thread, and only there", () => {
    const empty = thread.slice(thread.indexOf("{/* 2026-10-31. The two ways in"), thread.indexOf("{/* 2026-10-31. The two ways in") + 1800);
    expect(empty).toMatch(/shownNotes\.length === 0/);
    expect(empty).toMatch(/onPress=\{raiseTodo\}/);
    expect(empty).toMatch(/onPress=\{raiseNote\}/);
    expect(empty).toMatch(/Add a to do/);
    expect(empty).toMatch(/Add a note/);
  });
});
