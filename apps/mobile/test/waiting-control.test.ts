// The control that answers a proposed calendar write, on the phones.
//
// After a reload the proposal rides the person's message, which hides it when
// a reply exists, and the reply carried none: a sentence about a go-ahead and
// nothing to give it with.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../components/shell/Conversation.tsx", import.meta.url), "utf8");

describe("a proposed calendar write, under the reply", () => {
  it("is read from the reply, or from the turn it answers", () => {
    expect(source).toContain("const waitingTurn = turn.waiting ? turn : sent?.waiting ? sent : null;");
    expect(source).toContain("{waitingTurn ? <Waiting turn={waitingTurn} /> : null}");
  });

  it("names what the tap does: add, change or remove", () => {
    expect(source).toMatch(/action === "delete"\s*\?\s*"Remove it"/);
    expect(source).toMatch(/action === "edit"\s*\?\s*"Change it"/);
  });
});
