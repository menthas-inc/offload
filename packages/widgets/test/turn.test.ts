// A settled turn, both clients.

import { describe, expect, it } from "vitest";
import { undoShown } from "../src/index.js";

describe("Undo of a turn", () => {
  const turns = [
    { id: "m0", turnId: "t0" },
    { id: "m1", turnId: "t1" },
    { id: "m1-reply", turnId: "t1" },
  ];

  it("takes the turn off the screen and keeps it off once the server agrees", async () => {
    let drawn = turns;
    expect(await undoShown("t1", turns, (update) => (drawn = update(drawn)), async () => true)).toBe(true);
    expect(drawn.map((turn) => turn.id)).toEqual(["m0"]);
  });

  it("puts the turn back when the server refuses", async () => {
    let drawn = turns;
    expect(await undoShown("t1", turns, (update) => (drawn = update(drawn)), async () => false)).toBe(false);
    expect(drawn).toEqual(turns);
  });

  it("puts the turn back when the request never left", async () => {
    let drawn = turns;
    expect(await undoShown("t1", turns, (update) => (drawn = update(drawn)), () => Promise.reject(new TypeError("offline")))).toBe(false);
    expect(drawn).toEqual(turns);
  });

  it("keeps a turn that arrived while the refused undo was travelling", async () => {
    let drawn = turns;
    const newer = { id: "m2", turnId: "t2" };
    const refused = async () => {
      drawn = [...drawn, newer];
      return false;
    };
    expect(await undoShown("t1", turns, (update) => (drawn = update(drawn)), refused)).toBe(false);
    expect(drawn.map((turn) => turn.id)).toEqual(["m0", "m1", "m1-reply", "m2"]);
  });

  it("keeps an update to another turn made while the undo was travelling", async () => {
    let drawn = turns;
    const refused = async () => {
      drawn = drawn.map((turn) => (turn.id === "m0" ? { ...turn, did: true } : turn));
      return false;
    };
    expect(await undoShown("t1", turns, (update) => (drawn = update(drawn)), refused)).toBe(false);
    expect(drawn).toEqual([{ id: "m0", turnId: "t0", did: true }, ...turns.slice(1)]);
  });
});
