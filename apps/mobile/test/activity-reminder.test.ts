// 042. A reminder of its own in Activity: the bell, and the door to its
// thread; one that no phone could take opens the Notifications page.

import { describe, expect, it, vi } from "vitest";
import { activityGlyph } from "@offload/widgets";

vi.mock("../lib/api", () => ({ send: async () => ({ status: 0, data: null }), request: async () => null }));

const { doorOf } = await import("../lib/activity");

const row = {
  id: "a1", kind: "reminder" as const, sent: true, reason: null, title: "In 15 minutes", body: "Standup at 9:30.",
  send: null, threadId: "t1", contentId: "c1", memberId: null, requestId: null, occurredAt: "2026-10-10T09:15:00Z",
  undoable: false, undone: false,
};

describe("a reminder in Activity", () => {
  it("draws the bell and opens its thread, for a row or a note", () => {
    expect(activityGlyph(row)).toBe("bell");
    expect(doorOf(row)).toEqual({ pathname: "/threads/[id]", params: { id: "t1" } });
    expect(doorOf({ ...row, contentId: null })).toEqual({ pathname: "/threads/[id]", params: { id: "t1" } });
  });

  it("opens the Notifications page when no phone could take it", () => {
    expect(doorOf({ ...row, sent: false, reason: "permission" as const })).toEqual({ pathname: "/settings/notifications" });
  });
});
