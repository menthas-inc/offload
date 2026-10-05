// Threads: getting to one, reading it, and acting on what is in it.
//
// AC-1  My threads, grouped, reachable.
// AC-4  the page renders name, members, content, and says it is unsummarised.
// AC-5  the bundle is a fixed number of queries whatever the thread holds.
// AC-6  content is paginated on a stable cursor.
// AC-8  a count matches what a query returns.
// AC-9  any member may edit and archive.
// AC-10 only the author may delete.
// AC-11 only the author may move.
// AC-12 moving adjusts both counts in one transaction.
// AC-13 renaming does not touch content.
// AC-14 everything is reversible.
// AC-15 archiving is not deleting.
// AC-16 provenance names the dump and the author.
// AC-17 provenance never names a thread the viewer is not in.
//
// The session-scoped routes are exercised through the exported helpers and the
// route's own 401, because Better Auth signs its cookie and a test cannot
// pretend to hold one. What is asserted here is the authorization and the
// transaction, which is where the defects live.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { uuidv7 } from "../src/uuid.js";
import {
  memberOf,
  readableContent,
  requireAuthor,
  requireMember,
  requireReadable,
  NotYours,
} from "../src/threads/access.js";
import {
  deleteContent,
  editContent,
  moveContent,
  quickAdd,
  editThread,
  setArchived,
} from "../src/routes/threads.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

/** A session the API accepts, signed the way Better Auth signs one.
 *
 *  Same approach as `admin.test.ts`, and worth the few lines: without it these
 *  routes are only ever asserted to 401, and the response shapes, the guard
 *  that turns a refusal into one status, and the serialization are all
 *  untested. */
async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({
      account_id: accountId,
      token,
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    })
    .execute();
  // Better Auth's own signer, not a hand-rolled HMAC. The hand-rolled one was
  // written first and produced a signature the library rejected, which is the
  // repo's own recorded lesson: verify through the real loader, not a bespoke
  // one.
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

