// People, both clients. 022.

import { describe, expect, it } from "vitest";
import { dayMonth, firstNameOf, nameOf, stateOfLookup } from "../src/index.js";

describe("a person's name", () => {
  it("is Someone when there is none, and the first word for a sentence", () => {
    expect(nameOf({ displayName: null })).toBe("Someone");
    expect(firstNameOf({ displayName: "Ana Lima" })).toBe("Ana");
    expect(firstNameOf({ displayName: null })).toBe("Someone");
  });
});

describe("a lookup's answer", () => {
  it("is found, none, limited or failed", () => {
    const found = { accountId: "a" };
    expect(stateOfLookup({ kind: "found", found })).toEqual({ kind: "found", found });
    expect(stateOfLookup({ kind: "found", found: null })).toEqual({ kind: "none" });
    expect(stateOfLookup({ kind: "rate_limited" })).toEqual({ kind: "limited" });
    expect(stateOfLookup({ kind: "failed" })).toEqual({ kind: "failed" });
  });
});

describe("a date on a person row", () => {
  it("is drawn in the account's zone, whatever the device's", () => {
    const device = process.env["TZ"];
    process.env["TZ"] = "America/Los_Angeles";
    try {
      expect(dayMonth("2026-10-04T02:00:00Z", "Europe/Lisbon")).toBe("4 Oct");
      expect(dayMonth("2026-10-04T02:00:00Z", "Pacific/Honolulu")).toBe("3 Oct");
    } finally {
      if (device === undefined) delete process.env["TZ"];
      else process.env["TZ"] = device;
    }
  });
});
