// 2026-10-17 (the owner). To do, Files and Notes fold from their heading, and
// Files starts folded so photos do not take the page. Kept on the phone for
// the account, and forgotten at sign-out with the account's other keys.

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
}));

const { readFolds, writeFold, forgetFolds, FOLDS_KEY } = await import("../lib/folds");

beforeEach(() => {
  store.clear();
  forgetFolds();
});
const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("the section folds on the phones", () => {
  it("start with Files folded, and keep a change for the next thread", () => {
    expect(readFolds()).toEqual({ todo: false, files: true, notes: false });
    writeFold("files", false);
    writeFold("notes", true);
    expect(readFolds()).toEqual({ todo: false, files: false, notes: true });
  });

  it("read the keychain once, not on every render", () => {
    expect(read("lib/folds.ts")).toMatch(/if \(cachedRaw === undefined\)/);
  });

  it("are one of the account's keys, forgotten at sign-out", () => {
    expect(FOLDS_KEY).toBe("offload_section_folds");
    expect(read("lib/device-data.ts")).toMatch(/"offload_section_folds"/);
  });

  it("fold To do, Files and Notes from their heading, and hide everything under it", () => {
    const widgets = read("components/shell/Widgets.tsx");
    expect(widgets).toMatch(/const \[folds, setFold\] = useFolds\(\)/);
    expect(widgets).toMatch(/accessibilityState=\{\{ expanded: !folded \}\}/);
    expect(widgets).toMatch(/\{folded \? null : \(/);
    // The heading keeps its height: the target grows by slop, not by the box.
    expect(widgets).not.toMatch(/className="min-h-tap-min flex-row items-center gap-space-3"/);
    const notes = read("components/shell/Notes.tsx");
    expect(notes).toMatch(/accessibilityState=\{\{ expanded: !sectionFolded \}\}/);
    expect(notes).toMatch(/\{sectionFolded \? null : \(/);
  });
});
