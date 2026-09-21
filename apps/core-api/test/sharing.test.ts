// 022. Sharing a thread: the sheet, the share, the invitation, the x.
//
// AC-17 Leave drops the key when others remain; restore re-wraps.
// AC-18 the sheet: members first with what they added, waiting, connections.
// AC-19 a share is a pending row with the sharer's own two titles, no key,
//       refused for the unconnected, the default thread and past three.
// AC-20 the x on a waiting row withdraws it.
// AC-22 take out: one transaction, the key, the record, unowned after.
// AC-23 the person taken out reads nothing; their own waiting shares go.
// AC-28 to AC-30 the strips and Add it, every fact checked at the tap.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";
import { memberOf, readableContent, NotYours } from "../src/threads/access.js";
import { threadKey } from "../src/blobs/keys.js";
import { deleteThread, restoreThread } from "../src/routes/threads.js";
import {
  WAITING_PER_PAIR,
  acceptInvitation,
  invitationsFor,
  shareSheet,
  shareThread,
  takeOut,
} from "../src/threads/sharing.js";
import { remove } from "../src/people/people.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_keys").execute();
  await db.deleteFrom("account_keys").execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("connections").execute();
  await db.deleteFrom("blocks").execute();
  await db.deleteFrom("accounts").execute();
});

/** An account the way promotion makes one: a key, a default thread with its
 *  key, an accepted membership. Sharing wraps keys, so a bare row is not enough. */
async function person(name: string): Promise<{ id: string; defaultThreadId: string }> {
  const outcome = await promote(`${uuidv7()}@example.test`);
  if (outcome.status !== "invited") throw new Error(outcome.status);
  await db.updateTable("accounts").set({ state: "active", display_name: name }).where("id", "=", outcome.accountId).execute();
  const row = await db.selectFrom("accounts").select("default_thread_id").where("id", "=", outcome.accountId).executeTakeFirstOrThrow();
  return { id: outcome.accountId, defaultThreadId: row.default_thread_id! };
}

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3600_000) }).execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

async function connect(a: string, b: string) {
  await db.insertInto("connections").values(a < b ? { account_a: a, account_b: b } : { account_a: b, account_b: a }).execute();
}

async function thread(accountId: string, name = "Lisbon trip"): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: accountId, name, last_activity_at: sql`now()`, updated_at: sql`now()` })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state: "accepted" }).execute();
  return row.id;
}

async function join(accountId: string, threadId: string) {
  await db.insertInto("thread_members").values({ thread_id: threadId, account_id: accountId, state: "accepted" }).execute();
}

async function content(accountId: string, threadId: string, title: string, minutesAgo = 0): Promise<string> {
  const at = new Date(Date.now() - minutesAgo * 60_000);
  const row = await db
    .insertInto("content")
    .values({ account_id: accountId, thread_id: threadId, title, type: "task", updated_at: at, created_at: at })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.updateTable("threads").set({ content_count: (eb) => eb("content_count", "+", 1) }).where("id", "=", threadId).execute();
  return row.id;
}

async function share(caller: string, threadId: string, target: string) {
  return db.transaction().execute((trx) => shareThread(trx, caller, threadId, target));
}

/** A share that must succeed, and says why when it does not. */
async function shared(caller: string, threadId: string, target: string): Promise<string> {
  const result = await share(caller, threadId, target);
  if (!result.ok) throw new Error(`share refused: ${result.error}`);
  return result.memberId;
}

async function state(threadId: string, accountId: string) {
  const row = await db.selectFrom("thread_members").select("state").where("thread_id", "=", threadId).where("account_id", "=", accountId).executeTakeFirst();
  return row?.state ?? null;
}

