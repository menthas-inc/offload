// 026. POST /v1/mail/resend, Resend's webhook for an email it received on
// to.offload.club (AC-1, AC-2, AC-22).
//
// Resend's webhook carries metadata only. The route checks Svix's signature,
// fetches the received email from Resend's API, downloads its raw bytes and
// hands them to the same receiveMail every test of the sender check drives.

import { Writable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { Webhook } from "svix";
import { buildApp, type App } from "../src/app.js";
import { MAX_IN_FLIGHT } from "../src/routes/mail-in.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { wipe } from "./labels-kit.js";
import { DOMAIN, person, raw, resolver, signed } from "./mail-kit.js";

await migrate(() => {});

const SECRET = `whsec_${Buffer.from("a".repeat(32)).toString("base64")}`;
const hook = new Webhook(SECRET);

let logs = "";
const sink = new Writable({
  write(chunk, _enc, done) {
    logs += chunk.toString();
    done();
  },
});

/** What Resend's API answers: the received email, then its raw bytes. */
let stored: { id: string; to: string[]; bytes: Buffer } | null = null;
let apiDown = false;
const calls: string[] = [];
/** Set to hold every fetch until released, so deliveries pile up in flight. */
let gate: Promise<void> | null = null;
const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  calls.push(url);
  if (gate) await gate;
  if (apiDown) return new Response("{}", { status: 500 });
  if (url.startsWith("https://api.resend.com/emails/receiving/")) {
    expect((init?.headers as Record<string, string>)["Authorization"]).toMatch(/^Bearer /);
    if (!stored || !url.endsWith(stored.id)) return new Response("{}", { status: 404 });
    return Response.json({
      id: stored.id,
      to: stored.to,
      raw: { download_url: `https://raw.test/${stored.id}`, expires_at: new Date(Date.now() + 3600_000).toISOString() },
    });
  }
  if (url.startsWith("https://raw.test/") && stored) return new Response(new Uint8Array(stored.bytes));
  return new Response("{}", { status: 404 });
}) as typeof fetch;

