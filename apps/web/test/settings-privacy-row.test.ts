// 2026-10-04. The row that opens the Privacy page says Privacy.
//
// 016 named it "Reaching the web" when the page held two switches. 035 put
// Your copy there and 036 put Storage there, each without touching the row,
// so the way to an export and to what is kept was a row about the web, and
// the privacy policy sends people to "Settings under Privacy". The owner's
// call: the kit's own label and glyph, on all three.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const web = readFileSync(join(process.cwd(), "src/components/panes/Settings.tsx"), "utf8");
const phones = readFileSync(join(process.cwd(), "../mobile/app/settings/index.tsx"), "utf8");
const policy = readFileSync(join(process.cwd(), "src/app/(marketing)/privacy/page.tsx"), "utf8");

describe("the way to the Privacy page", () => {
  it("is a row called Privacy, with the lock, on the web", () => {
    expect(web).toContain('<Row icon="lock" title="Privacy" href="/settings/privacy" last />');
  });

  it("is the same row on the phones", () => {
    expect(phones).toMatch(/icon="lock"\s+title="Privacy"\s+onPress=\{\(\) => router\.push\("\/settings\/privacy"\)\}/);
  });

  it("is what the policy tells people to look for", () => {
    expect(policy).toContain("Settings under Privacy");
    for (const index of [web, phones]) expect(index).not.toContain('title="Reaching the web"');
  });
});
