// Text on a fill that does not flip with the theme.
//
// The moss, blue and clay ramps are the same in both themes, while --paper
// and --text-inverse flip to near black in dark mode. A rule that puts either
// on one of those fills reads as dark on green in dark mode, which is how the
// conversation's Done chip went out. --text-on-solid is white in both.
//
// And the row tools: they sit on the title line as the tile does, never
// against the top edge of the row.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "../src");

function stylesheets(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return name.endsWith(".css") ? [path] : [];
  });
}

/** Every plain rule as [selector, body], comments removed. */
function rules(css: string): [string, string][] {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1]!.trim(), m[2]!]);
}

const FIXED_FILL = /background(?:-color)?:\s*var\(--(?:moss|blue|clay)-[5-9]00\)/;
const FLIPPING_TEXT = /(?:^|;|\s)color:\s*var\(--(?:paper|text-inverse)\)/;

describe("text on a fixed fill", () => {
  it("is never a colour that flips in dark mode", () => {
    const wrong = stylesheets(SRC).flatMap((file) =>
      rules(readFileSync(file, "utf8"))
        .filter(([, body]) => FIXED_FILL.test(body) && FLIPPING_TEXT.test(body))
        .map(([selector]) => `${file.slice(SRC.length + 1)} ${selector}`),
    );
    expect(wrong).toEqual([]);
  });
});

describe("row tools", () => {
  it("sit on the title line as the tile does", () => {
    const shell = rules(readFileSync(join(SRC, "app/(shell)/shell.module.css"), "utf8"));
    const body = (selector: string) => shell.find(([s]) => s === selector)?.[1] ?? "";
    const top = (b: string) => b.match(/margin-top:\s*([^;]+);/)?.[1];
    const tools = body(".rowTools");
    expect(top(tools)).toBe(top(body(".rowIcon")));
    // A later margin-block would put the top edge back.
    expect(tools).not.toMatch(/margin-block\s*:/);
  });
});
