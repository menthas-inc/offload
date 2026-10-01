// 027 T3.17, AC-15. Activity's door for the evening digest opens the day it
// named: the row's own day in the account's zone, plus one. A day already past
// opens Today, and every other digest opens Today.

import { describe, expect, it } from "vitest";
import { doorOf, type ActivityEntry } from "../src/lib/notifications";

const LISBON = "Europe/Lisbon";

const digest = (send: "morning" | "evening", occurredAt: string): ActivityEntry => ({
  id: "x",
  kind: "digest",
  sent: true,
  reason: null,
  title: "Coming tomorrow",
  body: null,
  send,
  threadId: null,
  contentId: null,
  memberId: null,
  requestId: null,
  undoable: false,
  undone: false,
  occurredAt,
});

describe("027 AC-15 the evening digest's door", () => {
  it("opens the day after the evening it was sent", () => {
    expect(doorOf(digest("evening", "2026-09-29T18:00:00Z"), LISBON, "2026-09-29")).toBe("/today?day=2026-09-30");
  });

  it("reads the row's day in the account's zone", () => {
    // 23:30 UTC on the 29th is already the 30th in Tokyo, so it named the 1st.
    expect(doorOf(digest("evening", "2026-09-29T23:30:00Z"), "Asia/Tokyo", "2026-09-30")).toBe("/today?day=2026-10-01");
  });

  it("opens Today once the day it named has come or gone", () => {
    expect(doorOf(digest("evening", "2026-09-29T18:00:00Z"), LISBON, "2026-09-30")).toBe("/today");
    expect(doorOf(digest("evening", "2026-09-25T18:00:00Z"), LISBON, "2026-09-30")).toBe("/today");
  });

  it("opens Today for the morning digest", () => {
    expect(doorOf(digest("morning", "2026-09-29T07:00:00Z"), LISBON, "2026-09-29")).toBe("/today");
  });
});
