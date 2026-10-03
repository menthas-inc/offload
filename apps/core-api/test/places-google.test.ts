// 030 T1.3. The only module that talks to Google's place APIs.
//
// The fixtures are real responses captured on 2026-10-02 with the cheap
// field masks (test/fixtures/google). What is asserted here is what we send,
// because the field mask is the bill and an unknown body key is a refusal.

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { details, kindOf, searchId } from "../src/places/google.js";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/google/${name}.json`, import.meta.url), "utf8")) as unknown;

type Call = { url: string; init: RequestInit };

function stubFetch(body: unknown, status = 200): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const KEY = "test-key";

describe("searchId", () => {
  it("asks for the place id alone, with the query and one result and nothing else", async () => {
    const calls = stubFetch(fixture("search-restaurant"));
    const id = await searchId("Cervejaria Ramiro", KEY);
    expect(id).toMatch(/^ChIJ/);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("x-goog-fieldmask")).toBe("places.id");
    expect(headers.get("x-goog-api-key")).toBe(KEY);
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("referer")).toBeNull();
    expect([...headers.keys()].sort()).toEqual(["content-type", "x-goog-api-key", "x-goog-fieldmask"]);
    expect(JSON.parse(String(init.body))).toEqual({ textQuery: "Cervejaria Ramiro", pageSize: 1 });
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(init.credentials).toBe("omit");
  });

  it("returns null when Google finds nothing", async () => {
    stubFetch({});
    expect(await searchId("nowhere at all", KEY)).toBeNull();
  });

  it("swallows a provider error without reading it", async () => {
    stubFetch({ error: { message: "the query was Cervejaria Ramiro" } }, 500);
    await expect(searchId("Cervejaria Ramiro", KEY)).rejects.toThrow(/^places 500$/);
  });
});

describe("details", () => {
  it("asks for the coordinates and the kind alone", async () => {
    const calls = stubFetch(fixture("details-restaurant"));
    const place = await details("ChIJabc", KEY);
    expect(place).toEqual({ lat: expect.any(Number), lng: expect.any(Number), types: expect.arrayContaining(["restaurant"]) });
    const { url, init } = calls[0]!;
    expect(url).toBe("https://places.googleapis.com/v1/places/ChIJabc");
    expect(new Headers(init.headers).get("x-goog-fieldmask")).toBe("location,types");
    expect(init.body).toBeUndefined();
  });

  it("refuses an id that would change the path", async () => {
    const calls = stubFetch(fixture("details-restaurant"));
    await expect(details("../places:searchText", KEY)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("kindOf", () => {
  const types = (name: string) => (fixture(`details-${name}`) as { types: string[] }).types;

  it("calls a country or a region too coarse to draw", () => {
    expect(kindOf(types("country"))).toBe("coarse");
    expect(kindOf(["administrative_area_level_1", "political"])).toBe("coarse");
  });

  it("calls a neighbourhood, a locality and a postcode an area", () => {
    expect(kindOf(types("neighbourhood"))).toBe("area");
    expect(kindOf(types("postcode"))).toBe("area");
    expect(kindOf(["locality", "political"])).toBe("area");
  });

  it("calls a restaurant and a landmark a spot", () => {
    expect(kindOf(types("restaurant"))).toBe("spot");
    expect(kindOf(types("landmark"))).toBe("spot");
  });
});
