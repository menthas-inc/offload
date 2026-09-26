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
