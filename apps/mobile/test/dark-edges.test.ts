// 2026-10-07, dark theme edges (APPLY-2026-10-07-dark-contrast, section 3).
// In dark a surface that holds rows, a chip, a well and a tint draw a 1px edge
// round themselves, from `useColors()`. The edge colours are transparent in
// light, so each is painted unconditionally, and always as an inset
// `boxShadow` string: a border would move every row 1px in light. Read from
// the source, as the other row tests are; nothing renders.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string): string => readFileSync(new URL(`../components/${file}`, import.meta.url), "utf8");

/** The edge as the source writes it: a template literal round a colour. */
const ring = (colour: string): string => `inset 0 0 0 1px \${${colour}}`;

/** Every place `anchor` starts, so an element drawn twice is checked twice. */
function at(source: string, anchor: string): number[] {
  const found: number[] = [];
  for (let i = source.indexOf(anchor); i !== -1; i = source.indexOf(anchor, i + 1)) found.push(i);
  return found;
}

// [file, the element, a piece of its opening tag, its edge]. The style is
// looked for from there to the next `<`, which is the element's first child
// or its close, so a neighbour's edge cannot stand in for it.
const EDGES: [string, string, string, string][] = [
  ["today/DayParts.tsx", "the stepper's well", "rounded-pill ${groundClass(inBand)}", "COLOR.edgeWell"],
  ["today/DayParts.tsx", "the unraised event card", 'raised ? "border border-border-hairline bg-surface-raised"', "COLOR.edgeCard"],
  ["settings/Rows.tsx", "the group", 'className={`overflow-hidden ${isAndroid ? "bg-a-c-low"', "COLOR.edgeCard"],
  ["labels/Chip.tsx", "the neutral chip", '"rounded-pill"} ${fill}', "COLOR.edgeCard"],
  ["labels/FilterBar.tsx", "New label", 'accessibilityLabel="New label"', "COLOR.edgeWell"],
  ["Segmented.tsx", "the icon track", 'isAndroid ? "border border-border-strong" : "bg-surface-fill"', "COLOR.edgeWell"],
  ["Segmented.tsx", "the text track", "flex-row rounded-sm p-space-1", "COLOR.edgeWell"],
  ["shell/ContentRow.tsx", "the photo's fallback tile", 'rounded-sm ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`}', "COLOR.edgeWell"],
  ["shell/ContentRow.tsx", "the row's tile", '"border border-dashed border-border-strong"', "COLOR.edgeWell"],
  ["screens/Memories.tsx", "the search field", '"rounded-pill bg-a-c-low" : "bg-surface-fill"', "COLOR.edgeWell"],
  ["screens/Memories.tsx", "the count pill", "rounded-pill bg-surface-fill px-space-3 py-space-1", "COLOR.edgeWell"],
  ["screens/MyThreads.tsx", "the count pill", "rounded-pill bg-surface-fill px-space-3 py-space-1", "COLOR.edgeWell"],
  ["screens/Thread.tsx", "the count pill", "rounded-pill bg-surface-fill px-space-3 py-space-1", "COLOR.edgeWell"],
  ["screens/Activity.tsx", "the tag", 'tag.tone === "noticed" ? "bg-surface-noticed-soft"', 'tag.tone === "noticed" ? COLOR.edgeNoticed : COLOR.edgeWell'],
  ["people/RequestCard.tsx", "the card", 'isAndroid ? "bg-a-c-low" : "bg-surface-accent-soft"', "isAndroid ? COLOR.edgeCard : COLOR.edgeAccent"],
  ["people/InvitationStrip.tsx", "the strip", 'isAndroid ? "bg-a-c-low" : "bg-surface-accent-soft"', "isAndroid ? COLOR.edgeCard : COLOR.edgeAccent"],
  ["loose/Suggestion.tsx", "the move suggestion", 'move ? "border-transparent bg-surface-accent-soft"', "COLOR.edgeAccent"],
  ["ConsentTicks.tsx", "the note", "bg-surface-attention-soft", "COLOR.edgeAttention"],
  ["screens/SignIn.ios.tsx", "the refusal", "bg-surface-attention-soft", "COLOR.edgeAttention"],
  ["screens/SignIn.android.tsx", "the refusal", "bg-surface-attention-soft", "COLOR.edgeAttention"],
  ["screens/NoInvite.ios.tsx", "the refusal", "bg-surface-attention-soft", "COLOR.edgeAttention"],
  ["screens/NoInvite.android.tsx", "the refusal", "bg-surface-attention-soft", "COLOR.edgeAttention"],
  ["people/NewConnection.tsx", "the found row", 'rounded-lg px-space-4 py-space-3 ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}', "COLOR.edgeCard"],
  ["people/ConfirmSheet.tsx", "the rows", 'mt-space-5 rounded-lg px-space-4 ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}', "COLOR.edgeCard"],
  ["memories/MemoryEditor.tsx", "a kind at rest, in its own hue", 'accessibilityRole="radio"', "atOpacity(colors.dot, COLOR.edgeHue)"],
  ["memories/MemoryEditor.tsx", "the why block", "mt-space-6 flex-row items-start rounded-md", "COLOR.edgeWell"],
  // Android's `a-c-low` cards take the card's edge, as the iOS fill does.
  // AnswerResult names its palette `colors`.
  ["shell/AnswerResult.tsx", "the Android card", 'isAndroid ? "bg-a-c-low" : "border border-border-hairline bg-surface-raised"', "colors.edgeCard"],
  ["firstrun/BringItIn.tsx", "the Android card", "className={skin.card}", "COLOR.edgeCard"],
];

