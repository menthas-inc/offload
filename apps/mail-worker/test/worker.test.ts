// 026. The mail Worker moves bytes and decides nothing (AC-1).

import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { forward } from "../src/index.js";

const env = { INBOUND_URL: "https://api.test/v1/mail/inbound", MAIL_INBOUND_SECRET: "s".repeat(40) };
const bytes = new TextEncoder().encode("From: jo@mail.test\r\nTo: over@to.offload.club\r\n\r\nhi\r\n");
const message = () => ({ raw: new Response(bytes).body!, rawSize: bytes.length });

afterEach(() => vi.restoreAllMocks());

describe("the mail Worker (AC-1)", () => {
  it("posts the raw bytes, signed over a timestamp and their hash", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return new Response("{}", { status: 200 });
    });
    await worker.email(message() as never, env);
    const [call] = calls;
    expect(call!.url).toBe(env.INBOUND_URL);
    const headers = call!.init.headers as Record<string, string>;
    const body = Buffer.from(call!.init.body as ArrayBuffer);
    expect(body.equals(Buffer.from(bytes))).toBe(true);
    const digest = createHash("sha256").update(body).digest("hex");
    const expected = createHmac("sha256", env.MAIL_INBOUND_SECRET).update(`${headers["x-mail-timestamp"]}.${digest}`).digest("hex");
    expect(headers["x-mail-signature"]).toBe(expected);
    expect(headers["content-type"]).toBe("message/rfc822");
  });

  it("tries three times and then throws, so the sender's server is told", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 503 }));
    const waits: number[] = [];
    await expect(forward(bytes, env, { sleep: async (ms) => void waits.push(ms) })).rejects.toThrow(/inbound 503/);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(waits.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(25_000);
  });

  it("stops retrying once core-api accepts", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await forward(bytes, env, { sleep: async () => undefined });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("logs an outcome and nothing else", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => void lines.push(line));
    await worker.email(message() as never, env);
    expect(lines).toEqual([JSON.stringify({ outcome: "delivered" })]);
  });

  it("declares no storage, queue or database binding", () => {
    const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
    for (const binding of ["kv_namespaces", "r2_buckets", "d1_databases", "queues", "durable_objects", "services", "analytics_engine"]) {
      expect(toml).not.toContain(binding);
    }
  });
});
