// 025. The label rules every surface shares, from `@offload/widgets`.
//
// AC-14 the `#` token at the end of a draft, and the #words a sent message
//       carries.
// AC-15 a #word is a label's name only at a word start and followed by a
//       letter, so `#3` and `a#b` are not labels.
// AC-17 the filter bar's pick: either logic, All clears, the last cleared is
//       All, No label combines.
// AC-19 a kept pick drops labels that no longer exist.

import { describe, expect, it } from "vitest";
import {
  ALL_LABELS,
  hashtagsIn,
  isAll,
  keepLive,
  labelQuery,
  pickAll,
  toggleLabel,
  toggleUnlabelled,
} from "@offload/widgets";

describe("the # token being typed (AC-14)", () => {
  it("is the one at the end of the draft, after a space or at the start", () => {
    expect(labelQuery("ferry on tuesday #ist")).toBe("ist");
    expect(labelQuery("#")).toBe("");
    expect(labelQuery("ferry #")).toBe("");
    expect(labelQuery("ferry #Istanbul ")).toBeNull();
    expect(labelQuery("ferry a#b")).toBeNull();
    expect(labelQuery("ferry")).toBeNull();
  });
});

describe("the #words in a sent message (AC-15)", () => {
  it("names each once, in order, keeping case, and skips #3 and a#b", () => {
    expect(hashtagsIn("ferry #Istanbul and #boats, not a#tag or #3 or #Istanbul")).toEqual(["Istanbul", "boats"]);
    expect(hashtagsIn("#Lisboa-norte trip")).toEqual(["Lisboa-norte"]);
    expect(hashtagsIn("no labels here")).toEqual([]);
  });
});

describe("the filter bar's pick (AC-17, AC-19)", () => {
  it("starts on All and returns to it when the last is cleared", () => {
    expect(isAll(ALL_LABELS)).toBe(true);
    const one = toggleLabel(ALL_LABELS, "a");
    expect(one).toEqual({ labels: ["a"], none: false });
    expect(isAll(toggleLabel(one, "a"))).toBe(true);
  });

  it("picks either of several, with No label beside them", () => {
    const both = toggleLabel(toggleLabel(ALL_LABELS, "a"), "b");
    expect(both).toEqual({ labels: ["a", "b"], none: false });
    expect(toggleUnlabelled(both)).toEqual({ labels: ["a", "b"], none: true });
    expect(isAll(pickAll())).toBe(true);
  });

  it("drops a label that no longer exists, and falls back to All", () => {
    const kept = { labels: ["a", "gone"], none: false };
    expect(keepLive(kept, ["a", "b"])).toEqual({ labels: ["a"], none: false });
    expect(isAll(keepLive({ labels: ["gone"], none: false }, ["a"]))).toBe(true);
    expect(keepLive({ labels: ["gone"], none: true }, ["a"])).toEqual({ labels: [], none: true });
  });
});

describe("what a toast says (the feature spec's words)", () => {
  it("names one row's labels, or that it has none", async () => {
    const { rowLabelledCopy } = await import("@offload/widgets");
    expect(rowLabelledCopy("Packing list", ["Istanbul"])).toBe("Packing list is under Istanbul");
    expect(rowLabelledCopy("Packing list", ["Istanbul", "Paris"])).toBe("Packing list is under Istanbul and Paris");
    expect(rowLabelledCopy("Packing list", ["A", "B", "C"])).toBe("Packing list is under A, B and C");
    expect(rowLabelledCopy("Packing list", [])).toBe("Packing list has no label");
  });

  it("counts the label's list with no noun, in words under ten", async () => {
    const { listLabelledCopy } = await import("@offload/widgets");
    expect(listLabelledCopy(7, "Istanbul")).toBe("Seven under Istanbul");
    expect(listLabelledCopy(1, "Istanbul")).toBe("One under Istanbul");
    expect(listLabelledCopy(12, "Istanbul")).toBe("12 under Istanbul");
    expect(listLabelledCopy(0, "Istanbul")).toBe("Istanbul saved");
  });
});

