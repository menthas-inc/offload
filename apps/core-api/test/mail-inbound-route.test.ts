// 026. POST /v1/mail/inbound, the one public door the mail Worker uses
// (AC-1, AC-2, AC-22).

import { createHash, createHmac } from "node:crypto";
import { Writable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { wipe } from "./labels-kit.js";
import { DOMAIN, raw, resolver, signed } from "./mail-kit.js";

await migrate(() => {});

const SECRET = "s".repeat(40);
const NEXT = "n".repeat(40);

let logs = "";
const sink = new Writable({
  write(chunk, _enc, done) {
    logs += chunk.toString();
    done();
  },
});

let app: App;
let down = false;
beforeAll(async () => {
  app = await buildApp({ logStream: sink, mailSecrets: [SECRET, NEXT], mailResolver: (name, type) => resolver({ down })(name, type) });
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(async () => {
  down = false;
  logs = "";
  await sql`delete from mail_signatures`.execute(db);
  await wipe();
  await db
    .insertInto("accounts")
    .values({ email: `jo@${DOMAIN}`, state: "active", email_verified: true, display_name: "Jo", analytics_subject_id: uuidv7() })
    .execute();
});

function post(body: Buffer, opts: { secret?: string; at?: number; signature?: string } = {}) {
  const ts = String(opts.at ?? Date.now());
  const sig =
    opts.signature ??
    createHmac("sha256", opts.secret ?? SECRET)
      .update(`${ts}.${createHash("sha256").update(body).digest("hex")}`)
      .digest("hex");
  return app.inject({
    method: "POST",
    url: "/v1/mail/inbound",
    headers: { "content-type": "message/rfc822", "x-mail-timestamp": ts, "x-mail-signature": sig },
    payload: body,
  });
}

describe("POST /v1/mail/inbound (AC-1, AC-2)", () => {
  it("refuses a request without a signature", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/mail/inbound", headers: { "content-type": "message/rfc822" }, payload: "x" });
    expect(res.statusCode).toBe(401);
  });

  it("refuses a wrong signature", async () => {
    expect((await post(Buffer.from(raw()), { signature: "0".repeat(64) })).statusCode).toBe(401);
  });

  it("refuses a timestamp six minutes old", async () => {
    expect((await post(Buffer.from(raw()), { at: Date.now() - 6 * 60 * 1000 })).statusCode).toBe(401);
  });

  it("accepts the current secret and the next one", async () => {
    expect((await post(await signed(raw()))).statusCode).toBe(200);
    expect((await post(await signed(raw()), { secret: NEXT })).statusCode).toBe(200);
  });

  it("answers a refused email exactly as an accepted one", async () => {
    const accepted = await post(await signed(raw()));
    const refused = await post(Buffer.from(raw({ from: "stranger@elsewhere.test" })));
    expect([accepted.statusCode, accepted.body]).toEqual([200, "{}"]);
    expect([refused.statusCode, refused.body]).toEqual([200, "{}"]);
  });

  it("answers 503 when the signing key cannot be fetched", async () => {
    down = true;
    expect((await post(await signed(raw()))).statusCode).toBe(503);
  });

  it("refuses a body over 26MB", async () => {
    expect((await post(Buffer.alloc(27 * 1024 * 1024, 97))).statusCode).toBe(413);
  });

  it("logs no address, subject or body on any path (AC-22)", async () => {
    await post(await signed(raw({ subject: "Fwd: Zebra ferry LX3K9", body: "Secret quokka\r\n" })));
    await post(Buffer.from(raw({ subject: "Fwd: Zebra ferry LX3K9", from: "stranger@elsewhere.test" })));
    await post(Buffer.from(raw({ subject: "Fwd: Zebra ferry LX3K9" })), { signature: "0".repeat(64) });
    down = true;
    await post(await signed(raw({ subject: "Fwd: Zebra ferry LX3K9" })));
    expect(logs.length).toBeGreaterThan(0);
    for (const needle of ["Zebra", "quokka", DOMAIN, "elsewhere", "offload.club"]) expect(logs).not.toContain(needle);
  });
});

describe("the internal token stays internal (AC-1)", () => {
  it("does not open a public route to INTERNAL_SERVICE_TOKEN", async () => {
    const guarded = await buildApp({ internalHost: "core-api.railway.internal", mailSecrets: [SECRET] });
    const publicPaths = guarded
      .printRoutes({ commonPrefix: false })
      .split("\n")
      .filter((line) => line.includes("/internal/"));
    expect(publicPaths.length).toBeGreaterThan(0);
    const res = await guarded.inject({
      method: "POST",
      url: "/internal/v1/tool-call",
      headers: { host: "api.offload.club", authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    const mail = await guarded.inject({
      method: "POST",
      url: "/v1/mail/inbound",
      headers: { host: "api.offload.club", "content-type": "message/rfc822", authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` },
      payload: "x",
    });
    expect(mail.statusCode).toBe(401);
    await guarded.close();
  });
});
