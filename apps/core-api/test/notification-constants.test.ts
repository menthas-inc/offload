// 024, from the client review of 2026-09-22. The channel ids and the
// category ids were declared on the phone and on the server separately, and
// a rename on either side would have filed a send under a channel a shipped
// phone never made. One declaration now, in the shared package, and the ids
// pinned here because they are permanent: a channel is never renamed once a
// phone has created it.

import { describe, expect, it } from "vitest";
import { CHANNELS, DIGEST_CHANNEL, PEOPLE_CATEGORY, PLAIN_CATEGORY, VERBS_CATEGORY, activityGlyph, activityTag } from "@offload/widgets";

describe("the ids a phone creates once", () => {
  it("are these four channels and these three categories, and never change", () => {
    expect(CHANNELS.map((channel) => [channel.id, channel.name])).toEqual([
      ["due_today", "Due today"],
      ["coming_tomorrow", "Tomorrow"],
      ["people_requests", "Connection requests"],
      ["shared_activity", "Added to a shared thread"],
    ]);
    expect(DIGEST_CHANNEL).toEqual({ morning: "due_today", evening: "coming_tomorrow" });
    expect([VERBS_CATEGORY, PLAIN_CATEGORY, PEOPLE_CATEGORY]).toEqual(["digest_verbs", "digest", "people"]);
  });
});

describe("the row's glyph and tag, decided once for every surface", () => {
  it("names the glyph by kind and the tag by why nothing was sent", () => {
    const row = { kind: "digest" as const, sent: true, reason: null, send: "evening" as const };
    expect(activityGlyph(row)).toBe("moon");
    expect(activityGlyph({ ...row, send: "morning" })).toBe("sunrise");
    expect(activityGlyph({ ...row, sent: false, reason: "setting" })).toBe("bell");
    expect(activityGlyph({ kind: "moved", sent: false, reason: "design", send: null })).toBe("calendar");
    expect(activityGlyph({ kind: "acted", sent: false, reason: "design", send: null })).toBe("check");
    expect(activityGlyph({ kind: "expired", sent: false, reason: "design", send: null })).toBe("x");
    expect(activityGlyph({ kind: "request", sent: true, reason: null, send: null })).toBe("users");
    expect(activityTag(row)).toBeNull();
    expect(activityTag({ ...row, sent: false, reason: "permission" })).toEqual({ label: "Not sent", tone: "noticed" });
    expect(activityTag({ ...row, sent: false, reason: "design" })).toEqual({ label: "Not sent", tone: "quiet" });
  });

  it("draws a labelled row as a record with no Not sent, and Undone once undone (025)", () => {
    const labelled = { kind: "labelled" as const, sent: false, reason: "design" as const, send: null };
    expect(activityGlyph(labelled)).toBe("tag");
    expect(activityTag(labelled)).toBeNull();
    expect(activityTag({ ...labelled, undone: true })).toEqual({ label: "Undone", tone: "quiet" });
  });
});
