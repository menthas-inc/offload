// The zone list, the name a person reads, and when the strip shows. 023.
//
// All three live in the shared widgets package because every client needs
// the same answers: which zones exist, what to call one, and whether the
// device's word differs from the account's clock. Tested here because the
// package has no suite of its own and this is where its rule and day
// arithmetic are already proved.

import { describe, expect, it } from "vitest";
import { KNOWN_ZONES, modernZoneName, zoneCity, zoneStrip, zonesByRegion } from "@offload/widgets";
import { resolveTimeZone } from "../src/time-zone.js";

describe("023 AC-3 a zone's name", () => {
  it("is its city, never its region or an offset", () => {
    expect(zoneCity("Europe/Lisbon")).toBe("Lisbon");
    expect(zoneCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(zoneCity("America/Port-au-Prince")).toBe("Port-au-Prince");
    expect(zoneCity("UTC")).toBe("UTC");
  });

  it("is the city's current name even when ICU still spells it the old way", () => {
    expect(zoneCity("Asia/Calcutta")).toBe("Kolkata");
    expect(zoneCity("Europe/Kiev")).toBe("Kyiv");
    expect(zoneCity("America/Buenos_Aires")).toBe("Buenos Aires");
  });
});

describe("023 AC-1 the name that is stored", () => {
  it("is the modern IANA name, whichever spelling ICU resolves to", () => {
    expect(modernZoneName("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(modernZoneName("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(modernZoneName("Europe/Kiev")).toBe("Europe/Kyiv");
    expect(modernZoneName("America/Buenos_Aires")).toBe("America/Argentina/Buenos_Aires");
    expect(modernZoneName("Europe/Lisbon")).toBe("Europe/Lisbon");
  });

  it("so a phone in Kolkata and the account it set agree, and the strip stays quiet", () => {
    // Node's ICU resolves Asia/Kolkata to Asia/Calcutta. Stored as sent back
    // by ICU, the account's clock and the phone's own word would differ by
    // spelling alone and the strip would offer a switch to the zone it is in.
    expect(resolveTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(resolveTimeZone("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(resolveTimeZone("Europe/Kyiv")).toBe("Europe/Kyiv");
    expect(resolveTimeZone("Not/AZone")).toBeNull();
  });
});

describe("023 AC-6 the zone list", () => {
  it("is grouped by region, cities in order, and every name is one the runtime can draw in", () => {
    const groups = zonesByRegion();
    expect(groups.map((group) => group.region)).toEqual([
      "Africa", "America", "Antarctica", "Arctic", "Asia", "Atlantic", "Australia", "Europe", "Indian", "Pacific",
    ]);
    const europe = groups.find((group) => group.region === "Europe")!;
    expect(europe.zones.map((zone) => zone.name)).toContain("Europe/Lisbon");
    expect(europe.zones.map((zone) => zone.name)).toContain("Europe/Kyiv");
    expect(europe.zones.map((zone) => zone.name)).not.toContain("Europe/Kiev");
    const cities = europe.zones.map((zone) => zone.city);
    expect(cities).toEqual([...cities].sort((a, b) => a.localeCompare(b, "en")));
    for (const group of groups) {
      for (const zone of group.zones) {
        expect(() => new Intl.DateTimeFormat("en", { timeZone: zone.name })).not.toThrow();
      }
    }
  });

  it("the shipped list, for a runtime without Intl.supportedValuesOf, is this runtime's own list", () => {
    // Hermes has no supportedValuesOf, so the phones read a list checked in
    // beside the function. It must be the same list Node would give, so that
    // a newer ICU here shows up as a failure with the names in it rather than
    // as a zone a phone cannot pick. Regenerate with
    // `node packages/widgets/scripts/zones.mjs`.
    expect([...KNOWN_ZONES].sort()).toEqual([...Intl.supportedValuesOf("timeZone")].sort());
  });
});

describe("023 AC-3 when the strip shows", () => {
  const me = { timeZone: "Europe/Lisbon", followDevice: true, keptTimeZone: null };

  it("when the device differs, follow is on and the device's zone was not kept", () => {
    expect(zoneStrip(me, "Asia/Tokyo")).toEqual({ account: "Europe/Lisbon", device: "Asia/Tokyo" });
  });

  it("not when they agree, the device will not say, or the account has no clock yet", () => {
    expect(zoneStrip(me, "Europe/Lisbon")).toBeNull();
    expect(zoneStrip(me, null)).toBeNull();
    expect(zoneStrip({ ...me, timeZone: null }, "Asia/Tokyo")).toBeNull();
  });

  it("not when the two names are one zone spelt two ways", () => {
    expect(zoneStrip({ ...me, timeZone: "Asia/Calcutta" }, "Asia/Kolkata")).toBeNull();
  });

  it("not when follow is off, not for the one zone they kept, and again for a third", () => {
    expect(zoneStrip({ ...me, followDevice: false }, "Asia/Tokyo")).toBeNull();
    expect(zoneStrip({ ...me, keptTimeZone: "Asia/Tokyo" }, "Asia/Tokyo")).toBeNull();
    expect(zoneStrip({ ...me, keptTimeZone: "Asia/Tokyo" }, "America/New_York")).toEqual({
      account: "Europe/Lisbon",
      device: "America/New_York",
    });
  });
});
