// 048. `GET /v1/changes`, over a real socket.
//
// For the reason `stream.test.ts` gives: `app.inject` buffers a response and
// returns it whole, which is exactly what a broken stream does, so only a real
// port read as it arrives can tell a stream from a response.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { stopListening } from "../src/dumps/answers.js";
import { stopHub } from "../src/live/hub.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { webOrigins } from "../src/env.js";
import { account, row, signIn, thread, wipe } from "./labels-kit.js";

await migrate(() => {});

let app: App;
let origin: string;
const logged: string[] = [];

beforeAll(async () => {
  app = await buildApp();
  // Every line the route logs, to show there is one per stream and none per
  // event. Pino writes to the descriptor, so the request's logger is wrapped.
  app.addHook("onRequest", async (request) => {
    const log = request.log;
    for (const level of ["info", "warn", "debug"] as const) {
      const original = log[level].bind(log);
      log[level] = ((...args: unknown[]) => {
        const text = args.filter((arg) => typeof arg === "string").join(" ");
        if (text.includes("live stream")) logged.push(`${level} ${text}`);
        return (original as (...a: unknown[]) => void)(...args);
      }) as typeof log.info;
    }
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
  stopHub();
  await stopListening();
  await closeDb();
});

beforeEach(async () => {
  await wipe();
  logged.length = 0;
});

/** Read the stream as it arrives, frame by frame. */
function open(cookie: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const frames: string[] = [];
  let ended = false;
  const started = fetch(`${origin}/v1/changes`, { headers: { cookie, ...headers }, signal: controller.signal })
    .then(async (response) => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split = buffer.indexOf("\n\n");
        while (split >= 0) {
          frames.push(buffer.slice(0, split));
          buffer = buffer.slice(split + 2);
          split = buffer.indexOf("\n\n");
        }
      }
      ended = true;
      return response;
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return null;
      throw error;
    });

  const until = async (match: RegExp, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const found = frames.find((frame) => match.test(frame));
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`no frame matching ${match}: ${frames.join(" | ")}`);
  };

  return { frames, until, ended: () => ended, close: () => controller.abort(), started };
}

/** Every event's data, parsed. */
const events = (frames: string[]) =>
  frames
    .filter((frame) => frame.startsWith("event: changes"))
    .map((frame) => JSON.parse(frame.split("\ndata: ")[1]!) as Record<string, unknown>);

describe("opening", () => {
  it("refuses a request with no session", async () => {
    const response = await fetch(`${origin}/v1/changes`);
    expect(response.status).toBe(401);
  });

  it("is a stream that opens with ready, uncacheable, and echoes only an allowed origin", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const site = webOrigins[0]!;

    const allowed = await fetch(`${origin}/v1/changes`, { headers: { cookie, origin: site } });
    expect(allowed.headers.get("content-type")).toBe("text/event-stream");
    expect(allowed.headers.get("cache-control")).toContain("no-cache");
    expect(allowed.headers.get("access-control-allow-origin")).toBe(site);
    expect(allowed.headers.get("vary")).toBe("Origin");

    // The headers every other answer carries; hijacking skips the hook.
    expect(allowed.headers.get("x-content-type-options")).toBe("nosniff");
    expect(allowed.headers.get("x-frame-options")).toBe("DENY");
    expect(allowed.headers.get("referrer-policy")).toBe("no-referrer");
    expect(allowed.headers.get("strict-transport-security")).toContain("max-age=");
    await allowed.body?.cancel();

    // Refused outright, not streamed without the header: a socket held for a
    // page that cannot read it still counts against the account's cap.
    const refused = await fetch(`${origin}/v1/changes`, { headers: { cookie, origin: "https://not-us.example" } });
    expect(refused.status).toBe(403);
    expect(refused.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("opens with a ready that carries data, which a browser dispatches only then", async () => {
    const me = await account();
    const stream = open(await signIn(me));
    expect(await stream.until(/^event: ready/)).toBe("event: ready\ndata: {}");
    stream.close();
  });
});

describe("what it carries", () => {
  it("says a change in the person's thread, as kinds and ids only", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const a = await thread(me);
    const stream = open(cookie);
    await stream.until(/^event: ready/);

    await row(me, a, "Ana's ferry times, 09:40");
    await stream.until(/^event: changes/);
    stream.close();

    const said = events(stream.frames);
    expect(said).toEqual([{ kinds: ["thread"], threads: [a] }]);
    for (const event of said) {
      expect(Object.keys(event).every((key) => ["kinds", "threads", "removed"].includes(key))).toBe(true);
      expect(JSON.stringify(event)).not.toMatch(/ferry|Ana/);
    }
  });

  it("logs one line when a stream closes, none per event, and its opening only at debug", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const a = await thread(me);
    const stream = open(cookie);
    await stream.until(/^event: ready/);
    for (let i = 0; i < 3; i++) {
      await row(me, a, `Row ${i}`);
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    stream.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(events(stream.frames).length).toBeGreaterThanOrEqual(2);
    expect(logged.filter((line) => line.startsWith("info"))).toEqual(["info live stream closed"]);
  });
});

describe("ending", () => {
  it("ends within one session check of being signed out, disabled or deleted, and refuses a new one", async () => {
    const out = await account();
    const disabled = await account("Meera");
    const deleted = await account("Kofi");
    const cookies = { out: await signIn(out), disabled: await signIn(disabled), deleted: await signIn(deleted) };
    const streams = { out: open(cookies.out), disabled: open(cookies.disabled), deleted: open(cookies.deleted) };
    for (const stream of Object.values(streams)) await stream.until(/^event: ready/);

    await db.deleteFrom("sessions").where("account_id", "=", out).execute();
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", disabled).execute();
    await db.deleteFrom("sessions").where("account_id", "=", deleted).execute();
    await db.deleteFrom("accounts").where("id", "=", deleted).execute();

    // The check runs every 15 seconds; the window is the check.
    const by = Date.now() + 16_500;
    while (Date.now() < by && !Object.values(streams).every((stream) => stream.ended())) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    for (const stream of Object.values(streams)) expect(stream.ended()).toBe(true);

    for (const cookie of Object.values(cookies)) {
      const again = await fetch(`${origin}/v1/changes`, { headers: { cookie } });
      expect(again.status).toBe(401);
    }
  }, 25_000);

  it("closes an account's oldest stream when a fifth opens", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const streams = [] as ReturnType<typeof open>[];
    for (let i = 0; i < 5; i++) {
      const stream = open(cookie);
      await stream.until(/^event: ready/);
      streams.push(stream);
    }
    const by = Date.now() + 2000;
    while (Date.now() < by && !streams[0]!.ended()) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(streams[0]!.ended()).toBe(true);
    expect(streams.slice(1).every((stream) => !stream.ended())).toBe(true);
    for (const stream of streams) stream.close();
  });
});
