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

  // 2026-10-30: the policy names Google Maps Platform among those that act for
  // themselves, and says a place's name goes to a maps service on its own.
  it("names Google Maps Platform as acting for itself, and sends a place's name on its own", () => {
    expect(page).toContain("Some act for themselves under their own terms");
    expect(page).toContain("Google Maps Platform");
    expect(page).toContain("the place&rsquo;s name, on its own, goes to a maps service to put it on a map");
  });

  it("gives Google Maps Platform its own row, acting for itself", () => {
    expect(companies).toContain(`name: "Google Maps Platform"`);
    expect(companies).toContain("Acts for itself under its own terms");
  });

  // Not pinned to a day: every later change to the page moves both, and
  // apps/core-api/test/consent.test.ts holds the rule (the later of the
  // privacy and terms dates). Here, only that the map change moved them past it.
  it("moves its date with the consent version", () => {
    const updated = /const UPDATED = "(\d{1,2}) October 2026"/.exec(page);
    const consent = /export const CONSENT_VERSION = "2026-10-(\d{2})";/.exec(session);
    expect(updated, "UPDATED in October 2026").not.toBeNull();
    expect(consent, "CONSENT_VERSION in October 2026").not.toBeNull();
    expect(Number(consent![1])).toBeGreaterThanOrEqual(Number(updated![1]));
    expect(Number(updated![1])).toBeGreaterThanOrEqual(3);
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
