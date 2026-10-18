// The poll, and the parts of the phone client that are not a screen.
//
// **These are the pieces that cannot be checked on a device.** Whether the poll
// stops on every terminal state, whether it backs off, and whether coming back
// to the foreground asks at once are all invisible from the outside: a turn
// that answers looks the same whether the client asked once or forty times.
// Everything that genuinely needs a phone stays a device check, and this is
// what stops the rest pretending it does.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; init: RequestInit }[] = [];
let answer: { state: string; reply: string | null; threads?: unknown[] } | null = null;
let rejectNext = false;

vi.mock("../lib/api", () => ({
  send: (path: string, init: RequestInit = {}) => {
    calls.push({ path, init });
    if (rejectNext) {
      rejectNext = false;
      return Promise.reject(new SyntaxError("Unexpected token '<'"));
    }
    return Promise.resolve({ status: 200, data: answer });
  },
  upload: () => Promise.resolve({ status: 200, data: null }),
}));

// 020 made the module import a native file API for the photo upload. It is a
// device thing, shipped as TypeScript source the test runner cannot parse, and
// nothing here uploads, so it is stood in for rather than loaded.
vi.mock("expo-file-system", () => ({ File: class {} }));

const { awaitAnswer, fetchAnswer, fetchCurrent } = await import("../lib/dump");

beforeEach(() => {
  calls.length = 0;
  answer = { state: "seen", reply: null };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Let the pending promise chain settle, then move the clock. */
async function tick(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("the poll", () => {
  it("keeps asking after an ask that threw", async () => {
    rejectNext = true;
    const seen: string[] = [];
    const poll = awaitAnswer("m1", (a) => seen.push(a.state));
    await tick(0);
    expect(seen).toEqual([]);
    answer = { state: "answered", reply: "Done." };
    await tick(1500);
    expect(seen).toEqual(["answered"]);
    poll.cancel();
  });

  it("stops on each terminal state, and only on those", async () => {
    for (const state of ["answered", "partial", "failed"]) {
      calls.length = 0;
      answer = { state, reply: "Done." };
      const seen: string[] = [];
      const poll = awaitAnswer("m1", (a) => seen.push(a.state));

      await tick(0);
      expect(seen).toEqual([state]);

      // Nothing further, however long it is left.
      const after = calls.length;
      await tick(30_000);
      expect(calls.length).toBe(after);
      poll.cancel();
    }
  });

  it("keeps asking while the turn is live, about once a second", async () => {
    awaitAnswer("m1", () => {});
    await tick(0);
    const first = calls.length;

    await tick(3000);
    // Three more seconds, three more asks, give or take the one in flight.
    expect(calls.length).toBeGreaterThanOrEqual(first + 2);
    expect(calls.length).toBeLessThanOrEqual(first + 4);
  });

  it("slows down rather than hammering a turn that is not coming", async () => {
    awaitAnswer("m1", () => {});
    await tick(0);

    // Past the point where it should have backed off.
    await tick(25_000);
    const atSlowdown = calls.length;
    await tick(10_000);

    // Two asks in ten seconds, not ten.
    expect(calls.length - atSlowdown).toBeLessThanOrEqual(3);
  });

  it("stops when cancelled, which is what backgrounding does", async () => {
    const poll = awaitAnswer("m1", () => {});
    await tick(0);
    poll.cancel();
    const after = calls.length;

    await tick(10_000);
    expect(calls.length).toBe(after);
  });

  it("asks at once when the app comes back, rather than waiting a tick", async () => {
    // Otherwise every backgrounded turn pays a full interval before the tick
    // becomes Done, which is a delay somebody can see.
    const poll = awaitAnswer("m1", () => {});
    await tick(0);
    const before = calls.length;

    poll.now();
    await tick(0);
    expect(calls.length).toBe(before + 1);
    poll.cancel();
  });

  it("does not answer after being cancelled mid-flight", async () => {
    const seen: string[] = [];
    const poll = awaitAnswer("m1", (a) => seen.push(a.state));
    answer = { state: "answered", reply: "Done." };
    poll.cancel();

    await tick(1000);
    expect(seen).toEqual([]);
  });
});

// 2026-10-11. The conversation asks for its tail when it mounts, and after a
// sign-out it mounts signed out. An empty tail and no answer were the same
// empty list, so it could not tell "nothing yet" from "ask again once
// somebody is signed in".
describe("the conversation's tail", () => {
  it("is null when nothing answered, and a list when the server did", async () => {
    answer = null;
    expect(await fetchCurrent()).toBeNull();
    (answer as unknown) = { messages: [] };
    expect(await fetchCurrent()).toEqual([]);
  });
});

describe("reading an answer", () => {
  it("always hands back a threads array, so nothing downstream guards it", async () => {
    answer = { state: "answered", reply: "Done." };
    expect((await fetchAnswer("m1"))?.threads).toEqual([]);
  });

  it("keeps the threads the turn actually wrote to", async () => {
    answer = { state: "answered", reply: "Done.", threads: [{ id: "t1", name: "Flat" }] };
    expect((await fetchAnswer("m1"))?.threads).toHaveLength(1);
  });
});

describe("the answer", () => {
  // 041. A settled turn learns from its answer which of its PDFs can be
  // opened; the parse used to drop the files on the floor, as it once did
  // `found`, and a PDF sent a moment ago said Not here yet. until a reload.
  it("keeps the message's files", async () => {
    vi.useRealTimers();
    const file = { blobId: "d1", kind: "pdf", name: "b.pdf", pages: 1, ready: true, openable: true, unreadable: false };
    answer = { state: "answered", reply: null, photos: [file] } as typeof answer;
    const got = await fetchAnswer("m1");
    expect(got?.photos).toEqual([file]);
  });
});
