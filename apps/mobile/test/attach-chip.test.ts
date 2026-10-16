// The chip a photo or a PDF makes in the composer (2026-10-16, owner): ink
// blue with white words so it stands out against the field, and a photo shows
// a little of itself where the image glyph was. A refused file keeps the
// quiet chip and its danger border, so its line stays readable.
//
// A scan, not a render, like on-solid.test.ts: the mobile suite has no
// renderer.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const chip = readFileSync(join(ROOT, "components/shell/AttachChip.tsx"), "utf8");
const composer = readFileSync(join(ROOT, "components/shell/Composer.tsx"), "utf8");

describe("the attachment chip", () => {
  it("is ink blue with white words, which stay white in dark", () => {
    expect(chip).toContain("bg-surface-attention");
    expect(chip).toContain("text-text-on-solid");
    expect(chip).toContain("COLOR.onBrand");
    // text-inverse flips to near black in dark, on a fill that does not.
    expect(chip).not.toContain("text-inverse");
  });

  it("keeps the quiet chip for a refused file", () => {
    expect(chip).toMatch(/error\s*\?[^:]*bg-surface-raised[^:]*border-border-danger/s);
  });

  it("shows the photo itself, from the draft's file", () => {
    expect(chip).toMatch(/<Image[\s\S]*source=\{\{ uri \}\}/);
    expect(composer).toMatch(/<AttachChip[\s\S]*?uri=\{photo\.uri\}[\s\S]*?\/>/);
  });
});
