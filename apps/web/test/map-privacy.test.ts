import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// 030 T5.3, AC-32. Switching the map on changes what the privacy page says in
// public: Google Maps Platform receives place names and acts for itself, so
// every sentence that said otherwise names it as the exception, and the
// consent version moves with the page.
describe("the privacy page says what the map adds (T5.3)", () => {
  const page = readFileSync(`${process.cwd()}/src/app/(marketing)/privacy/page.tsx`, "utf8").replace(/\s+/g, " ");
  const session = readFileSync(`${process.cwd()}/../core-api/src/routes/session.ts`, "utf8");

  it("names the one exception in the summary", () => {
    expect(page).toContain("One company in section 6, Google Maps Platform, which draws the map in a thread, may use what it receives to improve its own products");
    expect(page).toContain("none of them may use what you upload for their own purposes except Google Maps Platform, as section 6 says");
    expect(page).toContain("A thread&rsquo;s map is drawn by Google, and section 6 says what Google receives when it is on screen.");
  });

  it("says what is kept of a place, and that a calendar's events carry where they are", () => {
    expect(page).toContain("<strong>Places.</strong>");
    expect(page).toContain("the place&rsquo;s coordinates for up to thirty days");
    expect(page).toContain("as a title, a time and where it is");
    expect(page).not.toContain("as a title and a time,");
  });

  it("gives the lookup its basis, its filter and its exception to the no-training term", () => {
    expect(page).toContain("<td>To put places on a map</td>");
    expect(page).toContain("except Google Maps Platform, which does not");
    expect(page).toContain("<strong>A place goes to Google to be put on a map.</strong>");
    expect(page).toContain("a number in it, an email or web address, a possessive, or a street word");
    expect(page).toContain("a place you keep still goes to Google to be put on the map");
  });

  it("gives Google Maps Platform its own row, and the sentence under the table its exception", () => {
    expect(page).toContain("<td>Google Maps Platform</td>");
    expect(page).toContain("Draws the map in a thread and turns the name of a place into a point on it");
    expect(page).toContain("Google decides for itself how it uses this, under its own terms");
    expect(page).toContain("Each of them, except Google Maps Platform as its row says, is under a contract");
    expect(page).not.toContain("Each of them is under a contract that lets them");
  });

  it("covers the transfer, the retention and the map in the cookie section", () => {
    expect(page).toContain("Google Maps Platform is the exception: what reaches it is not under those terms");
    expect(page).toContain("<strong>Places: thirty days for where they are.</strong>");
    expect(page).toContain("A thread&rsquo;s map is drawn by Google&rsquo;s own code in your browser");
  });

  it("moves its date with the consent version", () => {
    expect(page).toContain('const UPDATED = "4 October 2026"');
    expect(session).toContain('export const CONSENT_VERSION = "2026-10-04";');
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