describe("a labelled row in Activity (AC-27, AC-28)", () => {
  it("opens its thread and says Undone once undone", async () => {
    const { doorOf, tagOf } = await import("../src/lib/notifications");
    const row = {
      id: "a1", kind: "labelled" as const, sent: false, reason: "design" as const, title: "Sorted", body: null,
      send: null, threadId: "t1", contentId: null, memberId: null, requestId: null, occurredAt: "2026-09-27T00:00:00Z",
      undoable: true, undone: false,
    };
    expect(doorOf(row)).toBe("/threads/t1");
    expect(tagOf(row)).toBeNull();
    expect(tagOf({ ...row, undone: true })).toEqual({ label: "Undone", tone: "quiet" });
  });

  it("undoes through its own route", async () => {
    const calls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return new Response(JSON.stringify({ undone: true }), { status: 200 });
    }) as typeof fetch;
    try {
      const { undoActivity } = await import("../src/lib/notifications");
      expect(await undoActivity("a1")).toBe("undone");
      expect(calls[0]).toMatch(/^POST .*\/v1\/activity\/a1\/undo$/);
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe("the label's list reads every page, and says when one fails", () => {
  it("delivers what arrived and reports a page that did not", async () => {
    const { readEveryPage } = await import("@offload/widgets");
    const seen: number[][] = [];
    const pages = [{ rows: [1, 2], nextCursor: "b" }, null];
    const ok = await readEveryPage(async () => pages.shift() ?? null, (rows) => seen.push(rows), () => true);
    expect(ok).toBe(false);
    expect(seen).toEqual([[1, 2]]);
  });

  it("counts a page that threw as one that did not arrive", async () => {
    const { readEveryPage } = await import("@offload/widgets");
    const ok = await readEveryPage(() => Promise.reject(new TypeError("offline")), () => {}, () => true);
    expect(ok).toBe(false);
  });

  it("reads to the end, and stops quietly once nobody is looking", async () => {
    const { readEveryPage } = await import("@offload/widgets");
    const seen: number[][] = [];
    const cursors: (string | undefined)[] = [];
    const pages = [{ rows: [1], nextCursor: "b" }, { rows: [2], nextCursor: null }];
    const ok = await readEveryPage(
      async (cursor) => (cursors.push(cursor), pages.shift() ?? null),
      (rows) => seen.push(rows),
      () => true,
    );
    expect(ok).toBe(true);
    expect(seen).toEqual([[1], [1, 2]]);
    expect(cursors).toEqual([undefined, "b"]);
    expect(await readEveryPage(async () => null, () => {}, () => false)).toBe(true);
  });
});

describe("a new label's name still in its field when Done is pressed", () => {
  it("is folded in with what was already added, so Done makes it", async () => {
    const { foldDraft } = await import("@offload/widgets");
    expect(foldDraft(" #Pixel  test ", [], ["Paris"])).toEqual({ made: ["Pixel test"] });
    expect(foldDraft("Boats", ["Ferries"], [])).toEqual({ made: ["Ferries", "Boats"] });
    expect(foldDraft("   ", ["Ferries"], [])).toEqual({ made: ["Ferries"] });
  });

  it("refuses one that is too long or already here, and says which", async () => {
    const { foldDraft } = await import("@offload/widgets");
    expect(foldDraft("x".repeat(25), [], [])).toEqual({ line: "A label is 24 characters at most." });
    expect(foldDraft("paris", [], ["Paris"])).toEqual({ line: "paris is already a label here." });
    expect(foldDraft("boats", ["Boats"], [])).toEqual({ line: "boats is already a label here." });
  });
});

describe("an Undo that cannot happen", () => {
  it("reads a 409 as already undone and anything else as a failure", async () => {
    const real = globalThis.fetch;
    let status = 409;
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "not_undoable" }), { status })) as typeof fetch;
    try {
      const { undoActivity } = await import("../src/lib/notifications");
      expect(await undoActivity("a1")).toBe("refused");
      status = 500;
      expect(await undoActivity("a1")).toBe("failed");
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe("a refused label says why, beside the control", () => {
  it("says no more than it knows about a refused name", async () => {
    const { refusalLine } = await import("../src/lib/labels");
    expect(refusalLine("bad_label_name")).toBe("Couldn't save that.");
    expect(refusalLine(null)).toBe("Couldn't save that.");
  });
});

describe("the privacy page says labels (AC-34)", () => {
  it("names the labels, drops the tags, and moves its date with the consent version", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync(new URL("../src/app/(marketing)/privacy/page.tsx", import.meta.url), "utf8");
    const session = readFileSync(new URL("../../core-api/src/routes/session.ts", import.meta.url), "utf8");
    expect(page).toMatch(/the <strong>labels<\/strong> it is grouped under/);
    expect(page).not.toMatch(/the tags, dates and/);
    // A deleted label is kept hidden for its Undo, and taking one off leaves
    // a record with no name in it; the page says both, and the plain delete
    // line no longer claims everything.
    expect(page).toMatch(/<strong>Labels: a deleted one for 30 days/);
    expect(page).toMatch(/Anything else you delete: immediately, then 30 days\./);
    // A label is the thread's: the page's rule about what somebody else wrote
    // says so rather than being quietly untrue for a label's name. Undo is the
    // moment of the delete; the thirty days are the keeping.
    const said = page.replace(/\s+/g, " ");
    expect(said).toMatch(/a label belongs to the thread, so any member can rename or delete one/);
    expect(said).toMatch(/Undo brings it back in the moment you delete it/);
    expect(said).toMatch(/is gone for good, inside the 30 days above/);
    const updated = /const UPDATED = "(\d+) September 2026"/.exec(page)?.[1];
    const version = /CONSENT_VERSION = "2026-09-(\d+)"/.exec(session)?.[1];
    // The two move together; 025 moved them to the 28th and 2026-09-29's
    // details change to the 29th.
    expect(updated).toBeDefined();
    expect(updated).toBe(version);
  });

  it("says what is kept of a photo's words and a note's longer text without being shown (2026-09-29)", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync(new URL("../src/app/(marketing)/privacy/page.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");
    expect(page).toMatch(/The description is shown under the photo; the words read out of it are kept so search and answers can find them, and are not shown anywhere\./);
    expect(page).toMatch(/that is kept with it without being shown, and goes when the note does\./);
    expect(page).not.toMatch(/All of it is on the thread/);
  });
});

describe("a sent digest in Activity", () => {
  // 2026-09-30, the owner's call: the row opens Today, where the notification
  // itself opens, rather than being a record that goes nowhere.
  it("opens Today, and a suppressed one still opens the setting", async () => {
    const activity = await import("../src/lib/notifications");
    const row = {
      id: "a2", kind: "digest" as const, sent: true, reason: null, title: "Five still open", body: "Call the plumber, and four more.",
      send: "morning" as const, threadId: null, contentId: null, memberId: null, requestId: null, occurredAt: "2026-09-30T07:00:00Z",
      undoable: false, undone: false,
    };
    expect(activity.doorOf(row)).toBe("/today");
    expect(activity.doorOf({ ...row, sent: false, reason: "setting" as const })).toBe("/settings/notifications");
  });
});
