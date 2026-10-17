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
    expect(repeatsLabel({ day: null, endDay: null, time: null, endTime: null, rrule: null })).toBe("Never");
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

  // 2026-10-16 (the owner). Time was a row that disclosed All day and then a
  // second Time row, and said "All day" as if it were an hour. It is one row,
  // the All day switch, and while it is off the hour sits under it.
  it("is one All day row with no disclosure, and the hour under it while it is off", () => {
    expect(sheet).not.toMatch(/block === "time"/);
    expect(sheet).not.toMatch(/: "All day"\}/);
    expect(sheet).toMatch(/<Switch checked=\{time === null\} onChange=\{setAllDay\} label="All day" disabled=\{!day\} \/>/);
    expect(sheet).toMatch(/display="compact"/);
    expect(sheet).not.toMatch(/display="spinner"/);
  });
});

// 2026-10-17 (the owner). offload could date a row across days and a person
// could not. A Last day row under the grid picks the span's end on the grid.
describe("the When sheet's last day", () => {
  const sheet = readFileSync(new URL("../components/shell/WhenSheet.tsx", import.meta.url), "utf8");

  it("holds a last day, offers it once there is a day, and picks it on the same grid", () => {
    expect(sheet).toMatch(/const \[endDay, setEndDay\] = useState<string \| null>\(initial\.endDay\)/);
    expect(sheet).toMatch(/accessibilityLabel=\{`Last day, /);
    expect(sheet).toMatch(/\{day && !rrule \? \(/);
    expect(sheet).toMatch(/if \(pickingEnd && day\)/);
    expect(sheet).toMatch(/const current: WhenValue = \{ day, endDay: day && !rrule \? endDay : null,/);
  });

  it("clears to nothing through the one empty value, never a literal that forgets a field", () => {
    expect(sheet).toMatch(/onSave\(NOTHING\)/);
    expect(source).not.toMatch(/\{ day: null, time: null, endTime: null, rrule: null \}/);
  });
});

// 2026-10-17 (the owner). A photo can ride on the to-do it became; the to-do
// keeps its checkbox and draws the photo beside it.
describe("a to-do carrying a photo", () => {
  it("draws the checkbox and the photo that opens the viewer", () => {
    const row = readFileSync(new URL("../components/shell/ContentRow.tsx", import.meta.url), "utf8");
    expect(row).toMatch(/\{onToggle && row\.photo && !row\.archivedAt \? \(/);
  });
});

// 2026-10-17 (the owner). Archive is back on your own rows, beside Delete.
describe("the sheet's ways out", () => {
  it("offers Archive beside Delete on your own live row, and every screen wires it", () => {
    const foot = readFileSync(new URL("../components/shell/SheetFoot.tsx", import.meta.url), "utf8");
    expect(foot).toMatch(/also\?: \{ label: string; icon\?: string; onPress: \(\) => void \} \| undefined;/);
    // Archive first and Delete beside it, as the web's tools end on the trash.
    expect(foot.indexOf("{also ? (")).toBeLessThan(foot.indexOf("{lead ? ("));
    expect(source).toMatch(/also=\{\s*row\.canDelete && !row\.archivedAt && onArchive/);
    for (const file of ["components/today/useTodayRows.tsx", "components/loose/useLooseRows.tsx", "components/screens/Thread.tsx"]) {
      expect(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), file).toMatch(/onArchive=\{/);
    }
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
