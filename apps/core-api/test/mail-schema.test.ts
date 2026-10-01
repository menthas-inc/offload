// 026. What the database itself holds a forwarded email to.
//
// AC-5 an email is a message whose source is 'mail'.
// AC-4 a refused email's Activity row carries nothing from any email.
// AC-3 a DKIM signature is accepted once, ever.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { account, dump, wipe } from "./labels-kit.js";

await migrate(() => {});
afterAll(closeDb);
beforeEach(async () => {
  await sql`delete from mail_signatures`.execute(db);
  await wipe();
});

const activity = (accountId: string, extra: Record<string, unknown>) =>
  db
    .insertInto("activity")
    .values({ account_id: accountId, kind: "mail", sent: false, title: "An email couldn't be added", ...extra } as never)
    .execute();

describe("the mail schema (AC-3, AC-4, AC-5)", () => {
  it("accepts a message whose source is mail", async () => {
    const me = await account();
    const { messageId } = await dump(me);
    await expect(
      db.updateTable("messages").set({ source: "mail" } as never).where("id", "=", messageId).execute(),
    ).resolves.toBeTruthy();
  });

  it("refuses a mail Activity row without an outcome", async () => {
    const me = await account();
    await expect(activity(me, {})).rejects.toThrow(/activity_mail_shape_check/);
  });

  it("refuses a refused row that names an email", async () => {
    const me = await account();
    const { messageId } = await dump(me);
    await expect(activity(me, { mail_outcome: "refused", message_id: messageId })).rejects.toThrow(
      /activity_mail_shape_check/,
    );
  });

  it("takes a refused row that names nothing", async () => {
    const me = await account();
    await expect(activity(me, { mail_outcome: "refused" })).resolves.toBeTruthy();
  });

  it("refuses an outcome on another kind", async () => {
    const me = await account();
    await expect(
      db
        .insertInto("activity")
        .values({ account_id: me, kind: "moved", sent: false, title: "x", mail_outcome: "filed" } as never)
        .execute(),
    ).rejects.toThrow(/activity_mail_shape_check/);
  });

  it("inserts a signature hash once", async () => {
    const hash = Buffer.alloc(32, 7);
    const first = await sql`insert into mail_signatures (hash) values (${hash}) on conflict do nothing`.execute(db);
    const second = await sql`insert into mail_signatures (hash) values (${hash}) on conflict do nothing`.execute(db);
    expect(Number(first.numAffectedRows)).toBe(1);
    expect(Number(second.numAffectedRows)).toBe(0);
  });
});
