// The thread notice (2026-10-31) on the phones: what the screens draw, read
// from their source, since these tests render nothing. The words and the
// switch's line are tested in @offload/widgets and on the web.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const code = (file: string) => read(file).replace(/\/\/.*$/gm, "").replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");

describe("ThreadNotice", () => {
  const notice = code("components/shell/ThreadNotice.tsx");

  it("is solid moss from offload and ink from a person, never the soft tint", () => {
    expect(notice).toMatch(/bg-surface-accent\b(?!-)/);
    expect(notice).toMatch(/bg-surface-inverse\b/);
    expect(notice).not.toMatch(/surface-accent-soft/);
  });

  // Three, not the handoff's two: at 375 three of the five suggestions need a third line.
  it("reads 16 medium on three lines at most, and lets the largest text sizes run on", () => {
    expect(notice).toMatch(/fontSize: 16/);
    expect(notice).toMatch(/numberOfLines=\{fontScale > 1\.3 \? undefined : 3\}/);
  });

  it("announces itself once, politely, on Android and on iOS", () => {
    expect(notice).toMatch(/accessibilityLiveRegion="polite"/);
    expect(notice).toMatch(/if \(Platform\.OS === "ios"\)\s*AccessibilityInfo\.announceForAccessibility\(message\)/);
  });

  it("does not read a person's name twice: the face is hidden from a screen reader", () => {
    expect(notice).toMatch(/importantForAccessibility="no-hide-descendants"/);
  });
});

describe("the thread screen", () => {
  const thread = code("components/screens/Thread.tsx");

  it("draws both notices as the strip, and no small pill or plain heads-up line (AC-5)", () => {
    expect(thread.match(/<ThreadNotice\b/g)).toHaveLength(2);
    expect(thread).not.toMatch(/bg-surface-accent-soft/);
    expect(thread).not.toMatch(/Show this thread as/);
  });

  it("names the switch, the change and the dismiss for a screen reader", () => {
    expect(thread).toMatch(/actionLabel=\{`Switch this thread to the \$\{LAYOUT_NAMES\[thread\.layoutSuggestion\]\} layout`\}/);
    expect(thread).toMatch(/actionLabel="Change this thread's layout"/);
    expect(thread).toMatch(/dismissLabel="Dismiss suggestion"/);
  });

  it("says where to change it later only when the switch came from the notice", () => {
    expect(thread).toMatch(/\$\{notice \? "\. You can always change this in thread settings\." : ""\}/);
    expect(thread).toMatch(/onAction=\{\(\) => setEditingThread\("layout"\)\}/);
  });

  it("draws a faint line between two stacked notices, as the web does", () => {
    expect(thread).toMatch(/stacked=\{headsUp !== null\}/);
    expect(code("components/shell/ThreadNotice.tsx")).toMatch(/borderTopColor: "rgba\(255, 255, 255, 0\.18\)"/);
  });
});

describe("Edit thread and the Undo line", () => {
  it("opens at Layout", () => {
    expect(code("components/screens/EditThreadSheet.tsx")).toMatch(/from: "icon" \| "name" \| "layout"/);
  });

  it("wraps a line whose sentence has to be read whole", () => {
    expect(code("components/shell/UndoLine.tsx")).toMatch(/numberOfLines=\{entry\.wrap \? undefined : 1\}/);
  });
});
