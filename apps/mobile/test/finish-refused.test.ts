// Finish it on a turn that stopped partway, when the resume is refused. It
// did nothing and said nothing: over the day's cap, offline, or already
// finished from another device.

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

let answer: { status: number; data: unknown } = { status: 0, data: null };
vi.mock("../lib/api", () => ({
  send: () => Promise.resolve(answer),
  upload: () => Promise.resolve({ status: 200, data: null }),
}));
vi.mock("expo-file-system", () => ({ File: class {} }));

const { resumeDump } = await import("../lib/dump");

describe("resumeDump", () => {
  it("says why it was refused", async () => {
    answer = { status: 429, data: null };
    expect(await resumeDump("m1")).toBe("daily_limit");
    answer = { status: 409, data: null };
    expect(await resumeDump("m1")).toBe("not_finishable");
    // Gone, so asking again can never work: no Retry.
    answer = { status: 404, data: null };
    expect(await resumeDump("m1")).toBe("not_finishable");
    answer = { status: 500, data: null };
    expect(await resumeDump("m1")).toBe("failed");
    answer = { status: 0, data: null };
    expect(await resumeDump("m1")).toBe("failed");
  });

  it("is the envelope when it went", async () => {
    const sent = { messageId: "m1", conversationId: "v1", state: "seen", turnId: "t1" };
    answer = { status: 200, data: sent };
    expect(await resumeDump("m1")).toEqual(sent);
  });
});

describe("finish on the phones", () => {
  const context = readFileSync(`${process.cwd()}/components/shell/conversation-context.tsx`, "utf8");
  const finish = context.slice(context.indexOf("const finish = useCallback"), context.indexOf("const close = end;"));

  it("closes for the day over the cap, the way a refused send does", () => {
    expect(finish).toMatch(/sent === "daily_limit"[\s\S]*setRefusedToday\(true\)/);
  });

  it("says so with Retry when it failed", () => {
    expect(finish).toMatch(/sent === "failed"[\s\S]*notify\("Couldn't finish that", \{ label: "Retry"/);
  });

  it("asks about the turn again when it is no longer finishable", () => {
    expect(finish).toMatch(/sent === "not_finishable"[\s\S]*watch\(messageId/);
  });
});
