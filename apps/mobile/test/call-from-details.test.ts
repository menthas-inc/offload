// 2026-11-02 (the owner). A screenshot filed as an event held the number to
// call, and on the phones it could be neither read nor opened: Today drew the
// screenshot's tile with nothing behind the tap, and the row's sheet had no
// details. Now the tile opens the viewer on every list, the sheet shows the
// attachment and its details, and a number in the details is one Call pill on
// the row, in the sheet and in the viewer. Read from the source, since these
// tests render nothing.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ICONS } from "../components/icons.generated";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("the call pill", () => {
  const pill = () => read("../components/shell/CallPill.tsx");

  it("dials only what phoneIn found in the caption, through the platform", () => {
    expect(pill()).toMatch(/phoneIn\(photoCaption\(/);
    expect(pill()).toMatch(/Linking\.openURL\(phone\.tel\)/);
    expect(pill()).toContain("Call {phone.shown}");
  });

  it("draws a glyph that is in the set", () => {
    expect(pill()).toContain('name="phone"');
    expect(ICONS).toHaveProperty("phone");
  });

  it("is on the row, in the sheet and in the viewer", () => {
    for (const file of ["../components/shell/ContentRow.tsx", "../components/shell/RowEditSheet.tsx", "../components/shell/PhotoViewer.tsx"]) {
      expect(read(file), file).toMatch(/<CallPill /);
    }
  });
});

describe("Today's tile", () => {
  const today = read("../components/today/useTodayRows.tsx");

  it("opens the viewer for a photo and the PDF for a PDF, as the thread does", () => {
    expect(today).toMatch(/onOpenPhoto=\{/);
    expect(today).toMatch(/openPdf\(/);
    expect(today).toMatch(/<PhotoViewer/);
  });
});

describe("the row's sheet", () => {
  const sheet = read("../components/shell/RowEditSheet.tsx");

  it("shows the attachment, which opens it, and the details as an editable caption", () => {
    expect(sheet).toMatch(/<PhotoThumb/);
    expect(sheet).toMatch(/onOpenPhoto\(row\)/);
    expect(sheet).toMatch(/useState\(photoCaption\(row\?\.body\) \?\? ""\)/);
    expect(sheet).toMatch(/patch\.body = withCaption\(row\.body, details\)/);
  });

  it("is handed the way to open it on every screen that mounts it", () => {
    for (const file of ["../components/today/useTodayRows.tsx", "../components/loose/useLooseRows.tsx", "../components/screens/Thread.tsx"]) {
      const source = read(file);
      const sheetAt = source.indexOf("<RowEditSheet");
      expect(source.slice(sheetAt, sheetAt + 2500), file).toMatch(/onOpenPhoto=/);
    }
  });
});

describe("the thread's calendar", () => {
  it("opens a dated row's screenshot or PDF from the day under the month", () => {
    const timeline = read("../components/shell/Timeline.tsx");
    expect(timeline).toMatch(/onOpenPhoto=\{\(\) => onOpenPhoto\(row\)\}/);
    expect(read("../components/screens/Thread.tsx")).toMatch(/<Timeline[\s\S]*?onOpenPhoto=\{openFileOf\}[\s\S]*?\/>/);
  });
});
