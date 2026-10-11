// When the conversation asks for its tail. 2026-10-11.
//
// Once when it mounts, which on a cold launch while signed in is the whole
// story. After a sign-out it mounts again with nobody signed in, the ask finds
// nothing, and the person who signs in next would see an empty conversation
// until a relaunch. So an ask that found nothing is asked again when the
// phone is claimed, and one that was answered is never asked twice.

import { describe, expect, it } from "vitest";
import { tailAsker } from "../lib/conversation-tail";

/** An ask the test answers by hand. */
function asks() {
  const pending: ((answered: boolean) => void)[] = [];
  const ask = () => new Promise<boolean>((resolve) => pending.push(resolve));
  return { ask, pending };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the tail", () => {
  it("is asked once, and not again once the server answered", async () => {
    const { ask, pending } = asks();
    const askTail = tailAsker(ask);
    askTail();
    pending[0]!(true);
    await settle();
    askTail();
    expect(pending).toHaveLength(1);
  });

  it("is asked again after an ask that found nobody signed in", async () => {
    const { ask, pending } = asks();
    const askTail = tailAsker(ask);
    askTail();
    pending[0]!(false);
    await settle();
    askTail();
    expect(pending).toHaveLength(2);
  });

  // A cold launch: the mount's ask is out when launch claims the phone.
  it("is not asked twice at once, and a call while out is kept if the ask fails", async () => {
    const { ask, pending } = asks();
    const askTail = tailAsker(ask);
    askTail();
    askTail();
    expect(pending).toHaveLength(1);
    pending[0]!(false);
    await settle();
    expect(pending).toHaveLength(2);
    pending[1]!(true);
    await settle();
    askTail();
    expect(pending).toHaveLength(2);
  });

  it("treats an ask that threw as one that found nothing", async () => {
    let calls = 0;
    const askTail = tailAsker(() => {
      calls += 1;
      return Promise.reject(new Error("offline"));
    });
    askTail();
    await settle();
    askTail();
    expect(calls).toBe(2);
  });
});
