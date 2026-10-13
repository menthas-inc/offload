// 2026-10-07. The row's sheet never draws an empty value. Repeats on a row
// with no date said nothing, which read as broken, and Labels on a row with
// none said nothing either: they say Never and None, as the kit's sheet does.
// Read from the source, since these tests render nothing.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { repeatsLabel } from "../lib/when";

const source = readFileSync(new URL("../components/shell/RowEditSheet.tsx", import.meta.url), "utf8");

describe("the row's sheet", () => {
  it("says Never for Repeats with no date", () => {
    expect(repeatsLabel({ day: null, time: null, endTime: null, rrule: null })).toBe("Never");
    expect(source).toContain("{repeatsLabel(when)}");
    expect(source).not.toMatch(/when\.day \? repeatsLabel\(when\) : ""/);
  });

  it("says None for Labels when the row carries none", () => {
    expect(source).toMatch(/\.join\(", "\) \|\| "None"\}/);
  });
});

describe("the When sheet (owner, 2026-10-12)", () => {
  const sheet = readFileSync(new URL("../components/shell/WhenSheet.tsx", import.meta.url), "utf8");

  it("draws no clock while All day is on: the hour rows and the wheel exist only with a time", () => {
    expect(sheet).not.toMatch(/clockLabel\(time \?\? "09:00"\)/);
    expect(sheet).not.toMatch(/opacity: time === null \? 0\.4/);
    expect(sheet).toMatch(/time !== null \? \(/);
  });
});

describe("one way into a row's sheet (owner, 2026-10-12)", () => {
  const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

  it("the sheet offers Move to whoever may move the row, from the row's own thread, and the screen opens the thread list", () => {
    expect(source).toMatch(/onMove\?: \(row: ContentRow\) => void/);
    expect(source).toMatch(/row\.canMove && onMove/);
    expect(source).toMatch(/<Glyph name="layers"/);
    expect(source).toMatch(/\n\s+Move\n/);
  });

  it("a tap opens the sheet for every row; there is no long press and no second menu", () => {
    const row = read("components/shell/ContentRow.tsx");
    expect(row).not.toMatch(/Gesture\.LongPress/);
    expect(row).not.toMatch(/onActions/);
    for (const file of ["components/today/useTodayRows.tsx", "components/loose/useLooseRows.tsx", "components/screens/Thread.tsx", "components/shell/Widgets.tsx", "components/shell/Timeline.tsx"]) {
      expect(read(file), file).not.toMatch(/onActions|acting !== null/);
    }
    expect(read("components/today/useTodayRows.tsx")).not.toMatch(/RowActionSheet/);
    expect(read("components/loose/useLooseRows.tsx")).not.toMatch(/RowActionSheet/);
    // The thread head's More keeps the one action sheet that is not a row's.
    expect(read("components/screens/Thread.tsx").match(/<RowActionSheet/g)).toHaveLength(1);
    expect(read("components/today/useTodayRows.tsx")).toMatch(/<MoveSheet/);
    // A row moved from Today is still due today: it keeps its place and changes its pill.
    const today = read("components/today/useTodayRows.tsx");
    expect(today).toMatch(/apply: \(\) => patchRow\(row\.id, \{ threadId: to\.id, threadName: to\.name, threadIcon: null, threadHue: null \}\)/);
    expect(today).toMatch(/revert: \(\) => patchRow\(row\.id, \{ threadId: row\.threadId, threadName: row\.threadName, threadIcon: row\.threadIcon, threadHue: row\.threadHue \}\)/);
    expect(read("components/screens/Thread.tsx")).toMatch(/onMove=\{/);
  });
});
