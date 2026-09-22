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
