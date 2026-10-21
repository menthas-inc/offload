// 046 Today glass, the web client. Shape tests over the source, the house
// pattern: the CSS and the pane wiring a logic test cannot reach.
//
//   pnpm --filter @offload/web test today-glass

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const css = (path: string): string => readFileSync(new URL(`../src/app/(shell)/${path}`, import.meta.url), "utf8");

describe("046 de-band (AC-1)", () => {
  it("drops the alternating band: no [data-band] rule, cards pinned to raised", () => {
    const t = css("today.module.css");
    expect(t).not.toMatch(/\.band\[data-band\]/);
    expect(t).toMatch(/--tp-card:\s*var\(--surface-raised\)/);
    expect(t).not.toMatch(/--tp-card:\s*var\(--surface-fill\)/);
  });
  it("the Today pane no longer sets data-band", () => {
    expect(read("components/panes/Today.tsx")).not.toMatch(/data-band=/);
  });
});

describe("046 field (AC-2, AC-4)", () => {
  it("reads the shared bloom layout, not hand-typed placements", () => {
    expect(read("components/panes/Today.tsx")).toMatch(/TODAY_FIELD/);
  });
  it("the field tints at the field-alpha token and stays still (owner, 2026-10-21)", () => {
    const t = css("today.module.css");
    expect(t).toMatch(/--today-field-alpha/);
    expect(t).not.toMatch(/today-field-drift/);
    const inner = t.slice(t.indexOf(".fieldInner {"), t.indexOf("}", t.indexOf(".fieldInner {")));
    expect(inner).not.toMatch(/animation/);
  });
});

describe("046 small grey text never sits on the field (AC-3)", () => {
  // Found by the live check: the two-week calendar's empty days and the
  // section counts drew --text-tertiary straight onto the densest bloom.
  const rule = (t: string, sel: string): string => t.slice(t.indexOf(`${sel} {`), t.indexOf("}", t.indexOf(`${sel} {`)));
  it("the calendar block is one raised card", () => {
    expect(rule(css("today.module.css"), ".month")).toMatch(/background:\s*var\(--surface-raised\)/);
  });
  it("a section count is a small raised pill", () => {
    const head = rule(css("today.module.css"), ".headCount");
    expect(head).toMatch(/background:\s*var\(--surface-raised\)/);
    expect(head).toMatch(/border-radius:\s*var\(--radius-pill\)/);
  });
});

describe("046 composer glass (AC-5, AC-6)", () => {
  it("one backdrop-filter layer with a graded tint and an opaque fallback", () => {
    const c = css("composer.module.css");
    expect(c).toMatch(/backdrop-filter:\s*blur\(var\(--glass-blur-radius/);
    expect(c).toMatch(/-webkit-backdrop-filter/);
    expect(c).toMatch(/@supports not \(\(backdrop-filter/);
    expect(c).toMatch(/prefers-reduced-transparency:\s*reduce/);
  });
});

describe("046 composer foot token (AC-9)", () => {
  it("replaces the hardcoded list-foot literals with one token", () => {
    const shell = css("shell.module.css");
    const mem = css("memories.module.css");
    expect(shell).toMatch(/--composer-foot/);
    expect(shell).toMatch(/var\(--composer-foot\)/);
    // The remaining 120px in shell is the pane slide animation, not a foot.
    expect(mem).toMatch(/var\(--composer-foot\)/);
    expect(mem).not.toMatch(/120px/);
  });
});
