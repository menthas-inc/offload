// Disconnect on the Connected apps card (031, tweaked 2026-10-04).
//
// It sat one level down, behind "Calendars offload can use", which names what
// that page is for and is not where anybody looks to disconnect. The card
// carries it now, one row per account, and the calendar page keeps the list.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");

describe("Disconnect is on the calendar card", () => {
  const card = read("components/settings/AppCards.tsx");
  const page = read("app/settings/[page].tsx");
  const between = (source: string, from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to));

  it("the card draws one Disconnect per account, named by address when there are several", () => {
    expect(card).toContain("onDisconnect: (connectionId: string) => void");
    expect(card).toContain('"Disconnect Google Calendar"');
    expect(card).toContain("`Disconnect ${connection.email}`");
    expect(card).toContain("Notes offload made from your days stay.");
  });

  it("the apps page asks once in the row sheet, then disconnects", () => {
    const apps = between(page, "function Apps(", "function MailPage(");
    expect(apps).toContain("onDisconnect={setDisconnecting}");
    expect(apps).toContain('subject="Disconnect Google Calendar?"');
    expect(apps).toContain("await disconnect(id)");
  });

  it("the calendar page keeps the list and no longer carries Disconnect", () => {
    const calendar = between(page, "function CalendarPage(", "function connectedOn(");
    expect(calendar).toContain("Calendars offload can use");
    expect(calendar).not.toContain("Disconnect");
  });
});
