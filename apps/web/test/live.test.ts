// @vitest-environment happy-dom
//
// 048 P2 and W1. The web's live connection: coming back to the tab is a
// catch-up of everything, the stream's `changes` pass through, a reconnect is
// coming back, a server's `all` is spread over two seconds, and signing out
// closes it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Changes } from "@offload/widgets";

const streams: FakeSource[] = [];
class FakeSource {
  static CLOSED = 2;
  readyState = 0;
  url: string;
  init: EventSourceInit | undefined;
  listeners = new Map<string, (event: { data?: string }) => void>();
  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.init = init;
    streams.push(this);
  }
  addEventListener(name: string, listener: (event: { data?: string }) => void) {
    this.listeners.set(name, listener);
  }
  close() {
    this.readyState = 2;
  }
  emit(name: string, data?: unknown) {
    this.listeners.get(name)?.(data === undefined ? {} : { data: JSON.stringify(data) });
  }
}
vi.stubGlobal("EventSource", FakeSource);
vi.mock("../src/lib/auth-client", () => ({ authClient: { signOut: async () => ({}) } }));

const { openLive } = await import("../src/lib/live");
const { signOut } = await import("../src/lib/sign-out");

let heard: Changes[];
let close: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  streams.length = 0;
  heard = [];
  close = openLive((changes) => heard.push(changes));
});
afterEach(() => {
  close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const visible = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("coming back", () => {
  it("reads everything when the tab becomes visible, not when it is hidden", () => {
    visible("hidden");
    expect(heard).toEqual([]);
    visible("visible");
    expect(heard).toEqual([{ kinds: ["all"] }]);
  });

  it("reads everything when the window takes the focus", () => {
    window.dispatchEvent(new Event("focus"));
    expect(heard).toEqual([{ kinds: ["all"] }]);
  });

  it("is one read when a tab switch fires both at once", () => {
    visible("visible");
    window.dispatchEvent(new Event("focus"));
    expect(heard).toHaveLength(1);
    vi.advanceTimersByTime(1500);
    window.dispatchEvent(new Event("focus"));
    expect(heard).toHaveLength(2);
  });

  it("hears nothing once closed", () => {
    close();
    visible("visible");
    window.dispatchEvent(new Event("focus"));
    expect(heard).toEqual([]);
  });
});

describe("the stream", () => {
  it("opens the changes stream with the cookie", () => {
    expect(streams).toHaveLength(1);
    expect(streams[0]!.url).toMatch(/\/v1\/changes$/);
    expect(streams[0]!.init).toEqual({ withCredentials: true });
  });

  it("passes a change straight through", () => {
    streams[0]!.emit("changes", { kinds: ["thread"], threads: ["t1"] });
    expect(heard).toEqual([{ kinds: ["thread"], threads: ["t1"] }]);
  });

  // The browser fires `open` on every connect it makes, whatever the first
  // frame is; a `ready` with no data line is never dispatched at all.
  it("takes the first connect as nothing, and every one after as coming back", () => {
    streams[0]!.emit("open");
    expect(heard).toEqual([]);
    streams[0]!.emit("open");
    expect(heard).toEqual([{ kinds: ["all"] }]);
  });

  it("ignores a frame it cannot read", () => {
    streams[0]!.listeners.get("changes")!({ data: "not json" });
    streams[0]!.emit("changes", { kinds: "thread" });
    streams[0]!.emit("changes", null);
    expect(heard).toEqual([]);
  });

  it("opens again after the browser gives up, waiting 1 s doubling to 30 s", () => {
    const refuse = (stream: FakeSource) => {
      stream.readyState = 2;
      stream.emit("error");
    };
    streams[0]!.emit("open");
    // A blip the browser is retrying itself is left to it.
    streams[0]!.emit("error");
    vi.advanceTimersByTime(60_000);
    expect(streams).toHaveLength(1);

    refuse(streams[0]!);
    vi.advanceTimersByTime(999);
    expect(streams).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(streams).toHaveLength(2);
    refuse(streams[1]!);
    vi.advanceTimersByTime(1_999);
    expect(streams).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(streams).toHaveLength(3);
    for (let n = 3; n < 8; n += 1) {
      refuse(streams[n - 1]!);
      vi.advanceTimersByTime(30_000);
    }
    expect(streams).toHaveLength(8);
    refuse(streams[7]!);
    vi.advanceTimersByTime(29_999);
    expect(streams).toHaveLength(8);

    // Back, which is coming back, and the wait starts again from a second.
    vi.advanceTimersByTime(1);
    streams[8]!.emit("open");
    expect(heard).toEqual([{ kinds: ["all"] }]);
    refuse(streams[8]!);
    vi.advanceTimersByTime(1_000);
    expect(streams).toHaveLength(10);
  });

  it("opens nothing again once closed", () => {
    streams[0]!.readyState = 2;
    streams[0]!.emit("error");
    close();
    vi.advanceTimersByTime(60_000);
    expect(streams).toHaveLength(1);
  });

  it("spreads a server's all over up to two seconds", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.75);
    streams[0]!.emit("changes", { kinds: ["all"] });
    expect(heard).toEqual([]);
    vi.advanceTimersByTime(1499);
    expect(heard).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(heard).toEqual([{ kinds: ["all"] }]);
  });

  it("closes the stream and drops a pending all when closed", () => {
    streams[0]!.emit("changes", { kinds: ["all"] });
    close();
    vi.advanceTimersByTime(2000);
    expect(heard).toEqual([]);
    expect(streams[0]!.readyState).toBe(2);
  });

  it("is closed by signing out", async () => {
    await signOut();
    expect(streams[0]!.readyState).toBe(2);
    visible("visible");
    expect(heard).toEqual([]);
  });
});
