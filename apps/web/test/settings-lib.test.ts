// 031 Settings, tightened: the copy that is logic, as pure functions.
//
// The Email note from the sign-in providers (AC-4), the index's Connected apps
// value (AC-14), the pane head summaries, and the combobox's filter (AC-6),
// which is the phones' picker rule: name contains, or code equals.

import { describe, expect, it } from "vitest";
import {
  appsValue,
  clockSummary,
  deviceGlyph,
  emailNote,
  matchesFilter,
  notifySummary,
  peopleSummary,
} from "../src/lib/settings";

describe("the Email note (AC-4)", () => {
  it("names the one provider, and neither when there are two or none", () => {
    expect(emailNote(["google"])).toBe("From your Google sign in. Changing it is not done here.");
    expect(emailNote(["apple"])).toBe("From your Apple sign in. Changing it is not done here.");
    expect(emailNote(["apple", "google"])).toBe("From your sign in. Changing it is not done here.");
    expect(emailNote([])).toBe("From your sign in. Changing it is not done here.");
  });
});

describe("what is connected (AC-14)", () => {
  it("is the index value, or nothing", () => {
    expect(appsValue({ calendar: true, mail: true })).toBe("Calendar, Mail");
    expect(appsValue({ calendar: false, mail: true })).toBe("Mail");
    expect(appsValue({ calendar: true, mail: false })).toBe("Calendar");
    expect(appsValue({ calendar: false, mail: false })).toBeUndefined();
  });
});

describe("the pane head summaries", () => {
  it("says the clock's city and the week's first day", () => {
    expect(clockSummary("Europe/Lisbon", "monday")).toBe("Lisbon, weeks start Monday");
    expect(clockSummary("America/New_York", "sunday")).toBe("New York, weeks start Sunday");
    expect(clockSummary(null, "monday")).toBe("Weeks start Monday");
  });

  it("counts connections and who is waiting, and says nothing at zero", () => {
    expect(peopleSummary(3, 0)).toBe("3 connected");
    expect(peopleSummary(3, 1)).toBe("3 connected, 1 waiting on you");
    expect(peopleSummary(0, 2)).toBe("2 waiting on you");
    expect(peopleSummary(0, 0)).toBeUndefined();
  });

  it("names the hours of the switches that are on", () => {
    const me = {
      notifyDueToday: true,
      notifyDueTodayAt: "08:00",
      notifyComingTomorrow: true,
      notifyComingTomorrowAt: "19:00",
    };
    expect(notifySummary(me)).toBe("Mornings at 08:00, evenings at 19:00");
    expect(notifySummary({ ...me, notifyComingTomorrow: false })).toBe("Mornings at 08:00");
    expect(notifySummary({ ...me, notifyDueToday: false })).toBe("Evenings at 19:00");
    expect(notifySummary({ ...me, notifyDueToday: false, notifyComingTomorrow: false })).toBeUndefined();
  });

  it("counts Reminders among what is on (042, AC-22)", () => {
    const me = {
      notifyDueToday: true,
      notifyDueTodayAt: "08:00",
      notifyComingTomorrow: true,
      notifyComingTomorrowAt: "19:00",
      notifyReminders: true,
    };
    expect(notifySummary(me)).toBe("Mornings at 08:00, evenings at 19:00, with reminders");
    expect(notifySummary({ ...me, notifyComingTomorrow: false })).toBe("Mornings at 08:00, with reminders");
    expect(notifySummary({ ...me, notifyDueToday: false, notifyComingTomorrow: false })).toBe("Reminders");
    expect(notifySummary({ ...me, notifyReminders: false })).toBe("Mornings at 08:00, evenings at 19:00");
  });

  it("has no dashes in anything it says", () => {
    const all = [
      emailNote(["google"]),
      emailNote([]),
      appsValue({ calendar: true, mail: true }),
      clockSummary("Europe/Lisbon", "monday"),
      peopleSummary(3, 1),
    ].join(" ");
    expect(all).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("the combobox's filter (AC-6)", () => {
  const portugal = { label: "Portugal", code: "PT" };
  it("matches a name that contains the text, whatever its case", () => {
    expect(matchesFilter(portugal, "tug")).toBe(true);
    expect(matchesFilter(portugal, "PORT")).toBe(true);
    expect(matchesFilter(portugal, "spain")).toBe(false);
  });

  it("matches a code only when it is the whole code", () => {
    expect(matchesFilter(portugal, "pt")).toBe(true);
    expect(matchesFilter({ label: "Qatar", code: "QA" }, "q")).toBe(true);
    expect(matchesFilter({ label: "Germany", code: "DE" }, "d")).toBe(false);
  });

  it("matches everything with no text", () => {
    expect(matchesFilter(portugal, "")).toBe(true);
    expect(matchesFilter(portugal, "  ")).toBe(true);
  });
});

describe("a signed-in session's glyph (AC-5)", () => {
  it("is the phone for the app, and the screen for a browser", () => {
    expect(deviceGlyph("The app on iPhone")).toBe("smartphone");
    expect(deviceGlyph("The app on Android")).toBe("smartphone");
    expect(deviceGlyph("Chrome on Windows")).toBe("monitor");
    expect(deviceGlyph("Safari on iPhone")).toBe("monitor");
    expect(deviceGlyph("A device")).toBe("monitor");
  });
});
