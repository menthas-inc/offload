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

// 050. The interim Call pill became found actions: one pill component for
// every kind, chosen by offload on the filing turn and drawn wherever the row
// is, with Directions from the row's place.
describe("found actions (050)", () => {
  const pill = () => read("../components/shell/Actions.tsx");

  it("re-checks every entry and branches on the kind, never the scheme alone", () => {
    expect(pill()).toMatch(/isActionUrl\(/);
    expect(pill()).toMatch(/actionKind\(/);
    expect(pill()).toMatch(/shownDestination\(/);
  });

  it("opens a call or an email on the tap through the platform, and swallows a refusal", () => {
    expect(pill()).toMatch(/Linking\.openURL\(action\.url\)\.catch\(\(\) => \{\}\)/);
  });

  it("keeps 044's confirm for an Open, worded by its source and a mail's sender", () => {
    for (const words of ["From the picture.", "From your voice note.", "From what you typed.", "From a mail from ", "From the PDF."]) {
      expect(pill()).toContain(words);
    }
  });

  it("draws Directions from the row's place with 030's link", () => {
    expect(pill()).toMatch(/directionsUrl\(/);
  });

  it("draws glyphs that are in the set", () => {
    for (const name of ["phone", "mail", "map-pin", "arrow-up-right"]) {
      expect(pill()).toContain(`"${name}"`);
      expect(ICONS).toHaveProperty(name);
    }
  });

  it("shortens a long destination in the middle so its Remove stays on screen (simulator, 2026-11-03)", () => {
    expect(pill()).toMatch(/numberOfLines=\{1\}\s*ellipsizeMode="middle"/);
    expect(pill()).toMatch(/className="max-w-full flex-row items-center gap-space-1"/);
  });

  it("has a 44 point hit area and sizes from the type scale, not literal numbers", () => {
    expect(pill()).toMatch(/hitSlop=\{/);
    expect(pill()).not.toMatch(/fontSize: \d/);
  });

  it("is on the row, in the sheet with Remove, in the viewer and in the conversation", () => {
    expect(read("../components/shell/ContentRow.tsx")).toMatch(/<Actions[\s\S]*?place=\{row\.place\}/);
    expect(read("../components/shell/RowEditSheet.tsx")).toMatch(/<Actions[\s\S]*?removeHere[\s\S]*?\/>/);
    expect(read("../components/shell/PhotoViewer.tsx")).toMatch(/<Actions /);
    const conversation = read("../components/shell/Conversation.tsx");
    expect(conversation).toMatch(/photo\.actions\?\.length \? <Actions /);
    expect(conversation).not.toMatch(/photo\.kind === "pdf" && photo\.actions/);
  });

  it("lets the author remove one from Today and Loose too, on the row and in the sheet", () => {
    for (const file of ["../components/today/useTodayRows.tsx", "../components/loose/useLooseRows.tsx"]) {
      const source = read(file);
      const sheetAt = source.indexOf("<RowEditSheet");
      expect(source.slice(sheetAt, sheetAt + 800), file).toMatch(/onRemoveAction=/);
    }
    expect(read("../components/today/useTodayRows.tsx")).toMatch(/onRemoveAction=\{\(url\) => removeAction\(item, url\)\}/);
  });

  it("leaves nothing of the interim pill or its detector", () => {
    for (const file of ["../components/shell/ContentRow.tsx", "../components/shell/RowEditSheet.tsx", "../components/shell/PhotoViewer.tsx", "../components/shell/Conversation.tsx"]) {
      expect(read(file), file).not.toMatch(/CallPill|PdfActions|phoneIn/);
    }
  });

  it("keeps the general link opener to web pages, and never logs a destination", () => {
    expect(read("../lib/links.ts")).toMatch(/isOpenable = [^\n]*\^https\?:/);
    expect(read("../lib/log.ts")).toMatch(/"url",/);
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
