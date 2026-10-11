// 025. The phones' label calls and the kept pick.
//
// AC-12 the label's list writes deltas to the label's rows route.
// AC-17 a refusal comes back as its code, so the sheet says the one clause.
// AC-18 the filter is read on the server: the pick travels as query params.
// AC-19 the pick is kept per thread on the device and nowhere else.

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; init: RequestInit }[] = [];
let reply: { status: number; data: unknown; error?: string } = { status: 200, data: null };
const store = new Map<string, string>();

vi.mock("../lib/api", () => ({
  send: (path: string, init: RequestInit = {}) => {
    calls.push({ path, init });
    return Promise.resolve(reply);
  },
}));
// lib/dump reaches a native file API for photo uploads; nothing here uses it.
vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  deleteItemAsync: (key: string) => Promise.resolve(void store.delete(key)),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afu",
}));

const labels = await import("../lib/labels");
const threads = await import("../lib/threads");

beforeEach(() => {
  calls.length = 0;
  store.clear();
  reply = { status: 200, data: null };
});

describe("the label calls (AC-12, AC-17)", () => {
  it("creates a label with its rows, on the thread", async () => {
    reply = { status: 200, data: { label: { id: "l1", name: "Istanbul", colour: 1, count: 2 } } };
    const made = await labels.createLabel("t1", { name: "Istanbul", rows: { content: ["c1", "c2"] } });
    expect(calls[0]?.path).toBe("/v1/threads/t1/labels");
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ name: "Istanbul", rows: { content: ["c1", "c2"] } });
    expect(made).toEqual({ ok: true, value: { label: { id: "l1", name: "Istanbul", colour: 1, count: 2 } } });
  });

  it("writes the list as what was ticked and unticked", async () => {
    reply = { status: 200, data: { label: {}, changed: {}, previous: null } };
    await labels.labelRows("l1", { add: { content: ["c1"] }, remove: { notes: ["n1"] } });
    expect(calls[0]?.path).toBe("/v1/labels/l1/rows");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ add: { content: ["c1"] }, remove: { notes: ["n1"] } });
  });

  it("hands back a refusal by its code, and no connection as nothing known", async () => {
    reply = { status: 409, data: null, error: "label_taken" };
    expect(await labels.createLabel("t1", { name: "Lisbon" })).toEqual({ ok: false, error: "label_taken" });
    reply = { status: 0, data: null };
    expect(await labels.createLabel("t1", { name: "Lisbon" })).toEqual({ ok: false, error: null });
  });

  it("deletes and restores by id alone", async () => {
    reply = { status: 200, data: { deleted: true } };
    await labels.deleteLabel("l1");
    reply = { status: 200, data: { label: {} } };
    await labels.restoreLabel("l1");
    expect(calls.map((c) => [c.init.method, c.path])).toEqual([
      ["DELETE", "/v1/labels/l1"],
      ["POST", "/v1/labels/l1/restore"],
    ]);
    expect(calls.every((c) => c.init.body === undefined)).toBe(true);
  });
});

describe("the filter, read on the server (AC-18)", () => {
  it("sends the picked labels, No label, and the list's ticks as query params", async () => {
    reply = { status: 200, data: { rows: [], nextCursor: null } };
    await threads.fetchContent("t1", { labels: ["a", "b"], unlabelled: true });
    await threads.fetchContent("t1", { ticksFor: "l1" });
    expect(calls[0]?.path).toBe("/v1/threads/t1/content?labels=a%2Cb&unlabelled=true");
    expect(calls[1]?.path).toBe("/v1/threads/t1/content?ticksFor=l1");
  });
});