describe.each(EDGES)("%s, %s", (file, _what, anchor, colour) => {
  const source = read(file);

  it(`draws ${colour} as an inset ring`, () => {
    const starts = at(source, anchor);
    expect(starts.length).toBeGreaterThan(0);
    for (const start of starts) {
      expect(source.slice(start, source.indexOf("<", start))).toContain(`boxShadow: \`${ring(colour)}\``);
    }
  });
});

describe("Today's cards", () => {
  const source = read("today/TodayScreen.tsx");

  // The rows paint the card's fill under their swipe, which covers an inset
  // shadow on the card itself, so the edge is a layer over the rows.
  it("lays the edge over the rows, where they cannot paint over it", () => {
    expect(source).toMatch(/const cardEdge = \(\s*<View\s+pointerEvents="none"\s+className=\{`absolute inset-0 /);
    const edge = source.slice(source.indexOf("const cardEdge"), source.indexOf("const cardEdge") + 400);
    expect(edge).toContain(`boxShadow: \`${ring("COLOR.edgeCard")}\``);
  });

  it("puts it in To do's card, on the band's ground; since 2026-10-11 Reminders draws its own cards as wells", () => {
    expect(at(source, "<Ground className={cardShape}>").length).toBe(1);
    expect(at(source, "{cardEdge}").length).toBe(1);
    expect(read("today/Reminders.tsx")).toContain(`boxShadow: \`${ring("COLOR.edgeWell")}\``);
  });

  it("rings every page of open in your threads as a well", () => {
    expect(read("today/OpenThreads.tsx")).toContain(`boxShadow: \`${ring("COLOR.edgeWell")}\``);
  });
});

describe("the date chip", () => {
  const source = read("shell/DateChip.tsx");

  it("takes its edge from its tone", () => {
    expect(source).toContain('chip.tone === "late" ? COLOR.edgeDanger : chip.tone === "soon" ? COLOR.edgeNoticed : COLOR.edgeCard');
    const chip = source.slice(source.indexOf("${ground}`"), source.indexOf("${ground}`") + 200);
    expect(chip).toContain(`boxShadow: \`${ring("edge")}\``);
  });
});

describe("the neutral chip", () => {
  const source = read("labels/Chip.tsx");

  it("draws the edge only at rest, not picked, raised or outlined", () => {
    expect(source).toMatch(/!selected && tone === "neutral" \? \{ boxShadow: `inset 0 0 0 1px \$\{COLOR\.edgeCard\}` \}/);
  });
});

const FILES = [...new Set([...EDGES.map(([file]) => file), "today/TodayScreen.tsx", "shell/DateChip.tsx"])];

describe.each(FILES)("%s", (file) => {
  const source = read(file);

  it("never draws an edge as a border, which would move layout in light", () => {
    expect(source).not.toMatch(/border\w*:\s*[^,}\n]*COLOR\.edge/);
    expect(source).not.toMatch(/\bborder-edge-/);
  });

  it("points at the decision", () => {
    expect(source).toContain("Dark theme: edges");
  });
});
