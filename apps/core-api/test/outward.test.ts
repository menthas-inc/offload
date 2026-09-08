// 012 D: does anybody but you find out.
//
// AC-5:  a write nobody learns about is reversible; one they do is confirmed.
// AC-5b: attendees are read across both sides of the edit.

import { describe, expect, it } from "vitest";
import { outwardLine, outwardTest } from "../src/connectors/outward.js";

const shared = (over = {}) =>
  outwardTest({ attendeesBefore: [], attendeesAfter: [], calendarIsShared: true, ...over });
const mine = (over = {}) =>
  outwardTest({ attendeesBefore: [], attendeesAfter: [], calendarIsShared: false, ...over });

describe("AC-5 nobody else finds out", () => {
  it("your own calendar with no guests is reversible", () => {
    // The ordinary case, and requiring a dialog for it would be a dialog about
    // nothing: offload can delete the event again and nobody ever saw it.
    const verdict = mine();
    expect(verdict.outward).toBe(false);
    expect(verdict.notify).toBe(false);
    expect(outwardLine(verdict)).toBeNull();
  });
});

describe("AC-5 somebody does", () => {
  it("guests make it outward, and Google is told to mail them", () => {
    const verdict = mine({ attendeesAfter: ["ana@example.com"] });
    expect(verdict.outward).toBe(true);
    expect(verdict.notify).toBe(true);
    expect(outwardLine(verdict)).toBe("ana@example.com will be told.");
  });

  it("a shared calendar is outward with nobody to mail", () => {
    // Nobody gets an email and your wife still sees it on her phone. Outward
    // by a different route, so no notification is sent and it still confirms.
    const verdict = shared();
    expect(verdict.outward).toBe(true);
    expect(verdict.notify).toBe(false);
    expect(outwardLine(verdict)).toBe("Everyone on this calendar will see it.");
  });

  it("counts rather than lists when there are several", () => {
    const verdict = mine({ attendeesAfter: ["a@x.com", "b@x.com", "c@x.com"] });
    expect(outwardLine(verdict)).toBe("3 guests will be told.");
  });
});

describe("AC-5b the union across an edit", () => {
  it("removing every guest is still outward", () => {
    // The case a naive test gets wrong. Google mails a cancellation to every
    // one of them, and reading only the proposed state sees an empty list.
    const verdict = mine({ attendeesBefore: ["ana@example.com"], attendeesAfter: [] });
    expect(verdict.outward).toBe(true);
    expect(verdict.notify).toBe(true);
    expect(verdict.audience).toEqual(["ana@example.com"]);
  });

  it("does not tell the same person twice", () => {
    const verdict = mine({ attendeesBefore: ["ana@example.com"], attendeesAfter: ["ana@example.com"] });
    expect(verdict.audience).toEqual(["ana@example.com"]);
  });

  it("names everyone across both sides", () => {
    const verdict = mine({ attendeesBefore: ["old@x.com"], attendeesAfter: ["new@x.com"] });
    expect(verdict.audience.sort()).toEqual(["new@x.com", "old@x.com"]);
  });
});

describe("AC-17 the ordinary Undo leaves a calendar row alone", () => {
  it("excludes source=calendar from the turn's bulk soft delete", async () => {
    // undoTurn filters on nothing but the message a row came from, so a
    // calendar event written by a tool inside a dump turn is indistinguishable
    // to it. Without the exclusion, the ordinary toast would delete our row and
    // leave the event in Google forever.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../src/routes/dumps.ts", import.meta.url),
      "utf8"
    );
    const undo = source.slice(source.indexOf("async function undoTurn"));
    const contentUpdate = undo.slice(undo.indexOf('.updateTable("content")'));
    expect(contentUpdate.slice(0, 600)).toContain('"source", "<>", "calendar"');
  });
});

describe("AC-9 the model cannot choose whether its write is confirmed", () => {
  it("has no confirmation field in any calendar tool", async () => {
    // The defence rests on this. Some of what the model read came out of a
    // calendar somebody else can write into, so a field it could set to skip a
    // confirmation would be that defence handed to whoever wrote the event.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../src/routes/tools.ts", import.meta.url), "utf8");
    const bodies = source.slice(source.indexOf('z.literal("list_calendars")'), source.indexOf('z.literal("rename_thread")'));

    for (const banned of ["confirm", "outward", "notify", "skipConfirm", "force"]) {
      expect(bodies.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });

  it("refuses a calendar that is not this account's", async () => {
    // Not "unknown to us": unknown to this account. The tool takes a calendar
    // id and the server resolves ownership through the connection.
    const source = (await import("node:fs")).readFileSync(
      new URL("../src/connectors/tool-calls.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("unknown_calendar");
    expect(source).toContain("read_only");
  });
});
