// 037 AC-11. No lasso stands for a particular thread: every place that names
// one draws its `ThreadIcon`. A source check, because the failure is a glyph
// that renders perfectly well and says nothing.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(process.cwd(), "src", file), "utf8");

const DRAWS = [
  "components/shell/ThreadPill.tsx",
  "components/shell/AnswerResult.tsx",
  "components/shell/MoveSheet.tsx",
  "components/shell/Sidebar.tsx",
  "components/shell/Panes.tsx",
  "components/loose/Suggestion.tsx",
  "components/panes/Person.tsx",
  "components/panes/Thread.tsx",
];

describe("a thread's icon on the web", () => {
  it.each(DRAWS)("%s draws ThreadIcon", (file) => {
    expect(read(file)).toContain("<ThreadIcon");
  });

  it("draws My threads as tiles, which carry the thread's own glyph (2026-10-29)", () => {
    expect(read("components/panes/MyThreads.tsx")).toContain("<ThreadTile");
    expect(read("components/ThreadTile.tsx")).toContain("isThreadIcon(thread.icon) ? thread.icon : DEFAULT_THREAD_ICON");
  });

  it.each([
    "components/shell/ThreadPill.tsx",
    "components/shell/AnswerResult.tsx",
    "components/shell/MoveSheet.tsx",
    "components/loose/Suggestion.tsx",
    "components/panes/Person.tsx",
    "components/panes/MyThreads.tsx",
    "app/(shell)/content/[id]/page.tsx",
    "app/(shell)/threads/[id]/page.tsx",
  ])("%s names no lasso", (file) => {
    // A comment may say the word; no code names the glyph.
    expect(read(file).replace(/\/\/.*$/gm, "")).not.toMatch(/["']lasso["']/);
  });

  it("has no second default for a thread", () => {
    expect(read("components/shell/Sidebar.tsx")).not.toContain("threadIcon(");
    expect(read("components/panes/MyThreads.tsx")).not.toContain("threadIcon(");
  });

  it("renames nowhere but Edit thread", () => {
    const pane = read("components/panes/Thread.tsx");
    expect(pane).not.toContain("Rename thread");
    expect(pane).not.toContain("titleInput");
    expect(pane).toContain("Edit thread");
  });
});
