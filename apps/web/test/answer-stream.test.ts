// The answer stream, once the browser has given up on it.
//
// EventSource reconnects on its own, except when a reconnect is answered with
// anything but a 200: then it closes for good, and a turn waiting on it stayed
// in flight until the page was loaded again. A closed stream falls back to
// asking, on the phones' cadence.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let state = "seen";
const asked: string[] = [];
vi.stubGlobal("fetch", async (url: string) => {
  asked.push(String(url));
  return new Response(JSON.stringify({ state, reply: state === "seen" ? null : "Filed it." }), { status: 200 });
});

const streams: FakeSource[] = [];
class FakeSource {
  static CLOSED = 2;
  readyState = 0;
  listeners = new Map<string, (event: { data?: string }) => void>();
  constructor() {
    streams.push(this);
  }
  addEventListener(name: string, listener: (event: { data?: string }) => void) {
    this.listeners.set(name, listener);
  }
  close() {
    this.readyState = 2;
  }
}
vi.stubGlobal("EventSource", FakeSource);

const { awaitAnswer } = await import("../src/lib/dump");

beforeEach(() => {
  vi.useFakeTimers();
  state = "seen";
  asked.length = 0;
  streams.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a stream the browser closed", () => {
  it("is followed by asking until the turn settles", async () => {
    const seen: string[] = [];
    awaitAnswer("m1", (answer) => seen.push(answer.state));
    // A reconnect refused: the browser closes the stream and says error.
    streams[0]!.readyState = FakeSource.CLOSED;
    streams[0]!.listeners.get("error")!({});
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([]);

    state = "answered";
    await vi.advanceTimersByTimeAsync(1500);
    expect(seen).toEqual(["answered"]);

    // And nothing more once it has.
    const after = asked.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(asked.length).toBe(after);
  });

  it("stops asking once cancelled", async () => {
    const cancel = awaitAnswer("m1", () => {});
    streams[0]!.readyState = FakeSource.CLOSED;
    streams[0]!.listeners.get("error")!({});
    await vi.advanceTimersByTimeAsync(0);
    cancel();
    const after = asked.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(asked.length).toBe(after);
  });
});