let app: App;
let down = false;
beforeAll(async () => {
  app = await buildApp({
    logStream: sink,
    resendWebhookSecret: SECRET,
    resendApiKey: "re_test",
    mailFetch: fakeFetch,
    mailResolver: (name, type) => resolver({ down })(name, type),
  });
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

let jo: string;
beforeEach(async () => {
  down = false;
  apiDown = false;
  logs = "";
  calls.length = 0;
  stored = null;
  await sql`delete from mail_signatures`.execute(db);
  await db.deleteFrom("blobs").execute();
  await wipe();
  jo = await person(`jo@${DOMAIN}`);
});

function event(id: string, to: string[] = ["over@to.offload.club"], type = "email.received") {
  return JSON.stringify({ type, created_at: new Date().toISOString(), data: { email_id: id, to, from: `jo@${DOMAIN}`, subject: "x" } });
}

function post(body: string, opts: { at?: Date; signature?: string; msgId?: string } = {}) {
  const msgId = opts.msgId ?? `msg_${Math.random().toString(36).slice(2)}`;
  const at = opts.at ?? new Date();
  return app.inject({
    method: "POST",
    url: "/v1/mail/resend",
    headers: {
      "content-type": "application/json",
      "svix-id": msgId,
      "svix-timestamp": String(Math.floor(at.getTime() / 1000)),
      "svix-signature": opts.signature ?? hook.sign(msgId, at, body),
    },
    payload: body,
  });
}

const messages = () => db.selectFrom("messages").select(["id", "source"]).where("account_id", "=", jo).execute();

describe("POST /v1/mail/resend (AC-1, AC-2)", () => {
  it("files an email Resend received, fetched by its id", async () => {
    stored = { id: "e1", to: ["over@to.offload.club"], bytes: await signed(raw({ body: "Dentist Tuesday 15:00" })) };
    const res = await post(event("e1"));
    expect([res.statusCode, res.body]).toEqual([200, "{}"]);
    expect(await messages()).toEqual([expect.objectContaining({ source: "mail" })]);
    expect(calls).toEqual(["https://api.resend.com/emails/receiving/e1", "https://raw.test/e1"]);
  });

  it("refuses a request without a valid signature", async () => {
    expect((await post(event("e1"), { signature: "v1,AAAA" })).statusCode).toBe(401);
    const unsigned = await app.inject({ method: "POST", url: "/v1/mail/resend", headers: { "content-type": "application/json" }, payload: event("e1") });
    expect(unsigned.statusCode).toBe(401);
    expect(calls).toEqual([]);
  });

  it("refuses a timestamp outside Svix's window", async () => {
    expect((await post(event("e1"), { at: new Date(Date.now() - 10 * 60 * 1000) })).statusCode).toBe(401);
  });

  it("ignores an event that is not a received email, and mail for any other address", async () => {
    expect((await post(event("e1", ["over@to.offload.club"], "email.sent"))).statusCode).toBe(200);
    expect((await post(event("e2", ["someone@to.offload.club"]))).statusCode).toBe(200);
    expect(calls).toEqual([]);
    expect(await messages()).toEqual([]);
  });

  it("answers a refused email exactly as an accepted one", async () => {
    stored = { id: "e3", to: ["over@to.offload.club"], bytes: Buffer.from(raw({ from: "stranger@elsewhere.test" })) };
    const res = await post(event("e3"));
    expect([res.statusCode, res.body]).toEqual([200, "{}"]);
  });

  it("answers 503 when Resend's API cannot be reached, so Resend tries again", async () => {
    apiDown = true;
    expect((await post(event("e1"))).statusCode).toBe(503);
  });

  it("answers 503 when the signing key cannot be fetched", async () => {
    down = true;
    stored = { id: "e4", to: ["over@to.offload.club"], bytes: await signed(raw()) };
    expect((await post(event("e4"))).statusCode).toBe(503);
  });

  it("refuses a raw email over 26MB without keeping it", async () => {
    stored = { id: "e5", to: ["over@to.offload.club"], bytes: Buffer.alloc(27 * 1024 * 1024, 97) };
    expect((await post(event("e5"))).statusCode).toBe(200);
    expect(await messages()).toEqual([]);
  });

  it("logs no address, subject or body on any path (AC-22)", async () => {
    stored = { id: "e6", to: ["over@to.offload.club"], bytes: await signed(raw({ subject: "Fwd: Zebra LX3K9", body: "Secret quokka\r\n" })) };
    await post(event("e6"));
    await post(event("e6"), { signature: "v1,AAAA" });
    expect(logs.length).toBeGreaterThan(0);
    for (const needle of ["Zebra", "quokka", DOMAIN, "offload.club", "e6"]) expect(logs).not.toContain(needle);
  });
});

describe("many at once", () => {
  it("holds a few and asks Resend to bring the rest back, before fetching anything for them", async () => {
    // Anybody can cause a delivery by emailing the address, and each one is a
    // download of up to 26 MB and a parse, before any account or cap is known.
    let release!: () => void;
    gate = new Promise<void>((resolve) => (release = resolve));
    try {
      const held = Array.from({ length: MAX_IN_FLIGHT }, (_, at) => post(event(`held-${at}`)));
      while (calls.length < MAX_IN_FLIGHT) await new Promise((resolve) => setTimeout(resolve, 5));
      const over = await post(event("one-too-many"));
      expect(over.statusCode).toBe(503);
      expect(calls.some((url) => url.endsWith("one-too-many"))).toBe(false);
      expect(logs).toContain('"outcome":"busy"');
      release();
      for (const response of await Promise.all(held)) expect(response.statusCode).toBe(503);
    } finally {
      release();
      gate = null;
    }
    // And the room comes back: the next one is fetched.
    await post(event("after"));
    expect(calls.some((url) => url.endsWith("after"))).toBe(true);
  });
});
