// 026. A refused email writes one plain row, capped, and nothing from the
// email (AC-4).

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { receiveMail } from "../src/mail-in/receive.js";
import { wipe } from "./labels-kit.js";
import { DOMAIN, raw, resolver, signed } from "./mail-kit.js";

await migrate(() => {});
afterAll(closeDb);

let jo: string;
beforeEach(async () => {
  await sql`delete from mail_signatures`.execute(db);
  await wipe();
  jo = (
    await db
      .insertInto("accounts")
      .values({ email: `jo@${DOMAIN}`, state: "active", email_verified: true, display_name: "Jo", analytics_subject_id: uuidv7() })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
});

const receive = (message: Buffer | string, opts: { down?: boolean; now?: Date } = {}) =>
  receiveMail(Buffer.from(message), { resolver: resolver({ down: opts.down }), ...(opts.now ? { now: opts.now } : {}) });
const rows = () => db.selectFrom("activity").selectAll().where("account_id", "=", jo).execute();

describe("a refused email (AC-4)", () => {
  it("writes one row in the named account's record, carrying nothing from the email", async () => {
    await receive(raw({ subject: "Fwd: Zebra LX3K9" }));
    const [row, ...rest] = await rows();
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      kind: "mail",
      mail_outcome: "refused",
      sent: false,
      title: "An email couldn't be added",
      body: "Couldn't confirm it came from you, so it wasn't kept.",
      message_id: null,
      turn_id: null,
      thread_id: null,
      content_id: null,
    });
  });

  it("writes one an hour", async () => {
    await receive(raw());
    await receive(raw());
    expect(await rows()).toHaveLength(1);
  });

  it("writes three a day", async () => {
    for (let i = 0; i < 5; i++) {
      await receive(raw());
      await db
        .updateTable("activity")
        .set({ occurred_at: sql`occurred_at - interval '61 minutes'` })
        .where("account_id", "=", jo)
        .execute();
    }
    expect(await rows()).toHaveLength(3);
  });

  it("writes nothing for a stranger, a malformed From, a replay or a key that could not be fetched", async () => {
    await receive(raw({ from: "stranger@elsewhere.test" }));
    await receive(raw({ from: `jo@${DOMAIN}, mallory@${DOMAIN}` }));
    await receive(await signed(raw()), { down: true });
    const message = await signed(raw());
    await receive(message);
    await receive(message);
    expect((await rows()).filter((r) => r.mail_outcome === "refused")).toEqual([]);
  });
});
