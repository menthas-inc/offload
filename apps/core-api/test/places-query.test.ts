// The one gate in front of Google (030 T1.2).
//
// Google's terms forbid sending it any end user's personal information, and
// its results are kept on our side under rules of its own. This file is what
// decides whether a string may leave at all, so it is tested by what it
// refuses as much as by what it lets through.

import { describe, expect, it } from "vitest";
import { placeQuery, queryKey } from "../src/places/query.js";

describe("placeQuery", () => {
  it("lets a public place's name through, tidied", () => {
    expect(placeQuery("Time Out Market")).toBe("Time Out Market");
    expect(placeQuery("  Cervejaria   Ramiro ")).toBe("Cervejaria Ramiro");
    expect(placeQuery("Zoomarine")).toBe("Zoomarine");
    expect(placeQuery("Café A Brasileira")).toBe("Café A Brasileira");
  });

  it("strips control characters before deciding", () => {
    expect(placeQuery("Time\u0000 Out\u0007 Market")).toBe("Time Out Market");
  });

  it("refuses anything with a digit, where addresses and numbers live", () => {
    expect(placeQuery("Rua Augusta 12")).toBeNull();
    expect(placeQuery("Terminal 2")).toBeNull();
    expect(placeQuery("1000-001 Lisboa")).toBeNull();
    expect(placeQuery("call 912 345 678")).toBeNull();
  });

  it("refuses an address, a link and a mailbox", () => {
    expect(placeQuery("ana@example.com")).toBeNull();
    expect(placeQuery("https://meet.example.com/abc")).toBeNull();
    expect(placeQuery("www.timeoutmarket.com")).toBeNull();
  });

  it("refuses a person's place, with either apostrophe", () => {
    expect(placeQuery("Ana's")).toBeNull();
    expect(placeQuery("Ana’s place")).toBeNull();
    expect(placeQuery("dinner at Joao's")).toBeNull();
  });

  it("refuses a call or a place that is not one, as whole words only", () => {
    for (const word of ["Zoom", "Google Meet", "Teams", "Webex", "Whereby", "Jitsi", "online", "Phone", "call", "TBC", "TBD"]) {
      expect(placeQuery(word), word).toBeNull();
    }
    expect(placeQuery("Teams meeting room")).toBeNull();
    expect(placeQuery("Online")).toBeNull();
  });

  it("refuses an empty, a long or a multi-line string", () => {
    expect(placeQuery("")).toBeNull();
    expect(placeQuery("   ")).toBeNull();
    expect(placeQuery("a".repeat(121))).toBeNull();
    expect(placeQuery("a".repeat(120))).toBe("a".repeat(120));
    expect(placeQuery("Time Out\nMarket")).toBeNull();
    expect(placeQuery("Time Out\r\nMarket")).toBeNull();
  });
});

describe("queryKey", () => {
  it("is the same for case and spacing, and differs by pepper", () => {
    const a = queryKey("Time Out Market", "pepper-one");
    expect(queryKey("time out market", "pepper-one")).toBe(a);
    expect(queryKey("Time Out Market", "pepper-two")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to make a key with no pepper", () => {
    expect(() => queryKey("Time Out Market", "")).toThrow();
  });
});
