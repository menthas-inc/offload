// 035 part B. What the Your copy row says in each state, decided once for the
// phones and the web (AC-15).

import { describe, expect, it } from "vitest";
import { copyRow } from "@offload/widgets";

const none = { readyAt: null, expiresAt: null, nextAt: null };

describe("the Your copy row", () => {
  it("offers the export when there is none", () => {
    expect(copyRow({ state: "idle", ...none }, "Europe/Lisbon")).toEqual({
      title: "Export everything",
      note: "One file, readable without offload.",
      action: "Export",
      busy: false,
      canDelete: false,
    });
  });

  it("says it is being made, with nothing to press", () => {
    expect(copyRow({ state: "making", ...none }, null)).toEqual({
      title: "Making your copy",
      note: null,
      action: null,
      busy: true,
      canDelete: false,
    });
  });

  it("says when it was made and when it goes, in the person's own days", () => {
    const row = copyRow(
      { state: "ready", readyAt: "2026-10-03T23:30:00Z", expiresAt: "2026-10-10T23:10:00Z", nextAt: null },
      "Europe/Lisbon",
    );
    // Half past eleven at night UTC is the 4th in Lisbon's summer time.
    expect(row).toEqual({ title: "Ready, 4 Oct", note: "Kept until 11 Oct", action: "Download", busy: false, canDelete: true });
  });

  it("says a build failed and offers the one way forward, with no reason", () => {
    expect(copyRow({ state: "failed", ...none }, null)).toEqual({
      title: "Couldn't make your copy",
      note: null,
      action: "Try again",
      busy: false,
      canDelete: false,
    });
  });

  it("says when the next one can be made, and offers nothing until then", () => {
    expect(copyRow({ state: "waiting", readyAt: null, expiresAt: null, nextAt: "2026-10-10T09:00:00Z" }, "UTC")).toEqual({
      title: "Next copy from 10 Oct",
      note: null,
      action: null,
      busy: false,
      canDelete: false,
    });
  });

  it("invents no day for a ready copy that carries none", () => {
    expect(copyRow({ state: "ready", ...none }, "UTC")).toEqual({ title: "Ready", note: null, action: "Download", busy: false, canDelete: true });
  });

  it("falls back to UTC for a zone it does not know", () => {
    expect(copyRow({ state: "waiting", readyAt: null, expiresAt: null, nextAt: "2026-10-10T09:00:00Z" }, "Mars/Olympus").title).toBe(
      "Next copy from 10 Oct",
    );
  });
});
