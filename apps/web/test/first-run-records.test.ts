// 033: what first run's change makes untrue elsewhere, read from source. The
// privacy page is a claim surface (AC-17); Help names what it replays (AC-21);
// the pieces first run replaced are gone (AC-18).

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

describe("033 records", () => {
  it("says where consent is given without naming a screen (AC-17, owner 2026-10-03)", () => {
    const page = flat(read("src/app/(marketing)/privacy/page.tsx"));
    expect(page).toContain("First run asks you to agree");
    expect(page).not.toContain("given on the last screen of first run");
    expect(page).not.toContain("first run ends with two tick boxes");
  });

  it("says Help replays the intro (AC-21)", () => {
    expect(read("src/components/panes/Help.tsx")).toContain('note="The intro from your first day."');
  });

  it("drops what the three screens replaced (AC-18)", () => {
    expect(existsSync(new URL("../src/components/RunArt.tsx", import.meta.url))).toBe(false);
    expect(read("src/components/MailBlock.tsx")).not.toMatch(/MailOffer|mailOffered|MAIL_OFFER_TITLE/);
  });
});
