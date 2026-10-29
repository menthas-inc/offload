// 048 on the phones: the live connection, and coming back to the foreground.
//
// React Native has no EventSource and its fetch does not stream, so the phone
// reads `expo/fetch`'s body by hand. The parser is pure and tested on its own;
// the lifecycle runs against a fake AppState, a fake fetch whose body the test
// writes chunk by chunk, and fake timers.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Changes } from "@offload/widgets";

type Listener = (state: string) => void;
const appState = vi.hoisted(() => ({ currentState: "active", listeners: new Set<(state: string) => void>() }));
vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return appState.currentState;
    },
    addEventListener: (_: string, listener: Listener) => {
      appState.listeners.add(listener);
      return { remove: () => appState.listeners.delete(listener) };
    },
  },
}));

const cookie = vi.hoisted(() => ({ value: "session=abc" }));
vi.mock("../lib/api", () => ({
  API_URL: "https://api.test",
  authHeaders: async () => (cookie.value ? { cookie: cookie.value } : {}),
}));

/** One open request: what it asked for, and the way to write its body. */
interface Opened {
  url: string;
  init: { headers?: Record<string, string>; signal?: AbortSignal };
  push: (text: string) => void;
  end: () => void;
}
const opened: Opened[] = [];
const respond = vi.hoisted(() => ({ status: 200 }));
vi.mock("expo/fetch", () => ({
  fetch: async (url: string, init: Opened["init"]) => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c;
      },
    });
    init.signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
    const encoder = new TextEncoder();
    opened.push({
      url,
      init,
      push: (text) => controller.enqueue(encoder.encode(text)),
      end: () => controller.close(),
    });
    return { ok: respond.status === 200, status: respond.status, body };
  },
}));

const { frames, openLive } = await import("../lib/live");
const { ended } = await import("../lib/session-end");

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};
const setState = (state: string): void => {
  appState.currentState = state;
  for (const listener of [...appState.listeners]) listener(state);
};

describe("the frame parser", () => {
  it("takes event and data from each whole frame and keeps a half frame for the next chunk", () => {
    const read = frames('event: ready\n\nevent: changes\ndata: {"kinds":["thread"]}\n\nevent: chan');
    expect(read.frames).toEqual([
      { event: "ready", data: "" },
      { event: "changes", data: '{"kinds":["thread"]}' },
    ]);
    expect(read.rest).toBe("event: chan");
  });

  it("skips a keep-alive comment, and reads a frame split across chunks once whole", () => {
    const first = frames(": keep-alive\n\nevent: changes\ndata: {\"kin");
    expect(first.frames).toEqual([]);
    const second = frames(`${first.rest}ds":["all"]}\n\n`);
    expect(second.frames).toEqual([{ event: "changes", data: '{"kinds":["all"]}' }]);
    expect(second.rest).toBe("");
  });

  it("reads a ready that carries an empty object as ready", () => {
    // Browsers drop an event with no data, so the server sends `data: {}`.
    expect(frames("event: ready\ndata: {}\n\n").frames).toEqual([{ event: "ready", data: "{}" }]);
  });

  it("reads CRLF line ends as LF", () => {
    expect(frames("event: ready\r\n\r\n").frames).toEqual([{ event: "ready", data: "" }]);
  });
});

describe("openLive", () => {
  let heard: Changes[];
  let close: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    opened.length = 0;
    appState.listeners.clear();
    appState.currentState = "active";
    cookie.value = "session=abc";
    respond.status = 200;
    heard = [];
  });

  afterEach(() => {
    close?.();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const start = async (): Promise<void> => {
    close = openLive((changes) => heard.push(changes));
    await flush();
  };

  it("opens the stream with the cookie in a header and nothing in the URL", async () => {
    await start();
    expect(opened).toHaveLength(1);
    expect(opened[0]!.url).toBe("https://api.test/v1/changes");
    expect(opened[0]!.init.headers?.cookie).toBe("session=abc");
  });

  it("opens nothing while signed out", async () => {
    cookie.value = "";
    await start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(opened).toHaveLength(0);
  });

  it("hands on each changes event, and says nothing for the first ready", async () => {
    await start();
    opened[0]!.push('event: ready\n\nevent: changes\ndata: {"kinds":["thread"],"threads":["t1"]}\n\n');
    await flush();
    expect(heard).toEqual([{ kinds: ["thread"], threads: ["t1"] }]);
  });

  it("treats a ready with data as ready: nothing on the first, everything after a reconnect", async () => {
    await start();
    opened[0]!.push("event: ready\ndata: {}\n\n");
    await flush();
    expect(heard).toEqual([]);
    opened[0]!.end();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    opened[1]!.push("event: ready\ndata: {}\n\n");
    await flush();
    expect(heard).toEqual([{ kinds: ["all"] }]);
  });

  it("ignores a frame whose data is not JSON", async () => {
    await start();
    opened[0]!.push("event: changes\ndata: nope\n\n");
    await flush();
    expect(heard).toEqual([]);
  });

  it("emits everything at once on coming back to the foreground, and closes on leaving it", async () => {
    await start();
    setState("background");
    await flush();
    expect(opened[0]!.init.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(opened).toHaveLength(1);

    setState("active");
    expect(heard).toEqual([{ kinds: ["all"] }]);
    await flush();
    expect(opened).toHaveLength(2);
    // The ready of the stream that coming back opened is not news: everything
    // was just read.
    opened[1]!.push("event: ready\n\n");
    await flush();
    expect(heard).toHaveLength(1);
  });

  it("reconnects after the server ends the stream, backing off 1 s doubling to 30 s, and reads everything on the ready after", async () => {
    respond.status = 503;
    await start();
    const waits: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const before = opened.length;
      let waited = 0;
      while (opened.length === before) {
        await vi.advanceTimersByTimeAsync(500);
        waited += 500;
      }
      waits.push(waited);
    }
    expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);

    respond.status = 200;
    await vi.advanceTimersByTimeAsync(30_000);
    const live = opened[opened.length - 1]!;
    live.push("event: ready\n\n");
    await flush();
    expect(heard).toEqual([{ kinds: ["all"] }]);

    // A ready resets the backoff: the next end reconnects after a second.
    const before = opened.length;
    live.end();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(opened.length).toBe(before + 1);
  });

  it("applies a server's all after a random wait of up to two seconds", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await start();
    opened[0]!.push('event: changes\ndata: {"kinds":["all"]}\n\n');
    await flush();
    expect(heard).toEqual([]);
    await vi.advanceTimersByTimeAsync(999);
    expect(heard).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(heard).toEqual([{ kinds: ["all"] }]);
  });

  it("closes on sign-out and does not reconnect or hear the foreground", async () => {
    await start();
    await ended();
    await flush();
    expect(opened[0]!.init.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    setState("background");
    setState("active");
    await flush();
    expect(opened).toHaveLength(1);
    expect(heard).toEqual([]);
  });
});