describe("the kept pick (AC-19)", () => {
  it("is per thread, on the device, and All is not stored", () => {
    labels.writePick("t1", { labels: ["a"], none: false });
    labels.writePick("t2", { labels: [], none: true });
    expect(labels.readPick("t1")).toEqual({ labels: ["a"], none: false });
    expect(labels.readPick("t2")).toEqual({ labels: [], none: true });
    labels.writePick("t1", { labels: [], none: false });
    expect(store.has("offload_labels_t1")).toBe(false);
    expect(labels.readPick("t3")).toEqual({ labels: [], none: false });
  });

  it("reads anything unreadable as All", () => {
    store.set("offload_labels_t1", "{not json");
    expect(labels.readPick("t1")).toEqual({ labels: [], none: false });
  });

  // A key named after a thread cannot be found by a phone that no longer
  // knows the thread, so each one is listed where sign-out finds it, and
  // leaves the list when the pick goes back to All. 2026-10-11.
  // Unlisted once its delete has gone through, never before (account-keys).
  it("is listed with the account's keys, so signing out finds it", async () => {
    labels.writePick("t1", { labels: ["a"], none: false });
    labels.writePick("t2", { labels: [], none: true });
    expect(JSON.parse(store.get("offload_account_keys") ?? "[]")).toEqual(["offload_labels_t1", "offload_labels_t2"]);
    labels.writePick("t1", { labels: [], none: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(store.get("offload_account_keys") ?? "[]")).toEqual(["offload_labels_t2"]);
  });
});

describe("a # pick travels with the dump (AC-14)", () => {
  it("sends the picks on a thread dump, and nothing from Today", async () => {
    const dump = await import("../lib/dump");
    reply = { status: 202, data: { messageId: "m1", conversationId: "c1", state: "seen", turnId: "t" } };
    await dump.sendDump("ferry #Istanbul", "k1", "t1", undefined, [], [{ id: "l1" }, { name: "Boats" }]);
    await dump.sendDump("ferry #Istanbul", "k2", undefined, undefined, [], [{ id: "l1" }]);
    expect(JSON.parse(String(calls[0]?.init.body)).labels).toEqual([{ id: "l1" }, { name: "Boats" }]);
    expect(JSON.parse(String(calls[1]?.init.body)).labels).toBeUndefined();
  });
});

describe("a labelled row in Activity (AC-27, AC-28)", () => {
  it("opens its thread, says Undone once undone, and undoes through its route", async () => {
    const activity = await import("../lib/activity");
    const row = {
      id: "a1", kind: "labelled" as const, sent: false, reason: "design" as const, title: "Sorted", body: null,
      send: null, threadId: "t1", contentId: null, memberId: null, requestId: null, occurredAt: "2026-09-27T00:00:00Z",
      undoable: true, undone: false,
    };
    expect(activity.doorOf(row)).toEqual({ pathname: "/threads/[id]", params: { id: "t1" } });
    expect(activity.tagOf(row)).toBeNull();
    expect(activity.tagOf({ ...row, undone: true })).toEqual({ label: "Undone", tone: "quiet" });
    reply = { status: 200, data: { undone: true } };
    expect(await activity.undoActivity("a1")).toBe("undone");
    expect(calls.at(-1)).toMatchObject({ path: "/v1/activity/a1/undo", init: { method: "POST" } });
    reply = { status: 409, data: null, error: "not_undoable" };
    expect(await activity.undoActivity("a1")).toBe("refused");
    reply = { status: 0, data: null };
    expect(await activity.undoActivity("a1")).toBe("failed");
  });
});

describe("a refused label says why, beside the control", () => {
  it("says no more than it knows about a refused name", () => {
    expect(labels.refusalLine("bad_label_name")).toBe("Couldn't save that.");
    expect(labels.refusalLine(null)).toBe("Couldn't save that.");
  });
});

describe("a write that makes labels first (2026-09-29)", () => {
  // Made first, then the row's edit carries them. A failure part way through
  // took back nothing, so Retry met its own first label as taken and could
  // never land, and Undo deleted the new labels even when putting the row
  // back had failed.
  function fakes(options: { failMakeOnce?: string; failEditAt?: number } = {}) {
    const made: string[] = [];
    const dropped: string[] = [];
    const edits: unknown[] = [];
    const taken = new Set<string>();
    let failed = false;
    return {
      made,
      dropped,
      edits,
      steps: {
        make: async (name: string) => {
          if (taken.has(name)) return null;
          if (name === options.failMakeOnce && !failed) {
            failed = true;
            return null;
          }
          taken.add(name);
          made.push(name);
          return `id:${name}`;
        },
        edit: async (patch: { labels?: string[]; title?: string }) => {
          edits.push(patch);
          return edits.length === options.failEditAt ? null : { labels: ["old"] };
        },
        undo: (previous: { labels: string[] }) => ({ labels: previous.labels }),
        drop: async (id: string) => {
          dropped.push(id);
          taken.delete(id.slice(3));
        },
      },
    };
  }

  it("makes the labels, then writes them onto the row with the rest", async () => {
    const f = fakes();
    const write = labels.withMadeLabels(f.steps, { title: "T", labels: ["a"] }, ["B", "C"]);
    expect(await write.write()).toBe(true);
    expect(f.edits).toEqual([{ title: "T", labels: ["a", "id:B", "id:C"] }]);
  });

  it("takes back what it made when a later label fails, so Retry can land", async () => {
    const f = fakes({ failMakeOnce: "C" });
    const write = labels.withMadeLabels(f.steps, { labels: [] }, ["B", "C"]);
    expect(await write.write()).toBe(false);
    expect(f.dropped).toEqual(["id:B"]);
    expect(await write.write()).toBe(true);
    expect(f.edits).toEqual([{ labels: ["id:B", "id:C"] }]);
  });

  it("takes back what it made when the edit itself fails", async () => {
    const f = fakes({ failEditAt: 1 });
    const write = labels.withMadeLabels(f.steps, { labels: [] }, ["B"]);
    expect(await write.write()).toBe(false);
    expect(f.dropped).toEqual(["id:B"]);
  });

  it("deletes the made labels on Undo only once the row is put back", async () => {
    const f = fakes({ failEditAt: 2 });
    const write = labels.withMadeLabels(f.steps, { labels: [] }, ["B"]);
    expect(await write.write()).toBe(true);
    expect(await write.unwrite()).toBe(false);
    expect(f.dropped).toEqual([]);
    expect(await write.unwrite()).toBe(true);
    expect(f.edits[2]).toEqual({ labels: ["old"] });
    expect(f.dropped).toEqual(["id:B"]);
  });
});

describe("a sent digest in Activity", () => {
  // 2026-09-30, the owner's call: the row opens Today, where the notification
  // itself opens, rather than being a record that goes nowhere.
  it("opens Today, and a suppressed one still opens the setting", async () => {
    const activity = await import("../lib/activity");
    const row = {
      id: "a2", kind: "digest" as const, sent: true, reason: null, title: "Five still open", body: "Call the plumber, and four more.",
      send: "morning" as const, threadId: null, contentId: null, memberId: null, requestId: null, occurredAt: "2026-09-30T07:00:00Z",
      undoable: false, undone: false,
    };
    // "/today", not "/": the index is launch, which asks the server who you
    // are before it forwards, and offline holds on its failure line.
    expect(activity.doorOf(row)).toEqual({ pathname: "/today" });
    expect(activity.doorOf({ ...row, sent: false, reason: "setting" as const })).toEqual({ pathname: "/settings/notifications" });
  });
});
