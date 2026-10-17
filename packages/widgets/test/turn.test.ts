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
    expect(await undoShown("t1", turns, (next) => (drawn = next), async () => true)).toBe(true);
    expect(drawn.map((turn) => turn.id)).toEqual(["m0"]);
  });

  it("puts the turn back when the server refuses", async () => {
    let drawn = turns;
    expect(await undoShown("t1", turns, (next) => (drawn = next), async () => false)).toBe(false);
    expect(drawn).toEqual(turns);
  });

  it("puts the turn back when the request never left", async () => {
    let drawn = turns;
    expect(await undoShown("t1", turns, (next) => (drawn = next), () => Promise.reject(new TypeError("offline")))).toBe(false);
    expect(drawn).toEqual(turns);
  });
});
