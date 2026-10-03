import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// 036. Deleting a photo deletes its file, and what somebody leaves in a shared
// thread is the thread's, so a remaining member's delete takes it from the
// leaver's own conversation too. The owner chose to say so, 2026-10-04.
describe("the privacy page says what a left-behind photo becomes (036)", () => {
  const page = readFileSync(`${process.cwd()}/src/app/(marketing)/privacy/page.tsx`, "utf8").replace(/\s+/g, " ");

  it("says it in the shared-thread photo bullet", () => {
    expect(page).toContain(
      "The file&rsquo;s own name stays with you. If you leave, it stays with the others, and if one of them deletes it, it is deleted for you too.",
    );
  });
});
