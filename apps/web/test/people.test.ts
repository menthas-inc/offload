// Looking somebody up, from the browser's side.
//
// Security review 2026-09-22, M15. The address went in the query string, and a
// query string is what the platform's request logs keep, while the privacy page
// says logs never carry what was in a request.

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { url: string; init: RequestInit | undefined }[] = [];

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  return new Response(JSON.stringify({ found: null }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

const { lookup } = await import("../src/lib/people");

beforeEach(() => {
  calls.length = 0;
});

describe("looking somebody up", () => {
  it("sends the address in the body and never in the path", async () => {
    expect(await lookup(" Ana@Example.com ")).toEqual({ kind: "found", found: null });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url.endsWith("/v1/people/lookup")).toBe(true);
    expect(url).not.toContain("?");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "Ana@Example.com" });
    expect(init?.credentials).toBe("include");
  });
});

// 031. What the connect step draws, out of the component, as the phones have
// it: a lookup's answer, including the refused one, and a request's refusals.
describe("what a lookup draws", () => {
  const found = {
    accountId: "p9",
    displayName: "Lena Hart",
    initials: "LH",
    email: "lena@hart.studio",
    relation: "none" as const,
    requestId: null,
    since: null,
    mark: "",
  };

  it("says a refused lookup in its own line, and every other answer as it is", async () => {
    const { LOOKUP_LIMITED, stateOfLookup } = await import("../src/lib/people");
    expect(LOOKUP_LIMITED).toBe("Too many lookups. Try again in a few minutes.");
    expect(stateOfLookup({ kind: "rate_limited" })).toEqual({ kind: "limited" });
    expect(stateOfLookup({ kind: "failed" })).toEqual({ kind: "failed" });
    expect(stateOfLookup({ kind: "found", found: null })).toEqual({ kind: "none" });
    expect(stateOfLookup({ kind: "found", found })).toEqual({ kind: "found", found });
  });

  it("turns a request's answer into the row it leaves", async () => {
    const { stateOfRequest } = await import("../src/lib/people");
    expect(stateOfRequest(found, { ok: true, requestId: "r9", since: "2026-09-28T10:00:00Z" })).toEqual({
      kind: "found",
      found: { ...found, relation: "you_asked", requestId: "r9", since: "2026-09-28T10:00:00Z" },
    });
    expect(stateOfRequest(found, { ok: false, error: "connected" })).toEqual({ kind: "found", found: { ...found, relation: "connected" } });
    expect(stateOfRequest(found, { ok: false, error: "pending", requestId: "r1" })).toEqual({
      kind: "found",
      found: { ...found, relation: "you_asked", requestId: "r1" },
    });
    expect(stateOfRequest(found, { ok: false, error: "asked_you", requestId: "r2" })).toEqual({
      kind: "found",
      found: { ...found, relation: "asked_you", requestId: "r2" },
    });
    expect(stateOfRequest(found, { ok: false, error: "too_soon" })).toEqual({
      kind: "found",
      found,
      line: "You asked recently. Try again in a week.",
    });
    expect(stateOfRequest(found, { ok: false, error: "not_found" })).toEqual({ kind: "none" });
    expect(stateOfRequest(found, { ok: false, error: "too_many" })).toEqual({ kind: "failed" });
    expect(stateOfRequest(found, { ok: false, error: "failed" })).toEqual({ kind: "failed" });
  });
});
