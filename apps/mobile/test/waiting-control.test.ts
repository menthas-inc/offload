// The control that answers a proposed calendar write, on the phones.
//
// After a reload the proposal rides the person's message, which hides it when
// a reply exists, and the reply carried none: a sentence about a go-ahead and
// nothing to give it with.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { answeredWaiting } from "@offload/widgets";

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

describe("a tapped calendar, for a row where no thread is named", () => {
  it("wears Done from what the server says the tap did, not from a pill", () => {
    // The default thread has no pill, so `threads` is empty on a tap that
    // wrote. Done was drawn from the pills alone and waited for a reload.
    const context = readFileSync(new URL("../components/shell/conversation-context.tsx", import.meta.url), "utf8");
    expect(context).not.toContain("did: (sent.threads?.length ?? 0) > 0");
    expect(context).toContain("did: turnDid(sent)");
  });
});

describe("a turn that changed a calendar and filed nothing", () => {
  // A removal of an event names no thread, so `changed` is empty, and Today
  // went on drawing the event until the screen was opened again.
  const context = readFileSync(new URL("../components/shell/conversation-context.tsx", import.meta.url), "utf8");

  it("tells the open screens to read again when it settles", () => {
    expect(context).toContain("if (acted) setFiled({ threadIds: answer.changed, at: Date.now() });");
  });

  it("and when a proposal is agreed to", () => {
    expect(context).toContain("if (agreed) setFiled({ threadIds: [], at: Date.now() });");
  });

  it("and Today is one of those screens, as a thread is", () => {
    const today = readFileSync(new URL("../components/today/TodayScreen.tsx", import.meta.url), "utf8");
    expect(today).toContain("const { setDraft, filed } = useConversation();");
    expect(today).toMatch(/if \(!filed \|\| filed\.at === lastFiled\.current\) return;\s*lastFiled\.current = filed\.at;\s*loadDay\(date\);/);
  });
});
