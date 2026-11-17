// The control that answers a proposed calendar write, in the composer.
//
// The proposal is stored against the person's message, and the reply is what
// says offload is waiting. The reply looked for the control on itself, so with
// a reply there was a sentence about a go-ahead and nothing to give it with,
// live and after a reload. Read from source, as the composer's other rules are.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { answeredWaiting } from "@offload/widgets";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/components/shell/Composer.tsx"),
  "utf8",
);

describe("a proposed calendar write, under the reply", () => {
  it("is read from the turn the reply answers, not only from the reply", () => {
    expect(source).toContain("answered.get(turn.id)?.waiting ?? turn.waiting");
  });

  it("names what the tap does: add, change or remove", () => {
    expect(source).toMatch(/waiting\.action === "delete"\s*\?\s*"Remove it"/);
    expect(source).toMatch(/waiting\.action === "edit"\s*\?\s*"Change it"/);
    expect(source).toContain('"Add it"');
  });
});

describe("a proposed calendar write, once it is answered", () => {
  const waiting = { id: "p1", because: "You asked to check first.", kind: "calendar" as const, action: "delete" as const };
  const turns = [
    { id: "m0", from: "you" as const, turnId: "t0", did: false },
    { id: "m1", from: "you" as const, turnId: "t1", state: "answered" as const, waiting, did: false },
    { id: "m1-reply", from: "offload" as const, turnId: "t1" },
  ];

  it("agreed to: the control goes and the message that was sent wears Done", () => {
    // The press made the control vanish and drew nothing else. The write
    // happened; the turn has to say so now, as it does after a reload.
    const next = answeredWaiting(turns, turns[2]!, true);
    expect(next[1]).toMatchObject({ waiting: null, did: true });
    expect(next[0]).toEqual(turns[0]);
    expect(next[2]?.did).toBeUndefined();
  });

  it("turned down: the control goes and nothing says Done", () => {
    const next = answeredWaiting(turns, turns[1]!, false);
    expect(next[1]).toMatchObject({ waiting: null, did: false });
  });

  it("is what the composer does on an answer, with a share never counting as done", () => {
    expect(source).toContain('onAnswered(choice === "confirm" && !share)');
    expect(source.match(/answeredWaiting\(current, turn, agreed\)/g)?.length).toBe(2);
  });
});

describe("a tapped calendar, for a row where no thread is named", () => {
  // 052 retired the Done mark (AC-1): what a turn did is its reply's undo
  // line, from the record, so the composer no longer works out a Done at all.
  it("draws no Done from pills or from anything else", () => {
    expect(source).not.toContain("did: (sent.threads?.length ?? 0) > 0");
    expect(source).not.toMatch(/did: turnDid/);
    expect(source).not.toContain('"done" as const');
  });
});

describe("a turn that changed a calendar and filed nothing", () => {
  // A removal of an event names no thread, so `changed` is empty, and Today
  // went on drawing the event until the page was loaded again.
  it("tells the open screens to read again when it settles", () => {
    expect(source).toContain("if (turnUndoable(answer)) onFiled(answer.changed ?? []);");
  });

  it("and when a proposal is agreed to, wherever its control sits", () => {
    expect(source.match(/if \(agreed\) onFiled\(\[\]\);/g)).toHaveLength(2);
  });
});
