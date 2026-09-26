// 025. The label rules every surface shares, from `@offload/widgets`.
//
// AC-14 the `#` token at the end of a draft, and the #words a sent message
//       carries.
// AC-15 a #word is a label's name only at a word start and followed by a
//       letter, so `#3` and `a#b` are not labels.
// AC-17 the filter bar's pick: either logic, All clears, the last cleared is
//       All, No label combines.
// AC-19 a kept pick drops labels that no longer exist.

import { describe, expect, it } from "vitest";
import {
  ALL_LABELS,
  hashtagsIn,
  isAll,
  keepLive,
  labelQuery,
  pickAll,
  toggleLabel,
  toggleUnlabelled,
} from "@offload/widgets";

describe("the # token being typed (AC-14)", () => {
  it("is the one at the end of the draft, after a space or at the start", () => {
    expect(labelQuery("ferry on tuesday #ist")).toBe("ist");
    expect(labelQuery("#")).toBe("");
    expect(labelQuery("ferry #")).toBe("");
    expect(labelQuery("ferry #Istanbul ")).toBeNull();
    expect(labelQuery("ferry a#b")).toBeNull();
    expect(labelQuery("ferry")).toBeNull();
  });
});

describe("the #words in a sent message (AC-15)", () => {
  it("names each once, in order, keeping case, and skips #3 and a#b", () => {
    expect(hashtagsIn("ferry #Istanbul and #boats, not a#tag or #3 or #Istanbul")).toEqual(["Istanbul", "boats"]);
    expect(hashtagsIn("#Lisboa-norte trip")).toEqual(["Lisboa-norte"]);
    expect(hashtagsIn("no labels here")).toEqual([]);
  });
});

describe("the filter bar's pick (AC-17, AC-19)", () => {
  it("starts on All and returns to it when the last is cleared", () => {
    expect(isAll(ALL_LABELS)).toBe(true);
    const one = toggleLabel(ALL_LABELS, "a");
    expect(one).toEqual({ labels: ["a"], none: false });
    expect(isAll(toggleLabel(one, "a"))).toBe(true);
  });

  it("picks either of several, with No label beside them", () => {
    const both = toggleLabel(toggleLabel(ALL_LABELS, "a"), "b");
    expect(both).toEqual({ labels: ["a", "b"], none: false });
    expect(toggleUnlabelled(both)).toEqual({ labels: ["a", "b"], none: true });
    expect(isAll(pickAll())).toBe(true);
  });

  it("drops a label that no longer exists, and falls back to All", () => {
    const kept = { labels: ["a", "gone"], none: false };
    expect(keepLive(kept, ["a", "b"])).toEqual({ labels: ["a"], none: false });
    expect(isAll(keepLive({ labels: ["gone"], none: false }, ["a"]))).toBe(true);
    expect(keepLive({ labels: ["gone"], none: true }, ["a"])).toEqual({ labels: [], none: true });
  });
});
