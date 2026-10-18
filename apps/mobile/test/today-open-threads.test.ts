// Today, open in your threads on the phones (design 2026-10-07): what the
// screens draw, read from their source, since these tests render nothing.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("open in your threads, the screens", () => {
  it("replaces If you have time and + Today on Today", () => {
    const screen = read("components/today/TodayScreen.tsx");
    expect(screen).not.toMatch(/If you have time|PlusToday|takeToday|picks/);
    expect(read("components/today/useTodayRows.tsx")).not.toMatch(/takeToday|untakeToday/);
  });

  it("draws the section in the layout's place, on Today only, never over the day-one invitation", () => {
    const screen = read("components/today/TodayScreen.tsx");
    expect(screen).toMatch(/section\.kind === "open_threads"/);
    expect(screen).toMatch(/<OpenThreads\b/);
    expect(screen).toMatch(/isToday && openThreadsOn\(layout\)/);
    expect(screen).toMatch(/me\?\.todayLayoutV2|layoutOf\(me\)/);
  });

  it("swipes pages the width less 32 with 8 between, snapping to a page, with dots under past one page", () => {
    const pages = read("components/today/OpenThreads.tsx");
    expect(pages).toMatch(/horizontal/);
    expect(pages).toMatch(/snapToInterval=\{page \+ GAP\}/);
    expect(pages).toMatch(/const GAP = parseFloat\(token\("space-4"\)\)/);
    expect(pages).toMatch(/const GUTTER = parseFloat\(token\("gutter-screen"\)\)/);
    expect(pages).toMatch(/width - 2 \* gutter - 32|- 32/);
    expect(pages).toMatch(/pages\.length > 1 \?/);
  });

  it("ticks in place with Undo, opens the row sheet from a row, and the thread from the head and the foot", () => {
    const pages = read("components/today/OpenThreads.tsx");
    expect(pages).toMatch(/did: "Ticked off"/);
    expect(pages).toMatch(/onOpenRow\(row\)/);
    expect(pages).toMatch(/"Open thread"/);
    expect(pages).toMatch(/"Sort them"/);
    expect(pages).toMatch(/"Not in a thread"/);
  });

  it("keeps the tick its own control, the size of the thread page's, so a screen reader reaches it", () => {
    const pages = read("components/today/OpenThreads.tsx");
    const row = pages.slice(pages.indexOf("items={one.todos}"));
    expect(row.indexOf("<View")).toBeLessThan(row.indexOf("<Pressable"));
    expect(pages).toMatch(/width: 21,\s*height: 21/);
  });

  it("lists Open in your threads in Customize Today with its own grip and switch", () => {
    const sheet = read("components/today/CustomizeSheet.tsx");
    expect(sheet).toMatch(/"Open in your threads"/);
    expect(sheet).toMatch(/"To-dos with no date, a thread at a time"/);
  });
});

describe("Today's sections on the phones (owner, 2026-10-07)", () => {
  it("stand 24 apart, the day's gap; since 2026-10-11 the page's gap is the band's, 24 below and 20 above", () => {
    const screen = read("components/today/TodayScreen.tsx");
    expect(screen).toMatch(/<View key="day" className="gap-space-8">/);
    const band = read("components/today/Band.tsx");
    expect(band).toMatch(/pb-space-8/);
    expect(band).toMatch(/index === 0 \? "pt-space-3" : "pt-space-7"/);
  });
});

describe("Where you will be: a past event (owner, 2026-10-12)", () => {
  it("is struck through as a finished row is, tertiary ink and a hairline strike, never dimmed", () => {
    const parts = readFileSync(new URL("../components/today/DayParts.tsx", import.meta.url), "utf8");
    expect(parts).toMatch(/past \? "text-text-tertiary"/);
    expect(parts).toMatch(/past \? \{ textDecorationLine: "line-through" as const \}/);
    expect(parts).not.toMatch(/past \? "text-text-secondary"/);
  });
});

describe("the thread pill on a card (owner, 2026-10-12)", () => {
  it("never grows past the card it sits on: the name is cut inside the pill", () => {
    const pill = readFileSync(new URL("../components/shell/ThreadPill.tsx", import.meta.url), "utf8");
    expect(pill).toMatch(/maxWidth: "100%"/);
    expect(pill).toMatch(/flexShrink: 1/);
  });
});
