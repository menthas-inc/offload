// Looking somebody up, from the phone's side.
//
// Security review 2026-09-22, M15. The address went in the query string, and a
// query string is what the platform's request logs keep, while the privacy page
// says logs never carry what was in a request.

import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: { path: string; init: RequestInit }[] = [];

vi.mock("../lib/api", () => ({
  send: async (path: string, init: RequestInit = {}) => {
    sent.push({ path, init });
    return { status: 200, data: { found: null } };
  },
}));
// The mark cache reaches for native drawing; nothing here draws.
vi.mock("../lib/marks", () => ({ rememberMark: () => undefined }));

const { lookup } = await import("../lib/people");

beforeEach(() => {
  sent.length = 0;
});

describe("looking somebody up", () => {
  it("sends the address in the body and never in the path", async () => {
    expect(await lookup(" Ana@Example.com ")).toEqual({ kind: "found", found: null });
    expect(sent).toHaveLength(1);
    const { path, init } = sent[0]!;
    expect(path).toBe("/v1/people/lookup");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ email: "Ana@Example.com" });
  });
});
