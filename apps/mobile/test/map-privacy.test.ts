// 030 T5.3, AC-32. The phones' settings note and calendar sheet carry the
// switch-on copy the web does.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("the phones say what the map adds (T5.3)", () => {
  const settings = readFileSync(`${process.cwd()}/app/settings/[page].tsx`, "utf8");
  const calendars = readFileSync(`${process.cwd()}/components/shell/CalendarsSheet.tsx`, "utf8");

  it("says a place a page names goes to Google", () => {
    expect(settings).toContain('note="Opens a link you dumped and reads the page. Where it names a place, the name goes to Google to put it on the map."');
  });

  it("says a shared thread sees where a picked calendar's events are", () => {
    expect(calendars).toContain("sees the events on them, and where they are.");
  });
});
