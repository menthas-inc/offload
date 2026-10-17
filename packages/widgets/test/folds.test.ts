// 2026-10-17 (the owner). A thread's To do, Files and Notes fold, and photos
// take too much of the page to open by default: Files starts folded. What
// each section was left as is kept on the device, for the account, across
// threads.

import { describe, expect, it } from "vitest";
import { FOLDED_AT_FIRST, foldsFrom, foldsWith } from "../src/index.js";

describe("the section folds", () => {
  it("start with Files folded and the rest open", () => {
    expect(FOLDED_AT_FIRST).toEqual({ todo: false, files: true, notes: false });
    expect(foldsFrom(null)).toEqual(FOLDED_AT_FIRST);
  });

  it("read what was kept over the defaults, and nothing that is not a fold", () => {
    expect(foldsFrom(JSON.stringify({ files: false, notes: true }))).toEqual({ todo: false, files: false, notes: true });
    expect(foldsFrom(JSON.stringify({ files: "yes", links: true }))).toEqual(FOLDED_AT_FIRST);
    expect(foldsFrom("not json")).toEqual(FOLDED_AT_FIRST);
  });

  it("write one section's state back with the others as they were", () => {
    const kept = foldsWith(FOLDED_AT_FIRST, "todo", true);
    expect(foldsFrom(kept)).toEqual({ todo: true, files: true, notes: false });
  });
});
