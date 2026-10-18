// 028 Not in a thread: the words both clients draw, from one place.
//
// The web and the phones each had their own copy of these, one with the
// suggestion's name taking its arguments the other way round. A reword now
// reaches both, and there is one order to call it in.

import { describe, expect, it } from "vitest";
import { countWord } from "../src/labels.js";
import { chipOf, sharedHint, suggestionName, type Face, type Suggestion } from "../src/loose.js";

const face = (displayName: string): Face => ({ accountId: displayName.toLowerCase(), initials: displayName[0]!, displayName });
const move = (names: string[], more = 0): Extract<Suggestion, { kind: "move" }> => ({
  id: "s1",
  kind: "move",
  thread: { id: "t1", name: "Flat admin", icon: "house", hue: 0 },
  faces: names.map(face),
  more,
});

describe("chipOf", () => {
  it("puts a note under Notes and a row under its type's chip", () => {
    expect(chipOf({ kind: "note" })).toBe("note");
    expect(chipOf({ kind: "content", row: { type: "task" } })).toBe("todo");
    expect(chipOf({ kind: "content", row: { type: "image" } })).toBe("photo");
    expect(chipOf({ kind: "content", row: { type: "screenshot" } })).toBe("photo");
    expect(chipOf({ kind: "content", row: { type: "location" } })).toBe("place");
    expect(chipOf({ kind: "content", row: { type: "voice" } })).toBe("voice");
    expect(chipOf({ kind: "content", row: { type: "file" } })).toBe("file");
  });

  it("puts a type it does not know under none", () => {
    expect(chipOf({ kind: "content", row: { type: "whatever" } })).toBeNull();
  });
});

describe("countWord", () => {
  it("says two to nine in words and ten or more as a number, as labels do", () => {
    expect([2, 3, 9].map(countWord)).toEqual(["two", "three", "nine"]);
    expect(countWord(10)).toBe("10");
  });
});

describe("suggestionName", () => {
  it("takes the title first and says the action", () => {
    expect(suggestionName("Boiler service receipt", move([]))).toBe("Move Boiler service receipt to Flat admin");
    expect(
      suggestionName("Oak brackets", { id: "s2", kind: "create", proposal: { id: "p1", name: "Kitchen shelves", count: 3 } }),
    ).toBe("Create Kitchen shelves and move 3 into it");
  });
});

describe("sharedHint", () => {
  it("names at most two people, then how many more", () => {
    expect(sharedHint(move([]))).toBeUndefined();
    expect(sharedHint(move(["Sam"]))).toBe("Shared with Sam");
    expect(sharedHint(move(["Sam", "Ana"]))).toBe("Shared with Sam and Ana");
    expect(sharedHint(move(["Sam", "Ana", "Tom"], 2))).toBe("Shared with Sam, Ana and 2 more");
  });
});
