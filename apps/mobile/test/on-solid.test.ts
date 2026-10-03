// Text on a fill that does not flip with the theme.
//
// Android's filled button is blue-600, clay-600 is the danger fill, and the
// ramps are the same in both themes. text-inverse and COLOR.onSolid flip to
// near black in dark mode, so on one of those fills they read as dark on
// blue. text-on-solid and COLOR.onBrand are white in both.
//
// A scan, not a render: within a few lines of a fixed fill, a flipping colour
// is allowed only beside its constant counterpart, which is what the
// `isAndroid ? on-solid : inverse` ternary looks like on one line.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

const FIXED_FILL = /bg-(?:blue|moss|clay)-[5-9]00|bg-surface-danger/;
const NEAR = 14;

function wrongIn(file: string): string[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const found: string[] = [];
  lines.forEach((line, i) => {
    if (!FIXED_FILL.test(line)) return;
    for (let j = i; j < Math.min(lines.length, i + NEAR); j++) {
      const near = lines[j]!;
      const text = near.includes("text-text-inverse") && !near.includes("text-text-on-solid");
      // Apple's mark is only ever drawn on Apple's own button, which is ink.
      const glyph = near.includes("COLOR.onSolid") && !near.includes("COLOR.onBrand") && !near.includes("AppleGlyph");
      if (text || glyph) found.push(`${file.slice(ROOT.length + 1)}:${j + 1}`);
    }
  });
  return [...new Set(found)];
}

describe("text on a fixed fill", () => {
  it("is never a colour that flips in dark mode", () => {
    const files = [...sources(join(ROOT, "components")), ...sources(join(ROOT, "app"))];
    expect(files.flatMap(wrongIn)).toEqual([]);
  });
});