describe("the sheet (AC-18)", () => {
  it("lists members with what they added, then waiting, then connections not in", async () => {
    const jo = await person("Jo Martins");
    const ana = await person("Ana Duarte");
    const tom = await person("Tom Reilly");
    const sam = await person("Sam Ibekwe");
    const priya = await person("Priya Raman");
    const zed = await person("Zed");
    await connect(jo.id, ana.id);
    await connect(jo.id, tom.id);
    await connect(jo.id, sam.id);
    await connect(jo.id, zed.id);
    await db.insertInto("connection_requests").values({ from_account_id: jo.id, to_account_id: priya.id }).execute();
    await db.insertInto("blocks").values({ blocker_account_id: zed.id, blocked_account_id: jo.id }).execute();
    const lisbon = await thread(jo.id);
    await join(ana.id, lisbon);
    await content(ana.id, lisbon, "Book the Alfama flat", 3);
    await content(ana.id, lisbon, "Flights, 14th to 17th", 2);
    await content(ana.id, lisbon, "Tram 28", 1);
    await content(jo.id, lisbon, "Mine", 0);
    expect((await share(jo.id, lisbon, tom.id)).ok).toBe(true);

    const sheet = await shareSheet(jo.id, lisbon);
    expect(sheet.members.map((m) => m.accountId)).toEqual([jo.id, ana.id]);
    const anaRow = sheet.members.find((m) => m.accountId === ana.id)!;
    expect(anaRow.added).toEqual({ count: 3, titles: ["Tram 28", "Flights, 14th to 17th"] });
    expect(sheet.waiting.map((w) => w.accountId)).toEqual([tom.id]);
    // Sam is a connection not in; Priya is pending, not a connection; Zed
    // blocked Jo. Only Sam.
    expect(sheet.connections.map((c) => c.accountId)).toEqual([sam.id]);
  });

  it("is not there for a non-member or on the default thread", async () => {
    const jo = await person("Jo Martins");
    const ana = await person("Ana Duarte");
    const lisbon = await thread(jo.id);
    await expect(shareSheet(ana.id, lisbon)).rejects.toThrow(NotYours);
    await expect(shareSheet(jo.id, jo.defaultThreadId)).rejects.toThrow(NotYours);
    const cookie = await signIn(jo.id);
    const a = await app.inject({ method: "GET", url: `/v1/threads/${jo.defaultThreadId}/share`, headers: { cookie } });
    const b = await app.inject({ method: "GET", url: `/v1/threads/${uuidv7()}/share`, headers: { cookie } });
    expect([a.statusCode, b.statusCode]).toEqual([404, 404]);
    expect(a.body).toEqual(b.body);
    const bundle = await app.inject({ method: "GET", url: `/v1/threads/${jo.defaultThreadId}`, headers: { cookie } });
    expect(bundle.json().shareable).toBe(false);
    const other = await app.inject({ method: "GET", url: `/v1/threads/${lisbon}`, headers: { cookie } });
    expect(other.json().shareable).toBe(true);
  });
});

