// The control that answers a proposed calendar write, on the phones.
//
// After a reload the proposal rides the person's message, which hides it when
// a reply exists, and the reply carried none: a sentence about a go-ahead and
// nothing to give it with.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { answeredWaiting } from "../lib/turn-did";

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

describe("a proposed calendar write, once it is answered", () => {
  const waiting = { id: "p1", because: "You asked to check first.", kind: "calendar", action: "delete" };
  const turns = [
    { id: "m0", from: "you" as const, turnId: "t0", did: false },
    { id: "m1", from: "you" as const, turnId: "t1", state: "answered", waiting: null, did: false },
    { id: "m1-reply", from: "offload" as const, turnId: "t1", waiting },
  ];

  it("agreed to: the control goes and the message that was sent wears Done", () => {
    // Live, the reply carries the proposal and the footer hangs off the
    // message that was sent, so the two are different turns of one turn id.
    const next = answeredWaiting(turns, turns[2]!, true);
    expect(next[2]).toMatchObject({ waiting: null });
    expect(next[1]).toMatchObject({ waiting: null, did: true });
    expect(next[0]).toEqual(turns[0]);
  });

  it("turned down: the control goes and nothing says Done", () => {
    const next = answeredWaiting(turns, turns[2]!, false);
    expect(next[2]).toMatchObject({ waiting: null });
    expect(next[1]?.did).toBe(false);
  });

  it("is what the conversation does on an answer, with a share never counting as done", () => {
    const context = readFileSync(new URL("../components/shell/conversation-context.tsx", import.meta.url), "utf8");
    expect(source).toContain('resolveWaiting(turn, choice === "confirm" && !share)');
    expect(context).toContain("setTurns((current) => answeredWaiting(current, turn, agreed))");
  });
});
