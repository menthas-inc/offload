// 031. The two lines on the settings pages that are computed rather than
// written: where the email came from, and what Connected apps has connected.

import { describe, expect, it } from "vitest";
import { appsValue, deviceGlyph, emailNote } from "../lib/settings";

describe("Email's note (AC-4)", () => {
  it("names the one provider", () => {
    expect(emailNote(["google"])).toBe("From your Google sign in. Changing it is not done here.");
    expect(emailNote(["apple"])).toBe("From your Apple sign in. Changing it is not done here.");
  });

  it("names neither when there are two, or none to read", () => {
    expect(emailNote(["apple", "google"])).toBe("From your sign in. Changing it is not done here.");
    expect(emailNote([])).toBe("From your sign in. Changing it is not done here.");
  });
});

describe("Connected apps on the index (AC-14)", () => {
  it("says what is connected, calendar first", () => {
    expect(appsValue({ calendar: true, mail: true })).toBe("Calendar, Mail");
    expect(appsValue({ calendar: false, mail: true })).toBe("Mail");
    expect(appsValue({ calendar: true, mail: false })).toBe("Calendar");
  });

  it("says nothing when nothing is", () => {
    expect(appsValue({ calendar: false, mail: false })).toBeUndefined();
  });
});

describe("a session's glyph (AC-5)", () => {
  it("is a phone for the app and a screen for a browser", () => {
    expect(deviceGlyph("The app on iPhone")).toBe("smartphone");
    expect(deviceGlyph("The app")).toBe("smartphone");
    expect(deviceGlyph("Chrome on Mac")).toBe("monitor");
    expect(deviceGlyph("A device")).toBe("monitor");
  });
});