describe("sharing (AC-19, AC-21)", () => {
  it("writes a pending row with the sharer's own two titles and no key", async () => {
    const jo = await person("Jo Martins");
    const ana = await person("Ana Duarte");
    const tom = await person("Tom Reilly");
    await connect(jo.id, ana.id);
    const lisbon = await thread(jo.id);
    await join(tom.id, lisbon);
    await content(tom.id, lisbon, "Tom's row", 1);
    await content(jo.id, lisbon, "Old", 5);
    await content(jo.id, lisbon, "Older", 6);
    await content(jo.id, lisbon, "Newest", 0);

    const result = await share(jo.id, lisbon, ana.id);
    expect(result.ok).toBe(true);
    const row = await db.selectFrom("thread_members").selectAll().where("thread_id", "=", lisbon).where("account_id", "=", ana.id).executeTakeFirstOrThrow();
    expect(row.state).toBe("pending");
    expect(row.invited_by).toBe(jo.id);
    expect(row.preview).toEqual({ count: 4, titles: ["Newest", "Old"] });
    expect(row.expires_at!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expect(await db.selectFrom("thread_keys").select("account_id").where("thread_id", "=", lisbon).where("account_id", "=", ana.id).execute()).toHaveLength(0);
    expect(await memberOf(ana.id, lisbon)).toBe(false);
  });

  it("refuses every case the sheet cannot show", async () => {
    const jo = await person("Jo Martins");
    const ana = await person("Ana Duarte");
    const tom = await person("Tom Reilly");
    const zed = await person("Zed");
    const lisbon = await thread(jo.id);
    expect(await share(ana.id, lisbon, jo.id)).toEqual({ ok: false, error: "unknown_thread" });
    expect(await share(jo.id, jo.defaultThreadId, ana.id)).toEqual({ ok: false, error: "default_thread" });
    expect(await share(jo.id, lisbon, ana.id)).toEqual({ ok: false, error: "not_connected" });
    await db.insertInto("connection_requests").values({ from_account_id: jo.id, to_account_id: ana.id }).execute();
    expect(await share(jo.id, lisbon, ana.id)).toEqual({ ok: false, error: "not_connected" });
    await connect(jo.id, zed.id);
    await db.insertInto("blocks").values({ blocker_account_id: zed.id, blocked_account_id: jo.id }).execute();
    expect(await share(jo.id, lisbon, zed.id)).toEqual({ ok: false, error: "not_connected" });
    expect(await share(jo.id, lisbon, jo.id)).toEqual({ ok: false, error: "not_connected" });
    await connect(jo.id, tom.id);
    await join(tom.id, lisbon);
    expect(await share(jo.id, lisbon, tom.id)).toEqual({ ok: false, error: "already_in" });
    await connect(jo.id, ana.id);
    expect((await share(jo.id, lisbon, ana.id)).ok).toBe(true);
    expect(await share(jo.id, lisbon, ana.id)).toEqual({ ok: false, error: "waiting" });
  });

  it("caps waiting shares at three per pair, across threads", async () => {
    const jo = await person("Jo Martins");
    const ana = await person("Ana Duarte");
    await connect(jo.id, ana.id);
    for (let i = 0; i < WAITING_PER_PAIR; i++) {
      expect((await share(jo.id, await thread(jo.id, `Thread ${i}`), ana.id)).ok).toBe(true);
    }
    expect(await share(jo.id, await thread(jo.id, "One more"), ana.id)).toEqual({ ok: false, error: "too_many" });
  });

  it("shares per person over the route and names each refusal", async () => {
    const jo = await person("Jo Martins");
    const ana = await person("Ana Duarte");
    const tom = await person("Tom Reilly");
    await connect(jo.id, ana.id);
    const lisbon = await thread(jo.id);
    const cookie = await signIn(jo.id);
    await db.deleteFrom("analytics_events").execute();
    const response = await app.inject({
      method: "POST",
      url: `/v1/threads/${lisbon}/share`,
      payload: { accountIds: [ana.id, tom.id] },
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().outcomes).toEqual([
      { accountId: ana.id, ok: true },
      { accountId: tom.id, ok: false, error: "not_connected" },
    ]);
    const events = await db.selectFrom("analytics_events").selectAll().execute();
    expect(events.map((e) => e.name)).toEqual(["thread_shared"]);
    expect(JSON.stringify(events)).not.toContain(ana.id);
    expect(JSON.stringify(events)).not.toContain("Lisbon");
  });
});

describe("receiving (AC-28, AC-29, AC-30)", () => {
  it("shows the strip with the snapshot and who is in, and Add it wraps the key", async () => {
    const jo = await person("Jo Martins");
    const ana = await person("Ana Duarte");
    const tom = await person("Tom Reilly");
    await connect(jo.id, ana.id);
    const lisbon = await thread(jo.id);
    await join(tom.id, lisbon);
    await content(jo.id, lisbon, "Book the Alfama flat");
    expect((await share(jo.id, lisbon, ana.id)).ok).toBe(true);
    // A row written after the share is not in the snapshot.
    await content(tom.id, lisbon, "Tom's later row");

    const strips = await invitationsFor(ana.id);
    expect(strips).toHaveLength(1);
    expect(strips[0]).toMatchObject({
      threadId: lisbon,
      threadName: "Lisbon trip",
      from: { accountId: jo.id, displayName: "Jo Martins", initials: "JM" },
      preview: { count: 1, titles: ["Book the Alfama flat"] },
      members: ["Jo Martins", "Tom Reilly"],
    });
    const cookie = await signIn(ana.id);
    const list = await app.inject({ method: "GET", url: "/v1/threads", headers: { cookie } });
    expect(list.json().invitations).toHaveLength(1);

    const accepted = await app.inject({ method: "POST", url: `/v1/invitations/${strips[0]!.memberId}/accept`, headers: { cookie } });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ threadId: lisbon });
    expect(await memberOf(ana.id, lisbon)).toBe(true);
    expect(await db.selectFrom("thread_keys").select("account_id").where("thread_id", "=", lisbon).where("account_id", "=", ana.id).execute()).toHaveLength(1);
    expect((await db.selectFrom("thread_members").select("preview").where("thread_id", "=", lisbon).where("account_id", "=", ana.id).executeTakeFirstOrThrow()).preview).toBeNull();
    expect(await invitationsFor(ana.id)).toHaveLength(0);
    // Answered once.
    const again = await app.inject({ method: "POST", url: `/v1/invitations/${strips[0]!.memberId}/accept`, headers: { cookie } });
    expect(again.statusCode).toBe(404);
  });

  it("the strip goes, and Add it is refused, for each fact that changed", async () => {
    const jo = await person("Jo Martins");
    const ana = await person("Ana Duarte");
    const tom = await person("Tom Reilly");

    // The connection removed.
    await connect(jo.id, ana.id);
    const a = await thread(jo.id, "A");
    const memberA = await shared(jo.id, a, ana.id);
    expect(await invitationsFor(ana.id)).toHaveLength(1);
    await remove(jo.id, ana.id);
    expect(await invitationsFor(ana.id)).toHaveLength(0);
    expect(await acceptInvitation(ana.id, memberA)).toBeNull();

    // The sharer left the thread.
    await connect(jo.id, ana.id);
    const b = await thread(jo.id, "B");
    await join(tom.id, b);
    const memberB = await shared(jo.id, b, ana.id);
    await db.deleteFrom("thread_members").where("thread_id", "=", b).where("account_id", "=", jo.id).execute();
    expect(await invitationsFor(ana.id)).toHaveLength(0);
    expect(await acceptInvitation(ana.id, memberB)).toBeNull();

    // The thread deleted.
    const c = await thread(jo.id, "C");
    const memberC = await shared(jo.id, c, ana.id);
    await db.updateTable("threads").set({ deleted_at: sql`now()` }).where("id", "=", c).execute();
    expect(await invitationsFor(ana.id)).toHaveLength(0);
    expect(await acceptInvitation(ana.id, memberC)).toBeNull();

    // Expired.
    const d = await thread(jo.id, "D");
    const memberD = await shared(jo.id, d, ana.id);
    await db.updateTable("thread_members").set({ expires_at: sql`now() - interval '1 minute'` }).where("thread_id", "=", d).where("account_id", "=", ana.id).execute();
    expect(await invitationsFor(ana.id)).toHaveLength(0);
    expect(await acceptInvitation(ana.id, memberD)).toBeNull();

    // Somebody else's.
    const e = await thread(jo.id, "E");
    const memberE = await shared(jo.id, e, ana.id);
    expect(await acceptInvitation(tom.id, memberE)).toBeNull();
    expect(await acceptInvitation(ana.id, memberE)).toEqual({ threadId: e });
  });
});