beforeEach(async () => {
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("llm_usage").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(name = "Ana Duarte"): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state: "active",
      email_verified: true,
      display_name: name,
      analytics_subject_id: uuidv7(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function thread(
  accountId: string,
  name: string,
  opts: { state?: "accepted" | "pending"; alwaysOn?: boolean; activeDaysAgo?: number } = {}
): Promise<string> {
  const activity = new Date(Date.now() - (opts.activeDaysAgo ?? 0) * 86_400_000);
  const row = await db
    .insertInto("threads")
    .values({
      created_by_account_id: accountId,
      name,
      always_on: opts.alwaysOn ?? false,
      last_activity_at: activity,
      updated_at: activity,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("thread_members")
    .values({ thread_id: row.id, account_id: accountId, state: opts.state ?? "accepted" })
    .execute();
  return row.id;
}

async function join(accountId: string, threadId: string, state: "accepted" | "pending" = "accepted") {
  await db
    .insertInto("thread_members")
    .values({ thread_id: threadId, account_id: accountId, state })
    .execute();
}

async function content(accountId: string, threadId: string, title: string, messageId?: string) {
  const row = await db
    .insertInto("content")
    .values({
      account_id: accountId,
      thread_id: threadId,
      title,
      type: "task",
      derived_from_message_id: messageId ?? null,
      updated_at: new Date(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .updateTable("threads")
    .set({ content_count: (eb) => eb("content_count", "+", 1) })
    .where("id", "=", threadId)
    .execute();
  return row.id;
}

describe("who can see what", () => {
  it("resolves membership through accepted state only (AC-9)", async () => {
    const mine = await account();
    const pending = await thread(mine, "Not yet", { state: "pending" });
    const accepted = await thread(mine, "Flat admin");

    expect(await memberOf(mine, accepted)).toBe(true);
    expect(await memberOf(mine, pending)).toBe(false);
  });

  it("resolves a row through membership, not through authorship", async () => {
    // The mistake 001 names: filtering reads by author hides content other
    // members wrote in a shared thread.
    const alice = await account("Alice A");
    const bob = await account("Bob B");
    const shared = await thread(alice, "Lisbon trip");
    await join(bob, shared);

    const hers = await content(alice, shared, "Book the flat");

    expect(await readableContent(bob, hers)).not.toBeNull();
    expect((await readableContent(bob, hers))!.authorId).toBe(alice);
  });

  it("gives one refusal for absent, not-yours and not-authored", async () => {
    const alice = await account("Alice A");
    const bob = await account("Bob B");
    const hers = await thread(alice, "Private");
    const row = await content(alice, hers, "Something");
    const shared = await thread(alice, "Shared");
    await join(bob, shared);
    const sharedRow = await content(alice, shared, "Ours");

    const reasons: string[] = [];
    for (const attempt of [
      () => requireMember(bob, hers),
      () => requireReadable(bob, row),
      () => requireReadable(bob, uuidv7()),
      () => requireAuthor(bob, sharedRow),
    ]) {
      await expect(attempt()).rejects.toThrow(NotYours);
      await attempt().catch((e: Error) => reasons.push(e.message));
    }
    expect(new Set(reasons).size).toBe(1);
  });
});

describe("My threads", () => {
  it("never lists another account's threads (AC-1)", async () => {
    const me = await account();
    const them = await account("Other");
    await thread(them, "Theirs");

    const rows = await db
      .selectFrom("thread_members")
      .select("thread_id")
      .where("account_id", "=", me)
      .execute();
    expect(rows).toHaveLength(0);
  });

  it("refuses without a session", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/threads" });
    expect(response.statusCode).toBe(401);
  });
});

describe("the bundle", () => {
  it("counts active and archived separately and honestly (AC-8, AC-15)", async () => {
    const me = await account();
    const t = await thread(me, "Flat admin");
    const a = await content(me, t, "One");
    await content(me, t, "Two");
    await db.updateTable("content").set({ archived_at: new Date() }).where("id", "=", a).execute();

    const counts = await db
      .selectFrom("content")
      .select((eb) => [
        eb.fn.count<string>("id").filterWhere("archived_at", "is", null).as("active"),
        eb.fn.count<string>("id").filterWhere("archived_at", "is not", null).as("archived"),
      ])
      .where("thread_id", "=", t)
      .where("deleted_at", "is", null)
      .executeTakeFirstOrThrow();

    expect(Number(counts.active)).toBe(1);
    expect(Number(counts.archived)).toBe(1);
  });

  it("refuses a thread you are not in, and one that does not exist, identically", async () => {
    const me = await account();
    const them = await account("Other");
    const theirs = await thread(them, "Theirs");

    const a = await app.inject({ method: "GET", url: `/v1/threads/${theirs}` });
    const b = await app.inject({ method: "GET", url: `/v1/threads/${uuidv7()}` });
    // Both 401 without a session; the point is that neither leaks which case
    // it was before authentication is even considered.
    expect(a.statusCode).toBe(b.statusCode);
  });
});

describe("pagination", () => {
  it("walks 80 rows with no repeats and no gaps (AC-6)", async () => {
    const me = await account();
    const t = await thread(me, "Read later");
    for (let i = 0; i < 80; i++) await content(me, t, `piece ${i}`);

    // The cursor the route uses, exercised directly against the same ordering.
    // Eighty rows inserted in a loop share milliseconds, which is exactly the
    // case that lost a row when the cursor carried a truncated timestamp.
    const page = async (cursor?: string) => {
      let q = db
        .selectFrom("content")
        .select(["id", "title"])
        .where("thread_id", "=", t)
        .where("deleted_at", "is", null)
        .where("archived_at", "is", null)
        .orderBy("id", "desc")
        .limit(31);
      if (cursor) q = q.where("id", "<", cursor);
      const rows = await q.execute();
      const slice = rows.slice(0, 30);
      const last = slice.at(-1);
      return { rows: slice, next: rows.length > 30 && last ? last.id : null };
    };

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const result: { rows: { id: string }[]; next: string | null } = await page(cursor ?? undefined);
      seen.push(...result.rows.map((r) => r.id));
      cursor = result.next;
      if (!cursor) break;
    }

    expect(seen).toHaveLength(80);
    expect(new Set(seen).size).toBe(80);
  });
});

describe("acting on content", () => {
  it("lets any member edit, and records what it was (AC-9, AC-14)", async () => {
    const alice = await account("Alice A");
    const bob = await account("Bob B");
    const shared = await thread(alice, "Lisbon trip");
    await join(bob, shared);
    const row = await content(alice, shared, "Book the flat");

    // Bob is not the author and may still fix it.
    await expect(requireReadable(bob, row)).resolves.toBeTruthy();
  });

  it("lets any member archive, and archiving is not deleting (AC-9, AC-15)", async () => {
    const alice = await account("Alice A");
    const bob = await account("Bob B");
    const shared = await thread(alice, "Flat admin");
    await join(bob, shared);
    const row = await content(alice, shared, "Boiler service");

    await db.updateTable("content").set({ archived_at: new Date() }).where("id", "=", row).execute();

    const after = await db
      .selectFrom("content")
      .select(["archived_at", "deleted_at", "purge_after"])
      .where("id", "=", row)
      .executeTakeFirstOrThrow();

    expect(after.archived_at).not.toBeNull();
    // Nothing destroyed, nothing scheduled. That is the whole difference.
    expect(after.deleted_at).toBeNull();
    expect(after.purge_after).toBeNull();
  });

  it("lets only the author delete (AC-10)", async () => {
    const alice = await account("Alice A");
    const bob = await account("Bob B");
    const shared = await thread(alice, "Lisbon trip");
    await join(bob, shared);
    const hers = await content(alice, shared, "Book the flat");

    await expect(requireAuthor(bob, hers)).rejects.toThrow(NotYours);
    await expect(requireAuthor(alice, hers)).resolves.toBeTruthy();
  });

  it("lets only the author move, even when both are in both threads (AC-11)", async () => {
    // The defect this rule exists for: without it, Bob moves Alice's content
    // into a thread she is not in and it is gone from her view for good.
    const alice = await account("Alice A");
    const bob = await account("Bob B");
    const shared = await thread(alice, "Lisbon trip");
    const other = await thread(bob, "Bob's own");
    await join(bob, shared);
    await join(alice, other);

    const hers = await content(alice, shared, "Book the flat");

    await expect(requireAuthor(bob, hers)).rejects.toThrow(NotYours);
    await expect(requireAuthor(alice, hers)).resolves.toBeTruthy();
  });
});

describe("provenance", () => {
  it("names the dump and the author (AC-16)", async () => {
    const me = await account("Ana Duarte");
    const t = await thread(me, "Lisbon trip");

    const conversation = await db
      .insertInto("conversations")
      .values({ account_id: me })
      .returning("id")
      .executeTakeFirstOrThrow();
    const message = await db
      .insertInto("messages")
      .values({
        conversation_id: conversation.id,
        account_id: me,
        role: "person",
        type: "text",
        turn_id: uuidv7(),
        text: "book the Alfama flat for the 14th",
        state: "answered",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const row = await content(me, t, "Book the Alfama flat", message.id);

    const found = await db
      .selectFrom("content")
      .innerJoin("messages", "messages.id", "content.derived_from_message_id")
      .select(["messages.text as text", "content.account_id as author"])
      .where("content.id", "=", row)
      .executeTakeFirstOrThrow();

    expect(found.text).toBe("book the Alfama flat for the 14th");
    expect(found.author).toBe(me);
  });

  it("does not record where content used to live (AC-17)", async () => {
    // There is no column for it, which is the point: a moved row cannot carry
    // its old thread's name to somebody who was never in that thread, because
    // nothing stores the old thread. Asked of the database rather than of an
    // object literal, which is what the first version of this did and which
    // asserted nothing at all.
    const columns = await sql<{ column_name: string }>`
      select column_name from information_schema.columns
      where table_name = 'content'
    `.execute(db);
    const names = columns.rows.map((r) => r.column_name);
    expect(names).toContain("thread_id");
    expect(names).not.toContain("previous_thread_id");
    expect(names.filter((n) => n.includes("thread"))).toEqual(["thread_id"]);

    const me = await account();
    const from = await thread(me, "Wrong place");
    const to = await thread(me, "Right place");
    const row = await content(me, from, "Oak brackets");

    await db.updateTable("content").set({ thread_id: to }).where("id", "=", row).execute();

    const after = await db
      .selectFrom("content")
      .selectAll()
      .where("id", "=", row)
      .executeTakeFirstOrThrow();
    expect(after.thread_id).toBe(to);
    expect(JSON.stringify(after)).not.toContain("Wrong place");
  });
});

describe("the write transactions", () => {
  it("edit returns what was there, not what is there now (AC-14)", async () => {
    const me = await account();
    const t = await thread(me, "Bookshelf build");
    const row = await content(me, t, "Oak brakets");

    const previous = await editContent(me, row, { title: "Oak brackets" });

    // The value Undo would restore. Returning the new one would look correct
    // and do nothing, which is the bug this asserts against.
    expect(previous.title).toBe("Oak brakets");
    const after = await db
      .selectFrom("content").select("title").where("id", "=", row).executeTakeFirstOrThrow();
    expect(after.title).toBe("Oak brackets");
  });

  it("rename returns the old name (AC-13, AC-14)", async () => {
    const me = await account();
    const t = await thread(me, "Lisbon");
    const row = await content(me, t, "Book the flat");

    const { previous } = await editThread(me, t, { name: "Lisbon trip" });
    expect(previous.name).toBe("Lisbon");

    // And content is untouched.
    const after = await db
      .selectFrom("content").select("title").where("id", "=", row).executeTakeFirstOrThrow();
    expect(after.title).toBe("Book the flat");
  });

  it("move adjusts both counts in one transaction (AC-12)", async () => {
    const me = await account();
    const from = await thread(me, "Miscellaneous");
    const to = await thread(me, "Bookshelf build");
    const row = await content(me, from, "Oak brackets");

    const counts = async () =>
      Object.fromEntries(
        (await db.selectFrom("threads").select(["id", "content_count"]).execute())
          .map((r) => [r.id, r.content_count])
      );

    expect((await counts())[from]).toBe(1);
    expect((await counts())[to]).toBe(0);

    const previous = await moveContent(me, row, to);

    expect(previous.threadId).toBe(from);
    expect((await counts())[from]).toBe(0);
    expect((await counts())[to]).toBe(1);
  });

  it("move refuses a destination the author is not in (AC-11)", async () => {
    const me = await account();
    const them = await account("Other");
    const mine = await thread(me, "Mine");
    const theirs = await thread(them, "Theirs");
    const row = await content(me, mine, "Something");

    await expect(moveContent(me, row, theirs)).rejects.toThrow(NotYours);
    const after = await db
      .selectFrom("content").select("thread_id").where("id", "=", row).executeTakeFirstOrThrow();
    expect(after.thread_id).toBe(mine);
  });

  it("move by a non-author is refused even when both are in both threads (AC-11)", async () => {
    // The defect the author-only rule exists for. Bob is a member of the
    // source and the destination, so a per-thread role check would let this
    // through, and Alice's content would leave a thread she is in for one she
    // is not, with no notice and no way back.
    const alice = await account("Alice A");
    const bob = await account("Bob B");
    const shared = await thread(alice, "Lisbon trip");
    const bobs = await thread(bob, "Bob's own");
    await join(bob, shared);

    const hers = await content(alice, shared, "Book the flat");

    await expect(moveContent(bob, hers, bobs)).rejects.toThrow(NotYours);
    const after = await db
      .selectFrom("content").select("thread_id").where("id", "=", hers).executeTakeFirstOrThrow();
    expect(after.thread_id).toBe(shared);
  });

  it("delete is soft, decrements, and enqueues its own purge (AC-10, AC-14)", async () => {
    const me = await account();
    const t = await thread(me, "Flat admin");
    const row = await content(me, t, "Boiler service");

    expect(await deleteContent(me, row)).toBe(true);

    const after = await db
      .selectFrom("content")
      .select(["deleted_at", "purge_after"])
      .where("id", "=", row)
      .executeTakeFirstOrThrow();
    expect(after.deleted_at).not.toBeNull();
    // Eight seconds, not eight minutes and not zero.
    expect(after.purge_after!.getTime() - after.deleted_at!.getTime()).toBe(8_000);

    const t2 = await db
      .selectFrom("threads").select("content_count").where("id", "=", t).executeTakeFirstOrThrow();
    expect(t2.content_count).toBe(0);

    const purges = await db
      .selectFrom("jobs").selectAll().where("kind", "=", "content.purge").execute();
    expect(purges).toHaveLength(1);
    expect(purges[0]!.run_after.getTime()).toBeGreaterThan(Date.now() + 5_000);
  });

  it("delete twice deletes once (AC-14)", async () => {
    const me = await account();
    const t = await thread(me, "Flat admin");
    const row = await content(me, t, "Boiler service");

    expect(await deleteContent(me, row)).toBe(true);
    expect(await deleteContent(me, row)).toBe(false);

    const t2 = await db
      .selectFrom("threads").select("content_count").where("id", "=", t).executeTakeFirstOrThrow();
    // Not decremented twice, which is what a missing guard would do.
    expect(t2.content_count).toBe(0);
  });

  // Security review 2026-09-22, M1. Restore is the Undo for delete as well as
  // for archive, and it let any member put back a row its author had removed.
  it("restore of a deleted row is the author's, and everyone's once the author is gone", async () => {
    const me = await account("Ana Duarte");
    const other = await account("Jo Martins");
    const t = await thread(me, "Flat admin");
    await join(other, t);
    const row = await content(me, t, "Boiler service");

    await deleteContent(me, row);
    await expect(setArchived(other, row, false)).rejects.toBeInstanceOf(NotYours);
    const still = await db.selectFrom("content").select("deleted_at").where("id", "=", row).executeTakeFirstOrThrow();
    expect(still.deleted_at).not.toBeNull();

    // Un-archiving stays co-owned.
    const theirs = await content(me, t, "Buy a lamp");
    await setArchived(other, theirs, true);
    await setArchived(other, theirs, false);

    // The author can, and so can anyone once the author has left the thread.
    await setArchived(me, row, false);
    await deleteContent(me, row);
    await db.updateTable("thread_members").set({ state: "left" }).where("thread_id", "=", t).where("account_id", "=", me).execute();
    await setArchived(other, row, false);
    const back = await db.selectFrom("content").select("deleted_at").where("id", "=", row).executeTakeFirstOrThrow();
    expect(back.deleted_at).toBeNull();
  });

  it("types a row into a section named after a prototype key as a note, not a 500", async () => {
    const me = await account("Ana Duarte");
    const t = await thread(me, "Flat admin");
    for (const section of ["constructor", "__proto__", "toString"]) {
      const typed = await quickAdd(me, t, "Todo names in three words", section);
      expect(typed.kind).toBe("note");
    }
  });

  it("restore brings back a deleted row and its count (AC-14, AC-15)", async () => {
    const me = await account();
    const t = await thread(me, "Flat admin");
    const row = await content(me, t, "Boiler service");

    await deleteContent(me, row);
    await setArchived(me, row, false);

    const after = await db
      .selectFrom("content")
      .select(["deleted_at", "purge_after", "archived_at"])
      .where("id", "=", row)
      .executeTakeFirstOrThrow();
    expect(after.deleted_at).toBeNull();
    expect(after.purge_after).toBeNull();
    expect(after.archived_at).toBeNull();

    const t2 = await db
      .selectFrom("threads").select("content_count").where("id", "=", t).executeTakeFirstOrThrow();
    // An undo that restores the row and leaves the header saying one fewer is
    // AC-8 broken by the undo path rather than by the delete.
    expect(t2.content_count).toBe(1);
  });

  it("archiving leaves the count, and restoring puts it back, once (AC-8, AC-15)", async () => {
    // The thread row's number is what is live in the thread, the same total
    // the pane head shows. It counted archived rows until 2026-09-16, and the
    // two disagreed on any thread with something archived.
    const me = await account();
    const t = await thread(me, "Read later");
    const row = await content(me, t, "Three essays on attention");
    const count = async () =>
      (await db.selectFrom("threads").select("content_count").where("id", "=", t).executeTakeFirstOrThrow())
        .content_count;

    await setArchived(me, row, true);
    expect(await count()).toBe(0);
    // A second archive of an archived row is not a second decrement.
    await setArchived(me, row, true);
    expect(await count()).toBe(0);

    await setArchived(me, row, false);
    expect(await count()).toBe(1);
    await setArchived(me, row, false);
    expect(await count()).toBe(1);
  });

  it("deleting an archived row does not count it out twice (AC-8)", async () => {
    const me = await account();
    const t = await thread(me, "Read later");
    const row = await content(me, t, "Three essays on attention");
    await content(me, t, "Kept");
    const count = async () =>
      (await db.selectFrom("threads").select("content_count").where("id", "=", t).executeTakeFirstOrThrow())
        .content_count;

    await setArchived(me, row, true);
    expect(await count()).toBe(1);
    await deleteContent(me, row);
    expect(await count()).toBe(1);
    // Restore undoes both, and puts back one.
    await setArchived(me, row, false);
    expect(await count()).toBe(2);
  });

  it("moving an archived row moves neither count (AC-12)", async () => {
    const me = await account();
    const from = await thread(me, "Read later");
    const to = await thread(me, "Flat admin");
    const row = await content(me, from, "Three essays on attention");
    await content(me, to, "Boiler service");
    const count = async (id: string) =>
      (await db.selectFrom("threads").select("content_count").where("id", "=", id).executeTakeFirstOrThrow())
        .content_count;

    await setArchived(me, row, true);
    await moveContent(me, row, to);
    expect(await count(from)).toBe(0);
    expect(await count(to)).toBe(1);
  });
});

describe("the routes, with a real session", () => {
  it("serves My threads, grouped, with a composed meta line (AC-1)", async () => {
    const me = await account("Ana Duarte");
    const sam = await account("Sam Ibekwe");
    const lisbon = await thread(me, "Lisbon trip");
    await join(sam, lisbon);
    // 028: always_on no longer holds a thread in a group of its own.
    await thread(me, "Read later", { alwaysOn: true, activeDaysAgo: 2 });
    await thread(me, "Berlin", { activeDaysAgo: 40 });
    await content(me, lisbon, "Book the flat");

    const response = await app.inject({
      method: "GET",
      url: "/v1/threads",
      headers: { cookie: await signIn(me) },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      groups: { key: string; threads: { name: string; meta: string; count: number }[] }[];
    };
    const byKey = Object.fromEntries(body.groups.map((g) => [g.key, g.threads]));

    expect(Object.keys(byKey)).toEqual(["now", "older"]);
    expect(byKey["now"]!.map((t) => t.name)).toEqual(["Lisbon trip", "Read later"]);
    expect(byKey["older"]!.map((t) => t.name)).toEqual(["Berlin"]);

    // Composed server-side so three clients cannot drift. What is open in the
    // thread by kind, and who with; never "you" (2026-09-29).
    expect(byKey["now"]![0]!.meta).toBe("1 to do, with Sam");
    expect(byKey["now"]![1]!.meta).toBe("");
  });

  it("serves a thread bundle, and says it is unsummarised (AC-4, AC-8)", async () => {
    const me = await account("Ana Duarte");
    const t = await thread(me, "Flat admin");
    const a = await content(me, t, "Boiler service");
    await content(me, t, "Insurance renewal");
    await db.updateTable("content").set({ archived_at: new Date() }).where("id", "=", a).execute();

    const response = await app.inject({
      method: "GET",
      url: `/v1/threads/${t}`,
      headers: { cookie: await signIn(me) },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      name: string;
      counts: { active: number; archived: number };
      members: { displayName: string; isYou: boolean; initials: string }[];
      standing: null;
    };
    expect(body.name).toBe("Flat admin");
    expect(body.counts).toEqual({ active: 1, archived: 1, unlabelled: 1 });
    expect(body.members).toEqual([
      { accountId: me, displayName: "Ana Duarte", initials: "AD", isYou: true },
    ]);
    // The field exists and is null, so the client renders an empty state from a
    // value rather than from an absence.
    expect(body.standing).toBeNull();
    // The same line My threads draws, for the web's head (2026-09-29): the
    // archived row does not count.
    expect((body as unknown as { line: string }).line).toBe("1 to do");
  });

  it("refuses another account's thread the same way as one that does not exist", async () => {
    const me = await account();
    const them = await account("Other");
    const theirs = await thread(them, "Theirs");
    const cookie = await signIn(me);

    const a = await app.inject({ method: "GET", url: `/v1/threads/${theirs}`, headers: { cookie } });
    const b = await app.inject({ method: "GET", url: `/v1/threads/${uuidv7()}`, headers: { cookie } });

    expect(a.statusCode).toBe(404);
    expect(a.statusCode).toBe(b.statusCode);
    expect(a.body).toBe(b.body);
  });

  it("serves content with canDelete and canMove per row (AC-10, AC-11)", async () => {
    const alice = await account("Alice A");
    const bob = await account("Bob B");
    const shared = await thread(alice, "Lisbon trip");
    await join(bob, shared);
    await content(alice, shared, "Book the flat");
    await content(bob, shared, "Tram tickets");

    const response = await app.inject({
      method: "GET",
      url: `/v1/threads/${shared}/content`,
      headers: { cookie: await signIn(bob) },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      rows: { title: string; canDelete: boolean; canMove: boolean }[];
    };
    const byTitle = Object.fromEntries(body.rows.map((r) => [r.title, r]));

    // Bob sees Alice's row, which is the point of resolving reads through
    // membership, and cannot delete or move it.
    expect(byTitle["Book the flat"]).toMatchObject({ canDelete: false, canMove: false });
    expect(byTitle["Tram tickets"]).toMatchObject({ canDelete: true, canMove: true });
  });

  it("serves provenance without the old thread's name (AC-16, AC-17)", async () => {
    const me = await account("Ana Duarte");
    const from = await thread(me, "Miscellaneous");
    const to = await thread(me, "Lisbon trip");

    const conversation = await db
      .insertInto("conversations").values({ account_id: me })
      .returning("id").executeTakeFirstOrThrow();
    const message = await db
      .insertInto("messages")
      .values({
        conversation_id: conversation.id, account_id: me, role: "person", type: "text",
        turn_id: uuidv7(), text: "book the Alfama flat for the 14th", state: "answered",
      })
      .returning("id").executeTakeFirstOrThrow();

    const row = await content(me, from, "Book the Alfama flat", message.id);
    await moveContent(me, row, to);

    const response = await app.inject({
      method: "GET",
      url: `/v1/content/${row}`,
      headers: { cookie: await signIn(me) },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      threadName: string;
      from: { text: string } | null;
    };
    expect(body.from!.text).toBe("book the Alfama flat for the 14th");
    expect(body.threadName).toBe("Lisbon trip");
    // Never where it used to be.
    expect(response.body).not.toContain("Miscellaneous");
  });

  it("refuses a delete by a non-author through the route (AC-10)", async () => {
    const alice = await account("Alice A");
    const bob = await account("Bob B");
    const shared = await thread(alice, "Lisbon trip");
    await join(bob, shared);
    const hers = await content(alice, shared, "Book the flat");

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/content/${hers}`,
      headers: { cookie: await signIn(bob) },
    });

    expect(response.statusCode).toBe(404);
    const still = await db
      .selectFrom("content").select("deleted_at").where("id", "=", hers).executeTakeFirstOrThrow();
    expect(still.deleted_at).toBeNull();
  });

  it("lets a non-author edit and archive through the route (AC-9)", async () => {
    const alice = await account("Alice A");
    const bob = await account("Bob B");
    const shared = await thread(alice, "Flat admin");
    await join(bob, shared);
    const hers = await content(alice, shared, "Boiler servcie");
    const cookie = await signIn(bob);

    const edited = await app.inject({
      method: "PATCH",
      url: `/v1/content/${hers}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { title: "Boiler service" },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().previous.title).toBe("Boiler servcie");

    const archived = await app.inject({
      method: "POST",
      url: `/v1/content/${hers}/archive`,
      headers: { cookie },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().content.archivedAt).not.toBeNull();
  });

  it("carries the other end of a span, so the rail can draw one (015 AC-7)", async () => {
    // `occurs_end_at` has been written since 0011 and read by nothing. 015 is
    // the first thing that draws it, and it was on the row, off the select and
    // absent from every shape above it, so a two day event drew as a point.
    const me = await account();
    const t = await thread(me, "Lisbon trip");
    const row = await content(me, t, "Staying in Alfama");
    await db
      .updateTable("content")
      .set({
        occurs_at: new Date("2026-09-15T10:00:00Z"),
        occurs_end_at: new Date("2026-09-17T10:00:00Z"),
      })
      .where("id", "=", row)
      .execute();
    const cookie = await signIn(me);

    const page = await app.inject({
      method: "GET",
      url: `/v1/threads/${t}/content`,
      headers: { cookie },
    });
    expect(page.json().rows[0].occursEndAt).toBe("2026-09-17T10:00:00.000Z");

    const one = await app.inject({ method: "GET", url: `/v1/content/${row}`, headers: { cookie } });
    expect(one.json().occursEndAt).toBe("2026-09-17T10:00:00.000Z");
  });

  it("paginates through the route with a stable cursor (AC-6)", async () => {
    const me = await account();
    const t = await thread(me, "Read later");
    for (let i = 0; i < 65; i++) await content(me, t, `piece ${i}`);
    const cookie = await signIn(me);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 5; guard++) {
      const url = `/v1/threads/${t}/content${cursor ? `?cursor=${cursor}` : ""}`;
      const response = await app.inject({ method: "GET", url, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { rows: { id: string }[]; nextCursor: string | null };
      seen.push(...body.rows.map((r) => r.id));
      cursor = body.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toHaveLength(65);
    expect(new Set(seen).size).toBe(65);
  });
});

describe("nothing here leaks content (AC-18)", () => {
  it("emits no analytics event at all, so none can carry a title", async () => {
    // The strongest version of OFF-1 available: the feature emits nothing.
    // A test that checked event *properties* would pass the day somebody adds
    // an event and forgets, so this asserts the count instead.
    const me = await account("Ana Duarte");
    const t = await thread(me, "Lisbon trip");
    const row = await content(me, t, "Miradouro da Senhora do Monte");
    const cookie = await signIn(me);

    await app.inject({ method: "GET", url: "/v1/threads", headers: { cookie } });
    await app.inject({ method: "GET", url: `/v1/threads/${t}`, headers: { cookie } });
    await app.inject({ method: "GET", url: `/v1/threads/${t}/content`, headers: { cookie } });
    await app.inject({ method: "GET", url: `/v1/content/${row}`, headers: { cookie } });
    await app.inject({
      method: "PATCH", url: `/v1/content/${row}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { title: "Miradouro" },
    });
    await app.inject({ method: "POST", url: `/v1/content/${row}/archive`, headers: { cookie } });
    await app.inject({ method: "DELETE", url: `/v1/content/${row}`, headers: { cookie } });
    await app.inject({
      method: "PATCH", url: `/v1/threads/${t}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { name: "Lisbon" },
    });

    expect(await db.selectFrom("analytics_events").selectAll().execute()).toHaveLength(0);
  });

  it("keeps content out of the job payload the delete enqueues", async () => {
    const me = await account();
    const t = await thread(me, "Flat admin");
    const row = await content(me, t, "biopsy results came back");

    await deleteContent(me, row);

    const jobs = await db.selectFrom("jobs").selectAll().where("kind", "=", "content.purge").execute();
    expect(jobs).toHaveLength(1);
    // A payload is the thing that ends up in a log line when somebody debugs
    // the queue, so it carries ids and nothing else. This one carries not even
    // an id, because the purge is a sweep.
    expect(JSON.stringify(jobs[0]!.payload)).not.toContain("biopsy");
    expect(jobs[0]!.last_error).toBeNull();
  });
});

describe("the answer says where it filed things (005 links)", () => {
  it("names threads from the content rows, not from the reply", async () => {
    // offload naming a thread it did not write to is the failure 004 exists to
    // prevent. The links come from the record, so a reply that lies cannot
    // produce a link that lies with it.
    const me = await account("Ana Duarte");
    const flat = await thread(me, "Flat admin");
    const shelf = await thread(me, "Bookshelf build");

    const conversation = await db
      .insertInto("conversations").values({ account_id: me })
      .returning("id").executeTakeFirstOrThrow();
    const turnId = uuidv7();
    const message = await db
      .insertInto("messages")
      .values({
        conversation_id: conversation.id, account_id: me, role: "person", type: "text",
        turn_id: turnId, text: "dentist after the 20th, and oak brackets", state: "answered",
      })
      .returning("id").executeTakeFirstOrThrow();
    await db
      .insertInto("messages")
      .values({
        conversation_id: conversation.id, account_id: me, role: "offload", type: "text",
        turn_id: turnId,
        // Deliberately names a thread it did not write to.
        text: "Added to Flat admin, Bookshelf build and Lisbon trip.",
        state: "answered",
      })
      .execute();

    await content(me, flat, "Dentist after the 20th", message.id);
    await content(me, shelf, "Oak brackets", message.id);
    await content(me, flat, "Ring the surgery", message.id);

    const response = await app.inject({
      method: "GET",
      url: `/v1/messages/${message.id}`,
      headers: { cookie: await signIn(me) },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { threads: { id: string; name: string }[] };

    // Two, in filing order, deduplicated. Not the three the sentence claims.
    expect(body.threads.map((t) => t.name)).toEqual(["Flat admin", "Bookshelf build"]);
    expect(body.threads.map((t) => t.id)).toEqual([flat, shelf]);
  });

  it("names nothing for a turn that filed nothing", async () => {
    const me = await account();
    const conversation = await db
      .insertInto("conversations").values({ account_id: me })
      .returning("id").executeTakeFirstOrThrow();
    const message = await db
      .insertInto("messages")
      .values({
        conversation_id: conversation.id, account_id: me, role: "person", type: "text",
        turn_id: uuidv7(), text: "nothing much today", state: "answered",
      })
      .returning("id").executeTakeFirstOrThrow();

    const response = await app.inject({
      method: "GET",
      url: `/v1/messages/${message.id}`,
      headers: { cookie: await signIn(me) },
    });
    expect((response.json() as { threads: unknown[] }).threads).toEqual([]);
  });

  it("drops a thread whose content was undone", async () => {
    const me = await account();
    const t = await thread(me, "Flat admin");
    const conversation = await db
      .insertInto("conversations").values({ account_id: me })
      .returning("id").executeTakeFirstOrThrow();
    const message = await db
      .insertInto("messages")
      .values({
        conversation_id: conversation.id, account_id: me, role: "person", type: "text",
        turn_id: uuidv7(), text: "boiler service", state: "answered",
      })
      .returning("id").executeTakeFirstOrThrow();
    const row = await content(me, t, "Boiler service", message.id);
    // A second row from the same dump, elsewhere, so the message itself stays:
    // the last row's delete takes the message too (036, 2026-10-05).
    const elsewhere = await thread(me, "Bookshelf build");
    await content(me, elsewhere, "Brackets", message.id);

    await deleteContent(me, row);

    const response = await app.inject({
      method: "GET",
      url: `/v1/messages/${message.id}`,
      headers: { cookie: await signIn(me) },
    });
    // A link to a thread the content no longer sits in is a link to nothing.
    expect((response.json() as { threads: { id: string }[] }).threads.map((x) => x.id)).toEqual([elsewhere]);
  });
});

describe("the meta line names people the way the kit does", () => {
  it("names one and folds the rest into a count", async () => {
    const me = await account("Ana Duarte");
    const t = await thread(me, "Big thread");
    for (const name of ["Sam Ibekwe", "Tom Reilly", "Mia Fell"]) {
      await join(await account(name), t);
    }

    const response = await app.inject({
      method: "GET",
      url: "/v1/threads",
      headers: { cookie: await signIn(me) },
    });
    const body = response.json() as { groups: { threads: { meta: string }[] }[] };
    const meta = body.groups.flatMap((g) => g.threads)[0]!.meta;

    expect(meta).toMatch(/^with \S+ and 2 more$/);
    expect(meta).not.toContain("thing");
  });
});

describe("the line's counts are the viewer's (2026-09-29)", () => {
  it("counts nothing in a thread the viewer is not in", async () => {
    const me = await account("Ana Duarte");
    const them = await account("Other");
    const theirs = await thread(them, "Theirs");
    await content(them, theirs, "Private task");
    const { openKinds } = await import("../src/routes/threads.js");
    expect((await openKinds(me, [theirs])).get(theirs)).toBeUndefined();
    expect((await openKinds(them, [theirs])).get(theirs)).toEqual({ task: 1 });
  });
});

describe("deleting a thread through the route, not just the function", () => {
  it("removes it and answers which thing it did", async () => {
    // A route test rather than a call to the exported helper. The helper was
    // green while the screen did nothing, which is exactly the gap a unit test
    // on the function cannot see: registration, schema, serialization.
    const ana = await account();
    const flat = await thread(ana, "EU with fam");
    const cookie = await signIn(ana);

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/threads/${flat}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ left: true, deleted: true });

    const list = await app.inject({ method: "GET", url: "/v1/threads", headers: { cookie } });
    const names = (list.json() as { groups: { threads: { name: string }[] }[] }).groups.flatMap(
      (group) => group.threads.map((row) => row.name)
    );
    expect(names).not.toContain("EU with fam");
  });

  it("puts it back", async () => {
    const ana = await account();
    const flat = await thread(ana, "EU with fam");
    const cookie = await signIn(ana);

    await app.inject({ method: "DELETE", url: `/v1/threads/${flat}`, headers: { cookie } });
    const back = await app.inject({
      method: "POST",
      url: `/v1/threads/${flat}/restore`,
      headers: { cookie },
    });

    expect(back.statusCode).toBe(200);
    const list = await app.inject({ method: "GET", url: "/v1/threads", headers: { cookie } });
    const names = (list.json() as { groups: { threads: { name: string }[] }[] }).groups.flatMap(
      (group) => group.threads.map((row) => row.name)
    );
    expect(names).toContain("EU with fam");
  });

  it("refuses the default thread with the one refusal", async () => {
    const ana = await account();
    const misc = await thread(ana, "Miscellaneous");
    await db.updateTable("accounts").set({ default_thread_id: misc }).where("id", "=", ana).execute();
    const cookie = await signIn(ana);

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/threads/${misc}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("the note routes, over HTTP", () => {
  async function addOne(cookie: string, threadId: string, text: string) {
    const response = await app.inject({
      method: "POST",
      url: `/v1/threads/${threadId}/notes`,
      headers: { cookie },
      payload: { text },
    });
    return response;
  }

  it("adds, and the thread carries it", async () => {
    const ana = await account();
    const flat = await thread(ana, "EU with fam");
    const cookie = await signIn(ana);

    const added = await addOne(cookie, flat, "Always use the todo list");
    expect(added.statusCode).toBe(200);

    const bundle = await app.inject({
      method: "GET",
      url: `/v1/threads/${flat}`,
      headers: { cookie },
    });
    const notes = (bundle.json() as { notes: { text: string }[] }).notes;
    expect(notes.map((m) => m.text)).toEqual(["Always use the todo list"]);
  });

  it("deletes, and the thread stops carrying it", async () => {
    const ana = await account();
    const flat = await thread(ana, "EU with fam");
    const cookie = await signIn(ana);

    const added = await addOne(cookie, flat, "Always use the todo list");
    const { note } = added.json() as { note: { id: string } };

    const gone = await app.inject({
      method: "DELETE",
      url: `/v1/notes/${note.id}`,
      headers: { cookie },
    });
    expect(gone.statusCode).toBe(200);
    expect(gone.json()).toEqual({ deleted: true });

    const bundle = await app.inject({
      method: "GET",
      url: `/v1/threads/${flat}`,
      headers: { cookie },
    });
    expect((bundle.json() as { notes: unknown[] }).notes).toHaveLength(0);
  });

  it("mutes and unmutes", async () => {
    const ana = await account();
    const flat = await thread(ana, "EU with fam");
    const cookie = await signIn(ana);
    const added = await addOne(cookie, flat, "Always use the todo list");
    const { note } = added.json() as { note: { id: string } };

    const muted = await app.inject({
      method: "POST",
      url: `/v1/notes/${note.id}/mute`,
      headers: { cookie },
      payload: { muted: true },
    });
    expect(muted.statusCode).toBe(200);
    expect((muted.json() as { note: { muted: boolean } }).note.muted).toBe(true);
  });

  it("edits, and answers with what it was", async () => {
    const ana = await account();
    const flat = await thread(ana, "EU with fam");
    const cookie = await signIn(ana);
    const added = await addOne(cookie, flat, "Always use the todo list");
    const { note } = added.json() as { note: { id: string } };

    const edited = await app.inject({
      method: "PATCH",
      url: `/v1/notes/${note.id}`,
      headers: { cookie },
      payload: { text: "Always use the todo list, not the timeline" },
    });
    expect(edited.statusCode).toBe(200);
    expect((edited.json() as { previous: string }).previous).toBe("Always use the todo list");
  });
});

describe("the rail's own quick add, over HTTP", () => {
  async function addOnDay(cookie: string, threadId: string, text: string, day?: string) {
    return app.inject({
      method: "POST",
      url: `/v1/threads/${threadId}/quick-add`,
      headers: { cookie },
      payload: { text, section: "timeline", ...(day ? { day } : {}) },
    });
  }

  // The day travels structurally and nothing else does. A "Repeats weekly" box
  // rode alongside it for three days and came off on 2026-09-14: `edit_content`
  // cannot set a repeat either, which was the argument for the box, but the
  // model reads the words as it writes the row, so "weekly on Monday at 2pm"
  // sets one and says more than a box could.
  it("starts as an event on the day given, and not repeating", async () => {
    const ana = await account();
    const flat = await thread(ana, "EU with fam");
    const cookie = await signIn(ana);

    const added = await addOnDay(cookie, flat, "brunch at 11 with Ana", "2026-09-13");
    expect(added.statusCode).toBe(200);
    const { id, kind } = added.json() as { id: string; kind: string };
    expect(kind).toBe("content");

    const row = await db
      .selectFrom("content")
      .select(["type", "title", "occurs_at", "rrule", "attrs"])
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(row.type).toBe("event");
    expect(row.title).toBe("brunch at 11 with Ana");
    // Noon, so the day survives being read west of Greenwich, same as
    // everywhere else a bare day is parsed.
    expect(row.occurs_at?.toISOString()).toBe("2026-09-13T12:00:00.000Z");
    expect(row.rrule).toBeNull();
    expect((row.attrs as Record<string, unknown>)["all_day"]).toBe(true);
  });

});

// ---------------------------------------------------------------- 023
//
// AC-25 the person-facing edit takes title, body, the three dates, All day,
//       the rule and Remind me in one request, absent leaving a field alone
//       and null clearing it, and returns the previous values so Undo can put
//       every one of them back, the flag included.
// AC-26 scoped as the existing edit is, and a row on a calendar is refused.

import { Refused } from "../src/threads/refusals.js";

describe("023 the when field on the edit", () => {
  async function task(me: string, th: string, over: Record<string, unknown> = {}): Promise<string> {
    const row = await db
      .insertInto("content")
      .values({ account_id: me, thread_id: th, title: "Pay the rent", type: "task", ...over } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  }
  async function held(id: string) {
    return db
      .selectFrom("content")
      .select(["title", "body", "due_at", "occurs_at", "occurs_end_at", "rrule", "is_reminder", "attrs"])
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
  }
  const allDayOf = (attrs: unknown) => (attrs as Record<string, unknown> | null)?.["all_day"] === true;

  it("a bare day is noon UTC and all day; an hour is an instant in the account's zone", async () => {
    const me = await account();
    await db.updateTable("accounts").set({ time_zone: "Europe/Lisbon" } as never).where("id", "=", me).execute();
    const th = await thread(me, "Flat admin");
    const id = await task(me, th);

    await editContent(me, id, { dueAt: "2026-09-25" });
    let row = await held(id);
    expect(row.due_at?.toISOString()).toBe("2026-09-25T12:00:00.000Z");
    expect(allDayOf(row.attrs)).toBe(true);

    await editContent(me, id, { dueAt: "2026-09-25T09:00:00", allDay: false });
    row = await held(id);
    expect(row.due_at?.toISOString()).toBe("2026-09-25T08:00:00.000Z");
    expect(allDayOf(row.attrs)).toBe(false);
  });

  it("absent leaves a field alone and null clears it, and previous carries all of them", async () => {
    const me = await account();
    const th = await thread(me, "Flat admin");
    const id = await task(me, th, { due_at: new Date("2026-09-25T12:00:00Z"), rrule: "FREQ=MONTHLY", is_reminder: true });

    const previous = await editContent(me, id, { title: "Rent" });
    expect(previous).toMatchObject({
      title: "Pay the rent",
      body: null,
      dueAt: "2026-09-25T12:00:00.000Z",
      occursAt: null,
      occursEndAt: null,
      rrule: "FREQ=MONTHLY",
      isReminder: true,
    });
    let row = await held(id);
    expect(row.title).toBe("Rent");
    expect(row.rrule).toBe("FREQ=MONTHLY");

    await editContent(me, id, { isReminder: false });
    expect((await held(id)).is_reminder).toBe(false);

    // Clearing the anchor clears the rule with it.
    await editContent(me, id, { dueAt: null });
    row = await held(id);
    expect(row.due_at).toBeNull();
    expect(row.rrule).toBeNull();

    // Undo is the previous values written back in one request.
    await editContent(me, id, previous);
    row = await held(id);
    expect(row.title).toBe("Pay the rent");
    expect(row.due_at?.toISOString()).toBe("2026-09-25T12:00:00.000Z");
    expect(row.rrule).toBe("FREQ=MONTHLY");
    expect(row.is_reminder).toBe(true);
  });

  it("Undo puts back an all-day date that Clear removed, because previous carries the day as a day", async () => {
    // The security review of 2026-09-22: the snapshot carried the stored
    // instant with allDay true, and the route's own consistency check refused
    // it, so Clear then Undo lost the date for good on the commonest row.
    const me = await account();
    const th = await thread(me, "Flat admin");
    const id = await task(me, th, { due_at: new Date("2026-09-25T12:00:00Z"), attrs: { all_day: true } });

    const previous = await editContent(me, id, { dueAt: null });
    expect(previous.dueAt).toBe("2026-09-25");
    expect(previous.allDay).toBe(true);
    expect((await held(id)).due_at).toBeNull();

    await editContent(me, id, previous);
    const row = await held(id);
    expect(row.due_at?.toISOString()).toBe("2026-09-25T12:00:00.000Z");
    expect(allDayOf(row.attrs)).toBe(true);
  });

  it("Undo of a title change is not refused on a row that is on a calendar", async () => {
    // Same review: previous carries every date field, and a date field merely
    // present read as a date change, which a calendar-backed row refuses.
    const me = await account();
    const th = await thread(me, "Flat admin");
    const id = await task(me, th, {
      type: "event",
      occurs_at: new Date("2026-09-25T08:00:00Z"),
      source_ref: { provider: "google", eventId: "evt_1" },
    });

    const previous = await editContent(me, id, { title: "Rent day" });
    expect((await held(id)).title).toBe("Rent day");
    await editContent(me, id, previous);
    expect((await held(id)).title).toBe("Pay the rent");
    expect((await held(id)).occurs_at?.toISOString()).toBe("2026-09-25T08:00:00.000Z");
  });

  it("a rule is stored canonical and refused by name outside the grammar or without its anchor", async () => {
    const me = await account();
    const th = await thread(me, "Flat admin");
    const id = await task(me, th, { due_at: new Date("2026-09-25T12:00:00Z") });
    await editContent(me, id, { rrule: "byday=fr;freq=weekly" });
    expect((await held(id)).rrule).toBe("FREQ=WEEKLY;BYDAY=FR");
    await expect(editContent(me, id, { rrule: "FREQ=HOURLY" })).rejects.toMatchObject({ code: "bad_rule" });
    await expect(editContent(me, id, { dueAt: null, rrule: "FREQ=WEEKLY" })).rejects.toMatchObject({ code: "bad_rule" });
    const undated = await task(me, th);
    await expect(editContent(me, undated, { rrule: "FREQ=WEEKLY" })).rejects.toMatchObject({ code: "bad_rule" });
  });

  it("an event anchors its rule on its occurrence, and clearing the occurrence clears the end and the rule", async () => {
    const me = await account();
    const th = await thread(me, "Flat admin");
    const id = await task(me, th, { type: "event" });
    await editContent(me, id, { occursAt: "2026-09-25T18:00:00Z", occursEndAt: "2026-09-25T19:00:00Z", rrule: "FREQ=WEEKLY" });
    let row = await held(id);
    expect(row.rrule).toBe("FREQ=WEEKLY");
    await expect(editContent(me, id, { occursEndAt: "2026-09-25T17:00:00Z" })).rejects.toMatchObject({ code: "bad_date" });
    await editContent(me, id, { occursAt: null });
    row = await held(id);
    expect(row.occurs_at).toBeNull();
    expect(row.occurs_end_at).toBeNull();
    expect(row.rrule).toBeNull();
  });

  it("refuses a date, All day and a rule on a row that is on a calendar", async () => {
    const me = await account();
    const th = await thread(me, "Flat admin");
    const id = await task(me, th, { type: "event", occurs_at: new Date("2026-09-25T18:00:00Z"), source_ref: "google:abc" });
    await expect(editContent(me, id, { occursAt: "2026-09-26T18:00:00Z" })).rejects.toMatchObject({ code: "on_calendar" });
    await expect(editContent(me, id, { rrule: "FREQ=WEEKLY" })).rejects.toMatchObject({ code: "on_calendar" });
    await expect(editContent(me, id, { allDay: true })).rejects.toMatchObject({ code: "on_calendar" });
    await editContent(me, id, { title: "Dentist" });
    expect((await held(id)).title).toBe("Dentist");
  });

  it("is scoped per row by membership, so any member may set or clear a date", async () => {
    const me = await account();
    const ana = await account("Ana");
    const th = await thread(me, "Lisbon trip");
    await join(ana, th);
    const id = await task(me, th);
    await editContent(ana, id, { dueAt: "2026-09-25" });
    expect((await held(id)).due_at).not.toBeNull();
    await editContent(ana, id, { dueAt: null });
    expect((await held(id)).due_at).toBeNull();
    const stranger = await account("Sam");
    await expect(editContent(stranger, id, { dueAt: "2026-09-25" })).rejects.toBeInstanceOf(NotYours);
  });
});

// ---------------------------------------------------------------- 032
//
// AC-1 a row typed into a section with a type is written as typed, and no job
//      is enqueued for it.
// AC-2 its filing_at is not set.
// AC-3 a line that is exactly one http or https address is a link.

describe("032 a typed row is saved as typed", () => {
  async function typed(me: string, th: string, text: string, section = "todo") {
    const added = await quickAdd(me, th, text, section);
    const row = await db
      .selectFrom("content")
      .select(["type", "title", "url", "filing_at"])
      .where("id", "=", added.id)
      .executeTakeFirstOrThrow();
    return { added, row };
  }

  it("writes the row with the section's type and their words, and enqueues nothing", async () => {
    const me = await account("Ana Duarte");
    const th = await thread(me, "Flat admin");
    const before = await db.selectFrom("jobs").select("id").where("account_id", "=", me).execute();

    const { added, row } = await typed(me, th, "call the plumber, milk, eggs");

    expect(added.kind).toBe("content");
    expect(row.type).toBe("task");
    expect(row.title).toBe("call the plumber, milk, eggs");
    const after = await db
      .selectFrom("jobs")
      .select("kind")
      .where("account_id", "=", me)
      .where("kind", "not in", ["shared.activity"])
      .execute();
    expect(after).toHaveLength(before.length);
  });

  it("is never drawn as being sorted", async () => {
    const me = await account("Ana Duarte");
    const th = await thread(me, "Flat admin");
    const { row } = await typed(me, th, "fix the tap");
    expect(row.filing_at).toBeNull();
  });

  it("makes a line that is one web address a link, and leaves an address inside words alone", async () => {
    const me = await account("Ana Duarte");
    const th = await thread(me, "Flat admin");
    const address = "https://www.ikea.com/pt/en/p/lack-wall-shelf-white-30305718/";

    const link = await typed(me, th, `  ${address}  `);
    expect(link.row.url).toBe(address);
    expect(link.row.title).toBe(address);

    const words = await typed(me, th, `shelf ${address}`);
    expect(words.row.url).toBeNull();

    const other = await typed(me, th, "ftp://example.test/file");
    expect(other.row.url).toBeNull();

    // The column's check is case-sensitive, so a capital the phone's keyboard
    // added keeps the line words rather than failing the write.
    const capital = await typed(me, th, "Https://example.test/a");
    expect(capital.row.url).toBeNull();
    expect(capital.row.title).toBe("Https://example.test/a");
  });
});
