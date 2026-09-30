// 026. An accepted email becomes one dump (AC-5, AC-8).

import { randomBytes } from "node:crypto";
import { PNG } from "pngjs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { receiveMail } from "../src/mail-in/receive.js";
import { resetObjectStore } from "../src/blobs/store.js";
import { DAILY_MODEL_BUDGET_MICROS } from "../src/budget.js";
import { wipe } from "./labels-kit.js";
import { DOMAIN, person, raw, resolver, signed } from "./mail-kit.js";

await migrate(() => {});
afterAll(closeDb);

let jo: string;
beforeEach(async () => {
  resetObjectStore();
  await sql`delete from mail_signatures`.execute(db);
  await db.deleteFrom("blobs").execute();
  await wipe();
  jo = await person(`jo@${DOMAIN}`);
});

const receive = (message: Buffer) => receiveMail(message, { resolver: resolver() });
const messages = () => db.selectFrom("messages").selectAll().where("account_id", "=", jo).execute();
const jobs = () =>
  db.selectFrom("jobs").select(["kind", "payload"]).where("account_id", "=", jo).where("kind", "=", "dump.answer").execute();

const FORWARD = [
  "Put this with the trip",
  "",
  "---------- Forwarded message ---------",
  "From: Iberia <no-reply@iberia.test>",
  "Date: Mon, Sep 28, 2026 at 6:02 PM",
  "Subject: Booking LX3K9",
  "To: <jo@mail.test>",
  "",
  "Your flight out is on 3 October and back on 10 October.",
].join("\r\n");

function withImage(body: string): string {
  const image = new PNG({ width: 700, height: 1100 });
  image.data = randomBytes(700 * 1100 * 4);
  const b64 = PNG.sync.write(image).toString("base64").replace(/.{76}/g, "$&\r\n");
  return raw({
    headers: [],
    body: [
      "--b1",
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
      "--b1",
      "Content-Type: image/png",
      "Content-Transfer-Encoding: base64",
      'Content-Disposition: attachment; filename="pass.png"',
      "",
      b64,
      "--b1--",
      "",
    ].join("\r\n"),
  }).replace("Content-Type: text/plain; charset=utf-8", 'Content-Type: multipart/mixed; boundary="b1"');
}

describe("an accepted email (AC-5)", () => {
  it("becomes one message with source mail, its text whole and what the turn needs in attrs", async () => {
    expect(await receive(await signed(raw({ body: FORWARD })))).toBe("accepted");
    const [message, ...rest] = await messages();
    expect(rest).toEqual([]);
    expect(message).toMatchObject({ source: "mail", role: "person", type: "text", state: "seen", looking_at_thread_id: null });
    expect(message!.text).toContain("Your flight out is on 3 October");
    expect((message!.attrs as { mail: unknown }).mail).toMatchObject({
      subject: "Booking LX3K9",
      fromName: "Iberia",
      fromAddress: "no-reply@iberia.test",
      noteLength: "Put this with the trip".length,
      leftOut: {},
      cc: false,
    });
    const [job] = await jobs();
    expect(job!.payload).not.toHaveProperty("mailLook");
  });

  it("seals its images as unclaimed candidates and names them on the job", async () => {
    expect(await receive(await signed(withImage("Boarding pass attached")))).toBe("accepted");
    const [job] = await jobs();
    const look = (job!.payload as { mailLook: string[] }).mailLook;
    expect(look).toHaveLength(1);
    const blob = await db.selectFrom("blobs").select(["message_id", "account_id"]).where("id", "=", look[0]!).executeTakeFirstOrThrow();
    expect(blob).toEqual({ message_id: null, account_id: jo });
  });

  it("files a second delivery of the same email once", async () => {
    const message = await signed(raw({ body: FORWARD }));
    await receive(message);
    await receive(message);
    expect(await messages()).toHaveLength(1);
    expect(await jobs()).toHaveLength(1);
  });

  it("stores nothing but the text and the attrs: no raw message, no headers", async () => {
    await receive(await signed(raw({ body: FORWARD })));
    const [message] = await messages();
    expect(JSON.stringify(message)).not.toContain("DKIM-Signature");
    expect(JSON.stringify(message)).not.toContain("Message-ID");
  });

  it("writes a nothing row and files nothing for an email with nothing to keep", async () => {
    await receive(await signed(raw({ body: "" })));
    expect(await messages()).toEqual([]);
    const [row] = await db.selectFrom("activity").selectAll().where("account_id", "=", jo).execute();
    expect(row).toMatchObject({ kind: "mail", mail_outcome: "nothing", title: "Nothing filed from an email" });
  });
});

describe("the caps (AC-8)", () => {
  it("drops the thirty-first accepted email in an hour and writes one row a day", async () => {
    for (let i = 0; i < 32; i++) await receive(await signed(raw({ body: `note ${i}` })));
    expect(await messages()).toHaveLength(30);
    const rows = await db.selectFrom("activity").selectAll().where("account_id", "=", jo).where("mail_outcome", "=", "over_limit").execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "Too many emails today", body: "Some weren't added. Forward them again tomorrow." });
  });

  it("drops the hundred-and-first in a day", async () => {
    // A hundred forwarded in the last day, none in the last hour: the hourly
    // cap is clear and the daily is not.
    const conversation = await db.insertInto("conversations").values({ account_id: jo }).returning("id").executeTakeFirstOrThrow();
    await sql`
      insert into messages (conversation_id, account_id, role, type, text, state, source, turn_id, created_at)
      select ${conversation.id}, ${jo}, 'person', 'text', 'n', 'seen', 'mail', uuid_v7(), now() - interval '2 hours'
      from generate_series(1, 100)
    `.execute(db);
    expect(await receive(await signed(raw({ body: "one more" })))).toBe("over_limit");
  });

  it("drops an email for an account over its daily model budget, with the same row", async () => {
    await db
      .insertInto("llm_usage")
      .values({ account_id: jo, job_kind: "dump.answer", category: "interactive", model: "claude-sonnet-5", cost_micros: DAILY_MODEL_BUDGET_MICROS })
      .execute();
    expect(await receive(await signed(raw({ body: "note" })))).toBe("over_limit");
    expect(await messages()).toEqual([]);
    const rows = await db.selectFrom("activity").select("mail_outcome").where("account_id", "=", jo).execute();
    expect(rows).toEqual([{ mail_outcome: "over_limit" }]);
  });
});