describe("the x (AC-20, AC-22, AC-23)", () => {
  it("withdraws a waiting share", async () => {
    const jo = await person("Jo Martins");
    const ana = await person("Ana Duarte");
    await connect(jo.id, ana.id);
    const lisbon = await thread(jo.id);
    await share(jo.id, lisbon, ana.id);
    expect(await takeOut(jo.id, lisbon, ana.id)).toEqual({ withdrew: true, removed: false, died: false });
    expect(await state(lisbon, ana.id)).toBe("expired");
    expect(await invitationsFor(ana.id)).toHaveLength(0);
    // And can be shared again: the row is reused.
    expect((await share(jo.id, lisbon, ana.id)).ok).toBe(true);
    expect(await state(lisbon, ana.id)).toBe("pending");
  });

  it("takes a member out: the key, the record, their waiting shares, and what they left", async () => {
    const jo = await person("Jo Martins");
    const ana = await person("Ana Duarte");
    const tom = await person("Tom Reilly");
    const sam = await person("Sam Ibekwe");
    await connect(jo.id, ana.id);
    await connect(ana.id, sam.id);
    const lisbon = await thread(jo.id);
    await join(ana.id, lisbon);
    await join(tom.id, lisbon);
    await db.transaction().execute((trx) => threadKey(trx, lisbon));
    expect(await db.selectFrom("thread_keys").select("account_id").where("thread_id", "=", lisbon).execute()).toHaveLength(3);
    const anas = await content(ana.id, lisbon, "Book the Alfama flat");
    expect((await share(ana.id, lisbon, sam.id)).ok).toBe(true);

    expect(await takeOut(jo.id, lisbon, ana.id)).toEqual({ withdrew: false, removed: true, died: false });
    const row = await db.selectFrom("thread_members").selectAll().where("thread_id", "=", lisbon).where("account_id", "=", ana.id).executeTakeFirstOrThrow();
    expect(row.state).toBe("removed");
    expect(row.removed_by_account_id).toBe(jo.id);
    expect(row.removed_at).not.toBeNull();
    expect(await db.selectFrom("thread_keys").select("account_id").where("thread_id", "=", lisbon).where("account_id", "=", ana.id).execute()).toHaveLength(0);
    expect(await state(lisbon, sam.id)).toBe("expired");
    expect(await memberOf(ana.id, lisbon)).toBe(false);
    // What she added stays and is the thread's now.
    const left = await readableContent(jo.id, anas);
    expect(left).toMatchObject({ authorId: ana.id, authorIsMember: false });
    expect(await readableContent(ana.id, anas)).toBeNull();
    // The connection is untouched.
    expect(await db.selectFrom("connections").select("account_a").execute()).toHaveLength(2);
    // Her read of the thread is not found.
    const cookie = await signIn(ana.id);
    const read = await app.inject({ method: "GET", url: `/v1/threads/${lisbon}`, headers: { cookie } });
    expect(read.statusCode).toBe(404);
    // And she can be shared with again, onto the same row.
    expect((await share(jo.id, lisbon, ana.id)).ok).toBe(true);
    expect(await state(lisbon, ana.id)).toBe("pending");
  });

  it("is refused for yourself, by a non-member, and on somebody not in", async () => {
    const jo = await person("Jo Martins");
    const ana = await person("Ana Duarte");
    const tom = await person("Tom Reilly");
    const lisbon = await thread(jo.id);
    await join(ana.id, lisbon);
    await expect(takeOut(jo.id, lisbon, jo.id)).rejects.toThrow(NotYours);
    await expect(takeOut(tom.id, lisbon, ana.id)).rejects.toThrow(NotYours);
    await expect(takeOut(jo.id, lisbon, tom.id)).rejects.toThrow(NotYours);
    await expect(takeOut(jo.id, uuidv7(), ana.id)).rejects.toThrow(NotYours);
  });

  it("two members taking each other out at once leave exactly one in", async () => {
    const jo = await person("Jo Martins");
    const ana = await person("Ana Duarte");
    const lisbon = await thread(jo.id);
    await join(ana.id, lisbon);
    const outcomes = await Promise.allSettled([takeOut(jo.id, lisbon, ana.id), takeOut(ana.id, lisbon, jo.id)]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "rejected")).toHaveLength(1);
    const accepted = await db.selectFrom("thread_members").select("account_id").where("thread_id", "=", lisbon).where("state", "=", "accepted").execute();
    expect(accepted).toHaveLength(1);
    const alive = await db.selectFrom("threads").select("deleted_at").where("id", "=", lisbon).executeTakeFirstOrThrow();
    expect(alive.deleted_at).toBeNull();
  });
});

