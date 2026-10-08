// 2026-10-07. What a shared thread asks before something leaves it, the same
// words on every surface. Archive hides a row for everyone in the thread, so
// in a shared thread it asks first and says so; a thread with others in it is
// left rather than deleted, and the question names who it stays with.

import { describe, expect, it } from "vitest";
import { ARCHIVE_SHARED, archiveAsk, asksBeforeArchive, leaveAsk, staysWith } from "../src/index.js";

describe("before archiving in a shared thread", () => {
  it("asks for a live row in a shared thread, and never to put one back", () => {
    expect(asksBeforeArchive({ archivedAt: null, canDelete: true }, true)).toBe(true);
    expect(asksBeforeArchive({ archivedAt: null, canDelete: true }, false)).toBe(false);
    expect(asksBeforeArchive({ archivedAt: "2026-10-07T10:00:00Z", canDelete: false }, true)).toBe(false);
  });

  it("falls back to whose row it is where the thread's people are not known", () => {
    expect(asksBeforeArchive({ archivedAt: null, canDelete: false }, null)).toBe(true);
    expect(asksBeforeArchive({ archivedAt: null, canDelete: true }, null)).toBe(false);
  });

  it("says it goes for everyone", () => {
    expect(archiveAsk("Boiler service")).toBe("Archive Boiler service?");
    expect(ARCHIVE_SHARED).toBe("It leaves the list for everyone in the thread.");
  });
});

describe("leaving a shared thread", () => {
  it("names who it stays with, by first name", () => {
    expect(leaveAsk("Flat admin")).toBe("Leave Flat admin?");
    expect(staysWith(["Sam Reed"])).toBe("It stays for Sam.");
    expect(staysWith(["Sam Reed", "Jo Martins", "Ana"])).toBe("It stays for Sam, Jo and Ana.");
    // Never a sentence with nobody in it.
    expect(staysWith([])).toBe("");
  });

  it("writes no dash of either kind", () => {
    for (const line of [ARCHIVE_SHARED, staysWith(["Sam"]), leaveAsk("x"), archiveAsk("x")]) expect(line).not.toMatch(/[–—]/);
  });
});
