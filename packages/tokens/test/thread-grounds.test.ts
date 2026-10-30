// 2026-10-29. A thread's ground, ten per theme, with white on every one: the
// tile on My threads and every ThreadIcon. Read from what the generator wrote,
// so a ground the clients cannot see fails here rather than drawing grey.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const tokens = JSON.parse(readFileSync(join(import.meta.dirname, "../dist/tokens.json"), "utf8")) as {
  resolved: Record<"light" | "dark", Record<string, string>>;
};

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe("thread grounds (AC-5)", () => {
  it.each(["light", "dark"] as const)("are ten in %s, each different, with white at 4.5:1 or more", (theme) => {
    const scope = tokens.resolved[theme];
    const grounds = Array.from({ length: 10 }, (_, n) => scope[`thread-ground-${n + 1}`]);
    expect(grounds.every((g) => /^#[0-9A-F]{6}$/i.test(g ?? ""))).toBe(true);
    expect(new Set(grounds).size).toBe(10);
    for (const ground of grounds) expect(contrast(ground!, scope["text-on-solid"]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("differ between the themes", () => {
    expect(tokens.resolved.dark["thread-ground-1"]).not.toBe(tokens.resolved.light["thread-ground-1"]);
  });
});