describe("leave (AC-17)", () => {
  it("drops the leaver's key when others remain, and restore re-wraps it", async () => {
    const jo = await person("Jo Martins");
    const ana = await person("Ana Duarte");
    const lisbon = await thread(jo.id);
    await join(ana.id, lisbon);
    const key = await db.transaction().execute((trx) => threadKey(trx, lisbon));
    expect(await deleteThread(ana.id, lisbon)).toEqual({ left: true, deleted: false });
    expect(await db.selectFrom("thread_keys").select("account_id").where("thread_id", "=", lisbon).execute()).toEqual([{ account_id: jo.id }]);
    expect(await restoreThread(ana.id, lisbon)).toBe(true);
    const same = await db.transaction().execute((trx) => threadKey(trx, lisbon));
    expect(same.equals(key)).toBe(true);
    expect(await db.selectFrom("thread_keys").select("account_id").where("thread_id", "=", lisbon).execute()).toHaveLength(2);
    // The last member's key stays for the purge job.
    await deleteThread(ana.id, lisbon);
    expect(await deleteThread(jo.id, lisbon)).toEqual({ left: true, deleted: true });
    expect(await db.selectFrom("thread_keys").select("account_id").where("thread_id", "=", lisbon).execute()).toEqual([{ account_id: jo.id }]);
  });
});
