// The API layer's own rules, which are easy to get wrong and invisible when
// they are. Every one of these was a real bug on the web client first.

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; init: RequestInit }[] = [];
let reply: { status: number; data: unknown } = { status: 200, data: null };

vi.mock("../lib/api", () => ({
  send: (path: string, init: RequestInit = {}) => {
    calls.push({ path, init });
    return Promise.resolve(reply);
  },
}));

const threads = await import("../lib/threads");

beforeEach(() => {
  calls.length = 0;
  reply = { status: 200, data: null };
});

describe("a request with no body never claims one", () => {
  // The web shipped two deletes that did nothing because they sent
  // content-type: application/json with an empty body and Fastify refused
  // them. Here the header is decided from the body rather than from which
  // constant somebody reached for, so the mistake is not available. This
  // asserts the calls carry no body rather than the header, because the header
  // is now api.ts's business.
  it("sends no body when deleting or restoring", async () => {
    await threads.deleteThread("t1");
    await threads.restoreThread("t1");
    await threads.deleteMemory("m1");
    await threads.restoreMemory("m1");
    for (const call of calls) expect(call.init.body).toBeUndefined();
  });

  it("sends one when there is something to say", async () => {
    await threads.addMemory("t1", "Todo names in three words");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ text: "Todo names in three words" }));
  });
});

describe("the cap and the length limit are answers, not failures", () => {
  it("says which one happened", async () => {
    reply = { status: 409, data: null };
    expect(await threads.addMemory("t1", "one too many")).toEqual({ full: true });

    reply = { status: 413, data: null };
    expect(await threads.addMemory("t1", "x".repeat(201))).toEqual({ tooLong: true });
  });
});

describe("the place id the shared widget rule needs", () => {
  it("is derived at the edge, so nothing above knows the shapes differ", async () => {
    reply = {
      status: 200,
      data: {
        rows: [
          { id: "c1", place: { id: "p1" }, tags: [] },
          { id: "c2", place: null, tags: [] },
        ],
        nextCursor: null,
      },
    };
    const page = await threads.fetchContent("t1");
    expect(page?.rows.map((r) => r.placeId)).toEqual(["p1", null]);
  });
});

describe("the chip label", () => {
  it("shows a short memory whole and truncates a long one on a word", () => {
    expect(threads.chipLabel("Todo names in three words")).toBe("Todo names in three words");
    const long = threads.chipLabel(
      "Anything about brackets, screws or timber belongs in here rather than the shopping list"
    );
    expect(long.endsWith("...")).toBe(true);
    expect(long).not.toContain(" ...");
  });
});
