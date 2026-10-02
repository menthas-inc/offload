// 030 T4.12, AC-30. What the phones' map may and may not carry: Google's map
// on both, never a map id (which would make every load billable), and a dark
// style Android can read.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const dir = `${process.cwd()}/components/map`;
const sources = readdirSync(dir)
  .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
  .map((f) => readFileSync(`${dir}/${f}`, "utf8"));

describe("the phones' map (AC-30)", () => {
  it("is Google's, with no map id anywhere", () => {
    expect(sources.join("\n")).toContain("provider={PROVIDER_GOOGLE}");
    // Comments may name it; no prop may pass it.
    expect(sources.join("\n")).not.toMatch(/googleMapId\s*=/);
  });

  it("has a dark style Android reads as a style array", () => {
    const style = JSON.parse(readFileSync(`${dir}/android-dark-style.json`, "utf8")) as unknown;
    expect(Array.isArray(style)).toBe(true);
    for (const rule of style as { stylers?: unknown }[]) {
      expect(Array.isArray(rule.stylers)).toBe(true);
    }
  });
});

describe("the place sheet's Open link (security review, 030)", () => {
  it("goes through the http guard every other link uses", () => {
    const sheet = readFileSync(`${dir}/PlaceSheet.tsx`, "utf8");
    expect(sheet).toContain("openLink(point.url)");
    expect(sheet).not.toMatch(/openURL\(point\.url/);
  });
});
