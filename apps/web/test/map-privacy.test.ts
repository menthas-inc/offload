import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// 030 T5.3, AC-32. Switching the map on changes what the privacy page says in
// public: Google Maps Platform receives place names and acts for itself, so
// the policy names it as the exception, and the consent version moves with the
// page. Since 2026-10-05 the policy says it generally and the companies page
// names what Google receives, with the web map said only when it is on.
describe("the privacy page says what the map adds (T5.3)", () => {
  const page = readFileSync(`${process.cwd()}/src/app/(marketing)/privacy/page.tsx`, "utf8").replace(/\s+/g, " ");
  const companies = readFileSync(`${process.cwd()}/src/app/(marketing)/privacy/companies/page.tsx`, "utf8").replace(/\s+/g, " ");
  const session = readFileSync(`${process.cwd()}/../core-api/src/routes/session.ts`, "utf8");

  it("names Google Maps Platform as the exception to the no-training line", () => {
    expect(page).toContain("except Google Maps Platform");
    expect(page).toContain("a place&rsquo;s name, on its own, is sent to Google Maps Platform to put it on a map");
  });

  it("gives Google Maps Platform its own row, acting for itself", () => {
    expect(companies).toContain(`name: "Google Maps Platform"`);
    expect(companies).toContain("Acts for itself under its own terms");
  });

  it("never asks consent to a version later than the page", () => {
    // A material change moves both. One that names something the policy
    // already covers moves the page's date alone, as 041 did on 7 October
    // with PDFs, and nobody is asked again.
    const updated = /const UPDATED = "(\d+) (\w+) (\d{4})"/.exec(page);
    const version = /export const CONSENT_VERSION = "(\d{4}-\d{2}-\d{2})";/.exec(session);
    expect(updated && version).toBeTruthy();
    const pageDay = new Date(`${updated![2]} ${updated![1]}, ${updated![3]} 12:00 UTC`).toISOString().slice(0, 10);
    expect(version![1] <= pageDay).toBe(true);
    expect(version![1]).toBe("2026-10-06");
  });
});

describe("the web's settings and calendar sheet say it too (T5.3)", () => {
  const privacy = readFileSync(`${process.cwd()}/src/components/panes/Privacy.tsx`, "utf8");
  const calendars = readFileSync(`${process.cwd()}/src/components/shell/CalendarsPopover.tsx`, "utf8");

  it("says a place a page names goes to Google", () => {
    expect(privacy).toContain('note="Opens a link you dumped and reads the page. Where it names a place, the name goes to Google to put it on the map."');
  });

  it("says a shared thread sees where a picked calendar's events are", () => {
    expect(calendars).toContain("sees the events on them, and where they are.");
  });
});
