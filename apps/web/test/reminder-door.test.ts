// 042, AC-23. A reminder of its own writes an Activity row of kind
// `reminder`, the `bell` glyph, opening the thing's thread. One that no phone
// could take is recorded as not sent and opens the Notifications page, as
// 024's sends do.

import { describe, expect, it } from "vitest";
import { doorOf, glyphOf, type ActivityEntry } from "../src/lib/notifications";

const reminder = (over: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id: "x",
  kind: "reminder",
  sent: true,
  reason: null,
  title: "In 15 minutes",
  body: "Call the clinic",
  send: null,
  threadId: "t1",
  contentId: "c1",
  memberId: null,
  requestId: null,
  undoable: false,
  undone: false,
  occurredAt: "2026-10-10T08:45:00Z",
  ...over,
});

describe("042 AC-23 a reminder's row", () => {
  it("opens the thing's thread, a row's or a note's", () => {
    expect(doorOf(reminder())).toBe("/threads/t1");
    expect(doorOf(reminder({ contentId: null }))).toBe("/threads/t1");
  });

  it("is the record and nothing more without a thread", () => {
    expect(doorOf(reminder({ threadId: null, contentId: null }))).toBeNull();
  });

  it("opens the Notifications page when no phone could take it", () => {
    expect(doorOf(reminder({ sent: false, reason: "permission" }))).toBe("/settings/notifications");
  });

  it("draws the bell", () => {
    expect(glyphOf(reminder())).toBe("bell");
  });
});
