// 2026-11-02 (the owner). A number in a row's details becomes one Call pill,
// and the details are editable in the row's sheet without touching the words
// read out of the picture.

import { describe, expect, it } from "vitest";
import { phoneIn, withCaption } from "./photos.js";

describe("phoneIn", () => {
  const dana = { shown: "+1 212 555 0142", tel: "tel:+12125550142" };

  it("finds the number in an event's details, written the way filing writes it", () => {
    expect(
      phoneIn(
        "Call at 11:30, you are calling her. Venue inquiry for an event around 70 people. Her number is +12125550142.\n\nTaken on 1 November.",
      ),
    ).toEqual(dana);
  });

  it("reads the usual US ways of writing one", () => {
    for (const text of ["(212) 555-0142", "212.555.0142", "212-555-0142", "1 212 555 0142", "+1 (212) 555-0142", "call 2125550142 now"]) {
      expect(phoneIn(text), text).toEqual(dana);
    }
  });

  it("keeps a number from another country as it was written", () => {
    expect(phoneIn("Office +44 20 7946 0958, ask for Ana")).toEqual({ shown: "+44 20 7946 0958", tel: "tel:+442079460958" });
  });

  it("takes the first of two", () => {
    expect(phoneIn("Her 212 555 0142, his 312 555 0199")).toEqual(dana);
  });

  it("finds nothing in dates, times, counts and long ids", () => {
    for (const text of [
      "2026-11-02 11:30",
      "around 70 people",
      "Order 12345678901234567890",
      "Booking 1234567",
      "Ref 0123456789",
      "price 2,125,550,142",
      "call 212 555\n0142",
      "",
    ]) {
      expect(phoneIn(text), text).toBeNull();
    }
    expect(phoneIn(null)).toBeNull();
    expect(phoneIn(undefined)).toBeNull();
  });
});

describe("withCaption", () => {
  it("replaces the caption and keeps the words read out of the picture", () => {
    expect(withCaption("Why it was kept\nWhat is in it\nText: Dana R. 212 555 0142", "Call Dana")).toBe(
      "Call Dana\nText: Dana R. 212 555 0142",
    );
  });

  it("writes a body with no words as the caption alone", () => {
    expect(withCaption("Old details", "New details")).toBe("New details");
    expect(withCaption(null, "New details")).toBe("New details");
  });

  it("keeps the words when the caption is emptied, and clears a body that held only a caption", () => {
    expect(withCaption("Old\nText: abc", "  ")).toBe("Text: abc");
    expect(withCaption("Old", "")).toBeNull();
  });
});
