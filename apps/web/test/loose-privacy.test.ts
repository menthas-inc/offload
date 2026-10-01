import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// 028 AC-36. The privacy page is a claim surface: the suggestions, the daily
// pass, the dismissal record and the suggested move into a shared thread are
// stated in the owner's approved words, and the consent version moves with it.
describe("the privacy page says what 028 adds (T0.3)", () => {
  const page = readFileSync(`${process.cwd()}/src/app/(marketing)/privacy/page.tsx`, "utf8").replace(/\s+/g, " ");
  const session = readFileSync(`${process.cwd()}/../core-api/src/routes/session.ts`, "utf8");

  it("states the suggestions and the daily pass", () => {
    expect(page).toContain(
      "<strong>Suggestions.</strong> When offload puts something down without a thread, it may suggest a thread it could go in, and once a day it looks over those things and may propose a new thread for two or more that belong together. Nothing moves until you tap the suggestion."
    );
  });

  it("states the dismissal record and that a proposal no longer made is removed", () => {
    expect(page).toContain(
      "<strong>A dismissed suggestion.</strong> When you dismiss one, offload keeps a record that you did, with no words in it, so it never suggests anything for that thing again. It goes when the thing does. A proposal it no longer makes is removed."
    );
  });

  it("says nothing arrives in a shared thread without you, and no longer says by accident", () => {
    expect(page).toContain(
      "Nothing arrives in a shared thread without you. offload may suggest a shared thread for something you put down, and the suggestion shows who is in it; it moves only when you tap it, and you can undo it for a few seconds after."
    );
    expect(page).not.toContain("Nothing arrives in a shared thread by accident.");
  });

  it("moves its date with the consent version", () => {
    expect(page).toContain('const UPDATED = "2 October 2026"');
    expect(session).toContain('export const CONSENT_VERSION = "2026-10-02";');
  });
});
