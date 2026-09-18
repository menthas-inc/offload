// 012 D: does anybody but you find out.
//
// AC-5:  a write nobody learns about is reversible; one they do is confirmed.
// AC-5b: attendees are read across both sides of the edit.
// 019 AC-5: the calendar's participant count and the ask-first switch decide
// the second and third conditions.

import { describe, expect, it } from "vitest";
import { outwardLine, outwardTest } from "../src/connectors/outward.js";

const shared = (over = {}) =>
  outwardTest({ attendeesBefore: [], attendeesAfter: [], participants: 2, askFirst: false, ...over });
const mine = (over = {}) =>
  outwardTest({ attendeesBefore: [], attendeesAfter: [], participants: 1, askFirst: false, ...over });

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

  it("a calendar with more than one participant is outward with nobody to mail", () => {
    // Nobody gets an email and your wife still sees it on her phone. Outward
    // by a different route, so no notification is sent and it still confirms.
    const verdict = shared();
    expect(verdict.outward).toBe(true);
    expect(verdict.notify).toBe(false);
    expect(outwardLine(verdict)).toBe("Everyone on this calendar will see it.");
  });

  it("an unknown count is outward: guessing 'only them' is the one guess that skips a confirmation", () => {
    // 019. Null is a calendar the person does not own, or a grant without the
    // access-list scope. Both read as more than one.
    const verdict = mine({ participants: null });
    expect(verdict.outward).toBe(true);
    expect(verdict.reason).toBe("shared_calendar");
  });

  it("the ask-first switch confirms a write nobody else would see, with its own line", () => {
    // 019. The person asked to check every write. Nobody finds out, so the
    // line says why rather than who.
    const verdict = mine({ askFirst: true });
    expect(verdict.outward).toBe(true);
    expect(verdict.notify).toBe(false);
    expect(verdict.reason).toBe("asked_for");
    expect(outwardLine(verdict)).toBe("You asked to check first.");
  });

  it("guests come before the switch, so the line still names who is told", () => {
    const verdict = mine({ askFirst: true, attendeesAfter: ["ana@example.com"] });
    expect(verdict.reason).toBe("guests");
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

describe("AC-17 the ordinary Undo leaves a row on a calendar alone", () => {
  it("excludes a row still carrying its event from the turn's bulk soft delete", async () => {
    // undoTurn filters on nothing but the message a row came from, so a row a
    // tool put on a calendar inside a dump turn is indistinguishable to it.
    // Google is called first and clears `source_ref` on success; a row whose
    // event Google refused to delete keeps its reference and its row, so the
    // ordinary toast never deletes our row and leaves the event in Google.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../src/routes/dumps.ts", import.meta.url),
      "utf8"
    );
    const undo = source.slice(source.indexOf("async function undoTurn"));
    const contentUpdate = undo.slice(undo.indexOf('.updateTable("content")'));
    expect(contentUpdate.slice(0, 600)).toContain('"source_ref", "is", null');
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
    // Not "unknown to us": unknown to this account. The server resolves the
    // calendar through the connection, and since 019 an event on another
    // member's calendar is unknown to a write as well.
    const source = (await import("node:fs")).readFileSync(
      new URL("../src/connectors/tool-calls.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("unknown_calendar");
    expect(source).toContain("read_only");
    expect(source).toContain('.where("n.account_id", "=", accountId)');
  });

  it("takes no calendar id from the model on any calendar tool", async () => {
    // 019. The scope decides what is read and the row's thread decides where a
    // write goes; a calendar id from the model would let it pick another
    // member's calendar as a target.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../src/routes/tools.ts", import.meta.url), "utf8");
    const bodies = source.slice(source.indexOf('z.literal("list_calendars")'), source.indexOf('z.literal("rename_thread")'));
    expect(bodies).not.toContain("calendarId");
  });
});
