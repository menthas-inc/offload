// A write the screen has already drawn: the order of events is the contract.

import { describe, expect, it } from "vitest";
import { perform, reverse, type Reversible, type ToastAction, type Writes } from "../src/lib/optimistic";

function harness() {
  const log: string[] = [];
  const toasts: { message: string; action?: ToastAction }[] = [];
  const toast = {
    show: (message: string, action?: ToastAction) => {
      toasts.push(action ? { message, action } : { message });
    },
  };
  let inFlight = 0;
  let settled = 0;
  const writes: Writes = {
    track: async (write) => {
      inFlight += 1;
      try {
        return await write;
      } finally {
        inFlight -= 1;
        if (inFlight === 0) settled += 1;
      }
    },
    idle: () => inFlight === 0,
  };
  const op = (outcome: { write: boolean; unwrite?: boolean }): Reversible => ({
    apply: () => log.push("apply"),
    revert: () => log.push("revert"),
    write: async () => {
      log.push("write");
      return outcome.write;
    },
    unwrite: async () => {
      log.push("unwrite");
      return outcome.unwrite ?? true;
    },
    did: "Archived",
    failed: "Couldn't archive that",
    unfailed: "Couldn't put that back",
  });
  return { log, toasts, toast, writes, op, settled: () => settled };
}

describe("perform", () => {
  it("draws before it writes, and offers Undo before the server answers", async () => {
    const h = harness();
    const done = perform(h.op({ write: true }), h.toast, h.writes);
    // Synchronously: drawn, and the toast is already up.
    expect(h.log).toEqual(["apply", "write"]);
    expect(h.toasts).toEqual([{ message: "Archived", action: expect.objectContaining({ label: "Undo" }) }]);
    expect(await done).toBe(true);
    expect(h.log).toEqual(["apply", "write"]);
  });

  it("puts the screen back and offers Retry when the write is refused", async () => {
    const h = harness();
    expect(await perform(h.op({ write: false }), h.toast, h.writes)).toBe(false);
    expect(h.log).toEqual(["apply", "write", "revert"]);
    expect(h.toasts.at(-1)).toEqual({
      message: "Couldn't archive that",
      action: expect.objectContaining({ label: "Retry" }),
    });
  });

  it("Retry runs the whole action again", async () => {
    const h = harness();
    await perform(h.op({ write: false }), h.toast, h.writes);
    h.log.length = 0;
    const retry = h.toasts.at(-1)?.action;
    await retry?.onPress();
    expect(h.log.slice(0, 2)).toEqual(["apply", "write"]);
  });

  it("names the failure's action as the op says, and offers none for null", async () => {
    const h = harness();
    await perform({ ...h.op({ write: false }), retry: "Try again" }, h.toast, h.writes);
    expect(h.toasts.at(-1)).toEqual({
      message: "Couldn't archive that",
      action: expect.objectContaining({ label: "Try again" }),
    });
    await perform({ ...h.op({ write: false }), retry: null }, h.toast, h.writes);
    expect(h.toasts.at(-1)).toEqual({ message: "Couldn't archive that" });
  });

  it("offers no Undo when nothing takes it back", async () => {
    const h = harness();
    const op = h.op({ write: true });
    delete op.unwrite;
    await perform(op, h.toast, h.writes);
    expect(h.toasts).toEqual([{ message: "Archived" }]);
  });

  it("says nothing on success when there is no word for it", async () => {
    const h = harness();
    const op = h.op({ write: true });
    delete op.did;
    await perform(op, h.toast, h.writes);
    expect(h.toasts).toEqual([]);
  });

  it("reloads once the last write in flight has settled, including a failed one", async () => {
    const h = harness();
    await Promise.all([
      perform(h.op({ write: true }), h.toast, h.writes),
      perform(h.op({ write: false }), h.toast, h.writes),
    ]);
    expect(h.settled()).toBe(1);
  });
});

describe("undo", () => {
  it("waits for the write to land before taking it back", async () => {
    const h = harness();
    let land: (ok: boolean) => void = () => undefined;
    const op = h.op({ write: true });
    op.write = () => {
      h.log.push("write");
      return new Promise<boolean>((resolve) => {
        land = resolve;
      });
    };
    void perform(op, h.toast, h.writes);
    const undo = h.toasts[0]?.action?.onPress;
    const undone = undo?.();
    // Nothing yet: the write has not landed.
    expect(h.log).toEqual(["apply", "write"]);
    land(true);
    await undone;
    expect(h.log).toEqual(["apply", "write", "revert", "unwrite"]);
  });

  it("does not take back a write that never landed", async () => {
    const h = harness();
    const op = h.op({ write: false });
    void perform(op, h.toast, h.writes);
    const undo = h.toasts[0]?.action?.onPress;
    await undo?.();
    expect(h.log).not.toContain("unwrite");
  });

  it("redraws the change when the undo is refused, with its own word", async () => {
    const h = harness();
    const op = h.op({ write: true, unwrite: false });
    await perform(op, h.toast, h.writes);
    h.log.length = 0;
    expect(await reverse(op, h.toast, h.writes)).toBe(false);
    expect(h.log).toEqual(["revert", "unwrite", "apply"]);
    expect(h.toasts.at(-1)).toEqual({
      message: "Couldn't put that back",
      action: expect.objectContaining({ label: "Retry" }),
    });
  });
});
