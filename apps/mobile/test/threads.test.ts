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
    await threads.deleteNote("n1");
    await threads.restoreNote("n1");
    for (const call of calls) expect(call.init.body).toBeUndefined();
  });

  it("sends one when there is something to say", async () => {
    await threads.addNote("t1", "Todo names in three words");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ text: "Todo names in three words" }));
  });
});

describe("nothing is refused for being one too many", () => {
  it("has no cap left to hit, and still says when a sentence is too long", async () => {
    // 008 answered 409 at ten and the screen said so. 014 made the hundred a
    // prompt budget rather than a wall, so the only refusal left is length.
    reply = { status: 413, data: null };
    expect(await threads.addNote("t1", "x".repeat(201))).toEqual({ tooLong: true });
  });
});

describe("the place id the shared widget rule needs", () => {
  it("is derived at the edge, so nothing above knows the shapes differ", async () => {
    reply = {
      status: 200,
      data: {
        rows: [
          { id: "c1", place: { id: "p1" } },
          { id: "c2", place: null },
        ],
        nextCursor: null,
      },
    };
    const page = await threads.fetchContent("t1");
    expect(page?.rows.map((r) => r.placeId)).toEqual(["p1", null]);
  });
});

describe("moving a row is a priority, through the endpoint a priority always used", () => {
  it("sends the number to the content route and hands back what it was", async () => {
    reply = { status: 200, data: { previous: { priority: 50, priorityPinned: false } } };
    const result = await threads.setPriority("c1", 70);
    expect(calls[0]?.path).toBe("/v1/content/c1/priority");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ priority: 70 }));
    expect(result?.previous.priority).toBe(50);
  });

  it("sends a note's number to the note route", async () => {
    reply = { status: 200, data: { previous: { priority: 50 } } };
    const result = await threads.setNotePriority("n1", 75);
    expect(calls[0]?.path).toBe("/v1/notes/n1/priority");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ priority: 75 }));
    expect(result?.previous.priority).toBe(50);
  });
});

describe("what a tap on a row does (2026-09-29)", () => {
  // The row's tools went from the row to its sheet: a tap opens the edit
  // sheet, which carries delete and labels. A link keeps the tap for the page.
  const row = (fields: Partial<import("../lib/threads").ContentRow>) =>
    ({ type: "task", url: null, archivedAt: null, canDelete: true, ...fields }) as import("../lib/threads").ContentRow;

  it("opens the edit sheet on your own row", () => {
    expect(threads.rowTap(row({}))).toBe("edit");
    expect(threads.rowTap(row({ archivedAt: "2026-09-01T00:00:00Z" }))).toBe("edit");
  });

  it("opens the page on a link with an address", () => {
    expect(threads.rowTap(row({ type: "link", url: "https://example.com" }))).toBe("open");
  });

  it("edits a link with no address, or one that is archived", () => {
    expect(threads.rowTap(row({ type: "link", url: null }))).toBe("edit");
    expect(threads.rowTap(row({ type: "link", url: "https://example.com", archivedAt: "2026-09-01T00:00:00Z" }))).toBe("edit");
  });

  it("offers the row's actions on somebody else's row, which you cannot edit", () => {
    expect(threads.rowTap(row({ canDelete: false }))).toBe("actions");
  });
});
