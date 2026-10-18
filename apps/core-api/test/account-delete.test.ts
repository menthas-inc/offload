// 035. Deleting an account.
//
// AC-3  no row left for the account; what stays carries no author, and the
//       cost ledger carries no account.
// AC-4  a thread it was alone in dies; a shared one loses the member only.
// AC-7  calendar grants are revoked at Google, and retried without the account.
// AC-9  the last staff owner is refused.
// AC-14 the usage pseudonym goes, and unshipped events under it.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";
import { ACCOUNT_LEDGER } from "../src/accounts/ledger.js";
import { deleteAccount, LastOwner } from "../src/accounts/delete.js";
import { attemptHmac } from "../src/routes/waitlist.js";
import { open, seal } from "../src/connectors/vault.js";
import { handlers } from "../src/jobs/handlers.js";
import { makeSignature } from "better-auth/crypto";
import { env } from "../src/env.js";
import { buildApp, type App } from "../src/app.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { complete } from "../src/jobs/queue.js";
import { record } from "../src/notifications/activity.js";
import { notifyPerson } from "../src/notifications/people.js";
import { sweepPeople } from "../src/people/people.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3600_000) })
    .execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

beforeEach(async () => {
  await db.deleteFrom("pending_revocations").execute();
  await db.deleteFrom("llm_usage").execute();
  await db.deleteFrom("waitlist_attempts").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("notes").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_keys").execute();
  await db.deleteFrom("account_keys").execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("connections").execute();
  await db.deleteFrom("staff").execute();
  await db.deleteFrom("accounts").execute();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Person {
  id: string;
  email: string;
  defaultThreadId: string;
}

async function person(name: string): Promise<Person> {
  const email = `${uuidv7()}@example.test`;
  const outcome = await promote(email);
  if (outcome.status !== "invited") throw new Error(outcome.status);
  await db.updateTable("accounts").set({ state: "active", display_name: name }).where("id", "=", outcome.accountId).execute();
  const row = await db.selectFrom("accounts").select("default_thread_id").where("id", "=", outcome.accountId).executeTakeFirstOrThrow();
  return { id: outcome.accountId, email, defaultThreadId: row.default_thread_id! };
}

async function thread(name: string, ...members: string[]): Promise<string> {
  const row = await db.insertInto("threads").values({ name, created_by_account_id: members[0]! }).returning("id").executeTakeFirstOrThrow();
  for (const accountId of members) {
    await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state: "accepted" }).execute();
  }
  return row.id;
}

/** How many backends wait behind `holder`, directly or behind one that does.
 *  Scoped to the holder, so a waiter from anything else sharing the database
 *  cannot satisfy it. */
async function blockedBehind(holder: number): Promise<number> {
  const { rows } = await sql<{ n: string }>`
    with recursive behind(pid) as (
      select pid from pg_stat_activity where ${holder}::int = any(pg_blocking_pids(pid))
      union
      select a.pid from pg_stat_activity a join behind b on b.pid = any(pg_blocking_pids(a.pid))
    )
    select count(*) as n from behind`.execute(db);
  return Number(rows[0]!.n);
}

async function untilBlocked(holder: number, n: number): Promise<void> {
  for (let tries = 0; tries < 250 && (await blockedBehind(holder)) < n; tries += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  expect(await blockedBehind(holder)).toBe(n);
}

async function row(accountId: string, threadId: string, title: string): Promise<string> {
  const made = await db
    .insertInto("content")
    .values({ account_id: accountId, thread_id: threadId, type: "task", title, source: "person" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return made.id;
}

/** How many rows still name the account, per ledger column the database
 *  enforces. The ledger test proves the list is complete; this proves the
 *  delete honours it. */
async function stillNamed(accountId: string): Promise<string[]> {
  const left: string[] = [];
  for (const [column, entry] of Object.entries(ACCOUNT_LEDGER)) {
    if (entry.fate !== "cascade" && entry.fate !== "set-null") continue;
    const [table, name] = column.split(".") as [string, string];
    const found = await sql<{ n: string }>`
      select count(*) as n from ${sql.table(table)} where ${sql.ref(name)} = ${accountId}
    `.execute(db);
    if (Number(found.rows[0]!.n) > 0) left.push(column);
  }
  return left;
}

describe("deleting an account", () => {
  it("leaves no row that names it, and no account", async () => {
    const me = await person("Jo");
    const sam = await person("Sam");
    const shared = await thread("Flat", me.id, sam.id);
    await row(me.id, shared, "Bins on Tuesday");
    await row(me.id, me.defaultThreadId, "Passport");
    const conversation = await db.insertInto("conversations").values({ account_id: me.id }).returning("id").executeTakeFirstOrThrow();
    await db
      .insertInto("messages")
      .values({ conversation_id: conversation.id, account_id: me.id, role: "person", type: "text", text: "hello", turn_id: uuidv7() })
      .execute();
    await db.insertInto("connections").values({ account_a: me.id < sam.id ? me.id : sam.id, account_b: me.id < sam.id ? sam.id : me.id }).execute();
    await db.insertInto("llm_usage").values({ account_id: me.id, job_kind: "dump.answer", category: "interactive", model: "m" }).execute();

    await deleteAccount(me.id);

    expect(await db.selectFrom("accounts").select("id").where("id", "=", me.id).execute()).toHaveLength(0);
    expect(await stillNamed(me.id)).toEqual([]);
    // The other person is untouched.
    expect(await db.selectFrom("accounts").select("id").where("id", "=", sam.id).execute()).toHaveLength(1);
    // The cost row stays, without the account.
    const usage = await db.selectFrom("llm_usage").select("account_id").execute();
    expect(usage).toEqual([{ account_id: null }]);
  });

  it("deletes a thread it was alone in and leaves a shared one with what it added", async () => {
    const me = await person("Jo");
    const sam = await person("Sam");
    const shared = await thread("Flat", me.id, sam.id);
    const mine = await thread("Passport", me.id);
    const kept = await row(me.id, shared, "Bins on Tuesday");
    await row(me.id, mine, "Renew by March");
    await db.insertInto("notes").values({ account_id: me.id, scope: "thread", subject_id: mine, kind: "standing", text: "x", origin: "stated" }).execute();
    await db.insertInto("notes").values({ account_id: me.id, scope: "thread", subject_id: shared, kind: "standing", text: "y", origin: "stated" }).execute();
    await db.insertInto("notes").values({ account_id: me.id, scope: "account", subject_id: null, kind: "about", text: "z", origin: "stated" }).execute();

    await deleteAccount(me.id);

    expect(await db.selectFrom("threads").select("id").where("id", "in", [mine, me.defaultThreadId]).execute()).toHaveLength(0);
    expect(await db.selectFrom("content").select("id").where("thread_id", "=", mine).execute()).toHaveLength(0);
    const stays = await db.selectFrom("content").select(["id", "account_id"]).where("thread_id", "=", shared).execute();
    expect(stays).toEqual([{ id: kept, account_id: null }]);
    const members = await db.selectFrom("thread_members").select("account_id").where("thread_id", "=", shared).execute();
    expect(members).toEqual([{ account_id: sam.id }]);
    // The shared thread keeps its note with no author; the other two are gone.
    const notes = await db.selectFrom("notes").select(["text", "account_id"]).execute();
    expect(notes).toEqual([{ text: "y", account_id: null }]);
  });

  it("withdraws the shares it had waiting", async () => {
    const me = await person("Jo");
    const sam = await person("Sam");
    const ada = await person("Ada");
    const shared = await thread("Flat", me.id, sam.id);
    const mine = await thread("Passport", me.id);
    for (const threadId of [shared, mine]) {
      await db
        .insertInto("thread_members")
        .values({ thread_id: threadId, account_id: ada.id, state: "pending", invited_by: me.id, expires_at: sql`now() + interval '30 days'` })
        .execute();
    }

    await deleteAccount(me.id);

    // The one into the thread that died went with it. The other is withdrawn,
    // and the preview of the sharer's own titles goes with it.
    const left = await db.selectFrom("thread_members").select(["thread_id", "state", "invited_by", "preview"]).where("account_id", "=", ada.id).where("thread_id", "!=", ada.defaultThreadId).execute();
    expect(left).toEqual([{ thread_id: shared, state: "expired", invited_by: null, preview: null }]);
  });

  it("removes what no foreign key reaches: unshipped events, the limiter's record, account wraps", async () => {
    const me = await person("Jo");
    const sam = await person("Sam");
    const subject = async (id: string) =>
      (await db.selectFrom("accounts").select("analytics_subject_id").where("id", "=", id).executeTakeFirstOrThrow()).analytics_subject_id;
    const [mine, theirs] = [await subject(me.id), await subject(sam.id)];
    for (const subjectId of [mine, theirs]) {
      await db
        .insertInto("analytics_events")
        .values({ name: "dump_sent", occurred_at: new Date(), received_at: new Date(), subject_id: subjectId, source: "core-api", properties: "{}" })
        .execute();
    }
    const nowhere = Buffer.alloc(32);
    await db.insertInto("waitlist_attempts").values({ email_hmac: attemptHmac(me.email), ip_hmac: nowhere }).execute();
    await db.insertInto("waitlist_attempts").values({ email_hmac: attemptHmac(sam.email), ip_hmac: nowhere }).execute();

    await deleteAccount(me.id);

    expect((await db.selectFrom("analytics_events").select("subject_id").where("name", "=", "dump_sent").execute()).map((e) => e.subject_id)).toEqual([theirs]);
    expect(await db.selectFrom("waitlist_attempts").select("id").execute()).toHaveLength(1);
    // One event says an account was deleted, and names nobody.
    const said = await db.selectFrom("analytics_events").select(["subject_id", "properties"]).where("name", "=", "account_deleted").execute();
    expect(said).toHaveLength(1);
    expect(said[0]!.subject_id).toBeNull();
  });

  it("takes the digest rows that name it out of other people's Activity", async () => {
    const ana = await person("Ana");
    const ben = await person("Ben");
    const lisbon = await thread("Lisbon", ana.id, ben.id);
    // A digest carries no thread or person in its own columns, only mentions.
    const digest = await record(ben.id, {
      kind: "digest",
      sent: true,
      title: "Lisbon",
      body: "Ana: book flights",
      mentions: [{ threadId: lisbon, aboutAccountId: ana.id }],
    });
    const own = await record(ben.id, { kind: "digest", sent: true, title: "Lisbon", body: "Ben: pack", mentions: [{ threadId: lisbon, aboutAccountId: ben.id }] });

    await deleteAccount(ana.id);

    const left = await db.selectFrom("activity").select("id").where("account_id", "=", ben.id).execute();
    expect(left.map((one) => one.id)).not.toContain(digest);
    expect(left.map((one) => one.id)).toContain(own);
  });

  // FOR UPDATE locks rows, not a predicate. A request's notice names the
  // person only through the request, so one written after the purge has read
  // is a row it never saw, which the cascade's set-null would leave. The
  // delete holds the request, so the notice waits and then has nothing to
  // point at.
  it("takes a naming row written while the delete is running", async () => {
    const ana = await person("Ana");
    const ben = await person("Ben");
    const asked = await db.insertInto("connection_requests").values({ from_account_id: ana.id, to_account_id: ben.id }).returning("id").executeTakeFirstOrThrow();

    // The delete held at the limiter's table, after the purge.
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let locked!: (pid: number) => void;
    const isLocked = new Promise<number>((resolve) => (locked = resolve));
    const holding = db.transaction().execute(async (trx) => {
      const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx);
      await sql`lock table waitlist_attempts in exclusive mode`.execute(trx);
      locked(rows[0]!.pid);
      await released;
    });
    const holder = await isLocked;
    const deleting = deleteAccount(ana.id);
    await untilBlocked(holder, 1);

    // The notice, once it has written its row or is waiting behind the delete.
    let settled = false;
    const notifying = notifyPerson({ kind: "request", requestId: asked.id }).finally(() => (settled = true));
    notifying.catch(() => {});
    for (let tries = 0; tries < 250 && !settled && (await blockedBehind(holder)) < 2; tries += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled || (await blockedBehind(holder)) === 2).toBe(true);
    release();
    await holding;
    await deleting;
    await Promise.allSettled([notifying]);

    expect(await db.selectFrom("activity").select(["kind", "title"]).where("account_id", "=", ben.id).execute()).toEqual([]);
  });

  // A notice still being written when the purge reads is a row it cannot see.
  // Its foreign key check holds the request, so the delete has to wait for it
  // before reading, not after, or the cascade clears the link and leaves the
  // words.
  it("takes a naming row that was being written when the delete began", async () => {
    const ana = await person("Ana");
    const ben = await person("Ben");
    const asked = await db.insertInto("connection_requests").values({ from_account_id: ana.id, to_account_id: ben.id }).returning("id").executeTakeFirstOrThrow();

    let commit!: () => void;
    const committed = new Promise<void>((resolve) => (commit = resolve));
    let written!: (pid: number) => void;
    const isWritten = new Promise<number>((resolve) => (written = resolve));
    const writing = db.transaction().execute(async (trx) => {
      const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx);
      await record(ben.id, { kind: "request", sent: true, title: "Ana wants to connect", body: null, requestId: asked.id }, trx);
      written(rows[0]!.pid);
      await committed;
    });
    const writer = await isWritten;
    const deleting = deleteAccount(ana.id);
    await untilBlocked(writer, 1);
    commit();
    await writing;
    await deleting;

    expect(await db.selectFrom("activity").select(["kind", "title"]).where("account_id", "=", ben.id).execute()).toEqual([]);
  });

  // 035: every entry about them in other people's Activity goes. A row can
  // name somebody by its own column, by a mention, or only in its words, with
  // the link to them held by a request or a membership; this writes each kind
  // through the code that writes it in the product.
  it("leaves no row in anybody else's Activity that names it, whatever the kind", async () => {
    // Kinds that can name another person, and kinds that only ever name the
    // account's own rows. A new kind fails here until it is placed.
    const naming = ["digest", "request", "share", "shared_activity", "expired"];
    const ownOnly = ["moved", "acted", "labelled", "mail", "export", "reminder"];
    const check = await sql<{ def: string }>`
      select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'activity_kind_check'
    `.execute(db);
    const kinds = [...check.rows[0]!.def.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();
    expect(kinds).toEqual([...naming, ...ownOnly].sort());

    const ana = await person("Anouk");
    const ben = await person("Ben");
    const lisbon = await thread("Lisbon", ana.id);
    const porto = await thread("Porto", ben.id);

    // request: Anouk asks Ben, and Ben is told.
    const asked = await db.insertInto("connection_requests").values({ from_account_id: ana.id, to_account_id: ben.id }).returning("id").executeTakeFirstOrThrow();
    await notifyPerson({ kind: "request", requestId: asked.id });
    // share: Anouk shares Lisbon, Ben is told, and accepts.
    const invite = await db
      .insertInto("thread_members")
      .values({ thread_id: lisbon, account_id: ben.id, state: "pending", invited_by: ana.id, expires_at: sql`now() + interval '30 days'` })
      .returning("id")
      .executeTakeFirstOrThrow();
    await notifyPerson({ kind: "share", memberId: invite.id });
    await db.updateTable("thread_members").set({ state: "accepted", responded_at: sql`now()` }).where("id", "=", invite.id).execute();
    // expired: Ben's request to Anouk and his invite to Porto go unanswered.
    await db.insertInto("connection_requests").values({ from_account_id: ben.id, to_account_id: ana.id, expires_at: sql`now() - interval '1 minute'` }).execute();
    await db
      .insertInto("thread_members")
      .values({ thread_id: porto, account_id: ana.id, state: "pending", invited_by: ben.id, expires_at: sql`now() - interval '1 minute'` })
      .execute();
    await sweepPeople();
    // digest and shared_activity: what Anouk added, in Ben's record.
    await record(ben.id, { kind: "digest", sent: true, title: "Lisbon", body: "Anouk: book flights", mentions: [{ threadId: lisbon, aboutAccountId: ana.id }] });
    await record(ben.id, { kind: "shared_activity", sent: true, title: "Anouk added one to Lisbon", body: "Book flights", threadId: lisbon, aboutAccountId: ana.id });
    // Ben's own, which stays.
    const own = await record(ben.id, { kind: "digest", sent: true, title: "Lisbon", body: "Pack", mentions: [{ threadId: lisbon, aboutAccountId: ben.id }] });

    const written = await db.selectFrom("activity").select("kind").where("account_id", "=", ben.id).execute();
    expect(written.map((one) => one.kind).sort()).toEqual(["digest", "digest", "expired", "expired", "request", "share", "shared_activity"]);

    await deleteAccount(ana.id);

    const left = await db.selectFrom("activity").select(["id", "kind", "title", "body"]).execute();
    expect(left.filter((one) => `${one.title} ${one.body ?? ""}`.includes("Anouk"))).toEqual([]);
    expect(left.map((one) => one.id)).toEqual([own]);
  });

  // Two people who share no thread have no thread lock to put their deletes in
  // order. Each has a row in the other's Activity that its own delete takes,
  // and a row of its own that its cascade takes. Locked in one order, the
  // second waits; in two, Postgres aborts one of them. A row about the other
  // by its column alone is the one the owner's delete would reach only at the
  // cascade. (A request names both people, so both deletes reach it by name
  // and it orders them by itself.)
  it("deletes two people who name each other at the same time", async () => {
    const ana = await person("Anouk");
    const ben = await person("Ben");
    await record(ben.id, { kind: "shared_activity", sent: true, title: "Anouk added one", body: null, aboutAccountId: ana.id });
    await record(ana.id, { kind: "shared_activity", sent: true, title: "Ben added one", body: null, aboutAccountId: ben.id });

    // Both deletes held at a step after the Activity purge and before the
    // cascade, the limiter's table, so they meet there whatever the timing.
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let locked!: (pid: number) => void;
    const isLocked = new Promise<number>((resolve) => (locked = resolve));
    const holding = db.transaction().execute(async (trx) => {
      const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx);
      await sql`lock table waitlist_attempts in exclusive mode`.execute(trx);
      locked(rows[0]!.pid);
      await released;
    });
    const holder = await isLocked;
    const deleting = Promise.allSettled([deleteAccount(ana.id), deleteAccount(ben.id)]);
    // One waits at the table and the other, which names it, waits behind it.
    await untilBlocked(holder, 2);
    release();
    await holding;

    const outcomes = await deleting;
    expect(outcomes.map((one) => (one.status === "rejected" ? String(one.reason) : "deleted"))).toEqual(["deleted", "deleted"]);
    expect(await db.selectFrom("activity").select("id").execute()).toEqual([]);
  });

  it("refuses the last staff owner, and lets one of two go", async () => {
    const me = await person("Jo");
    const sam = await person("Sam");
    await db.insertInto("staff").values({ account_id: me.id, role: "owner", created_at: new Date() }).execute();
    await expect(deleteAccount(me.id)).rejects.toBeInstanceOf(LastOwner);
    expect(await db.selectFrom("accounts").select("id").where("id", "=", me.id).execute()).toHaveLength(1);

    await db.insertInto("staff").values({ account_id: sam.id, role: "owner", created_at: new Date() }).execute();
    await deleteAccount(me.id);
    expect(await db.selectFrom("accounts").select("id").where("id", "=", me.id).execute()).toHaveLength(0);
  });

  // A disabled owner cannot open the panel, so it is not somebody the panel
  // still has. The admin paths count it the same way.
  it("refuses the last working owner when the other owner is disabled", async () => {
    const me = await person("Jo");
    const sam = await person("Sam");
    await db.insertInto("staff").values({ account_id: me.id, role: "owner", created_at: new Date() }).execute();
    await db.insertInto("staff").values({ account_id: sam.id, role: "owner", created_at: new Date() }).execute();
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", sam.id).execute();
    await expect(deleteAccount(me.id)).rejects.toBeInstanceOf(LastOwner);
    expect(await db.selectFrom("accounts").select("id").where("id", "=", me.id).execute()).toHaveLength(1);

    // And the disabled one can still go while a working owner stays.
    await expect(deleteAccount(sam.id)).resolves.toMatchObject({ deleted: true });
  });

  // The scheduled delete reads the mark before it calls this, unlocked, so a
  // cancel can land in between. The mark is read again under the lock.
  it("deletes nothing when asked to delete only a marked account and the mark was cleared", async () => {
    const me = await person("Jo");
    await db.updateTable("accounts").set({ delete_after: sql`now() - interval '1 minute'` }).where("id", "=", me.id).execute();
    await db.updateTable("accounts").set({ delete_after: null }).where("id", "=", me.id).execute();
    await expect(deleteAccount(me.id, { onlyIfMarked: true })).resolves.toEqual({ deleted: false, email: null });
    expect(await db.selectFrom("accounts").select("id").where("id", "=", me.id).execute()).toHaveLength(1);
  });

  it("deletes a marked account whose time has come when asked to delete only a marked one", async () => {
    const me = await person("Jo");
    await db.updateTable("accounts").set({ delete_after: sql`now() - interval '1 minute'` }).where("id", "=", me.id).execute();
    await expect(deleteAccount(me.id, { onlyIfMarked: true })).resolves.toMatchObject({ deleted: true });
  });

  // The decision "nobody else is in it" is only good while the thread is
  // locked: accepting a share locks the thread row, so the delete has to as
  // well, or it deletes a thread somebody joined while it was deciding.
  it("keeps a thread somebody joins while the delete is running", async () => {
    const me = await person("Jo");
    const sam = await person("Sam");
    const mine = await thread("Lisbon", me.id);
    await row(me.id, mine, "Book the flat");

    let joined!: () => void;
    const hold = new Promise<void>((resolve) => (joined = resolve));
    const accepting = db.transaction().execute(async (trx) => {
      await trx.selectFrom("threads").select("id").where("id", "=", mine).forUpdate().execute();
      await trx.insertInto("thread_members").values({ thread_id: mine, account_id: sam.id, state: "accepted" }).execute();
      await hold;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const deleting = deleteAccount(me.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    joined();
    await accepting;
    await deleting;

    expect(await db.selectFrom("threads").select("id").where("id", "=", mine).execute()).toHaveLength(1);
    expect(await db.selectFrom("content").select("id").where("thread_id", "=", mine).execute()).toHaveLength(1);
    expect(await db.selectFrom("accounts").select("id").where("id", "=", me.id).execute()).toHaveLength(0);
  });

  // Key state the person cannot see or mend may not make their account
  // undeletable. A copy that will not open hands nothing on, and the rest goes.
  it("still deletes when a thread key it holds will not open", async () => {
    const me = await person("Jo");
    const sam = await person("Sam");
    const shared = await thread("Lisbon", me.id, sam.id);
    await db.insertInto("thread_keys").values({ thread_id: shared, account_id: me.id, wrapped_tk: Buffer.from("not a wrapped key") }).execute();
    await expect(deleteAccount(me.id)).resolves.toMatchObject({ deleted: true });
    expect(await db.selectFrom("accounts").select("id").where("id", "=", me.id).execute()).toHaveLength(0);
  });

  it("leaves every other thread's wraps alone", async () => {
    const me = await person("Jo");
    const sam = await person("Sam");
    const blob = await db
      .insertInto("blobs")
      .values({ account_id: sam.id, message_id: null, client_key: uuidv7(), name: null, content_type: "image/jpeg", byte_size: 1, width: 1, height: 1, sha256: Buffer.alloc(32) } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    // A wrap written ahead of the row that will carry it, in a thread that is not mine.
    await db.insertInto("blob_keys").values({ blob_id: blob.id, scope: "thread", scope_id: sam.defaultThreadId, wrapped_object_key: Buffer.alloc(60) }).execute();
    await deleteAccount(me.id);
    expect(await db.selectFrom("blob_keys").select("blob_id").where("scope_id", "=", sam.defaultThreadId).execute()).toHaveLength(1);
  });

  it("never lets two owners both go at once", async () => {
    const me = await person("Jo");
    const sam = await person("Sam");
    await db.insertInto("staff").values({ account_id: me.id, role: "owner", created_at: new Date() }).execute();
    await db.insertInto("staff").values({ account_id: sam.id, role: "owner", created_at: new Date() }).execute();
    const outcomes = await Promise.allSettled([deleteAccount(me.id), deleteAccount(sam.id)]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(await db.selectFrom("staff").select("account_id").where("role", "=", "owner").execute()).toHaveLength(1);
  });

  it("is nothing for an account that is not there", async () => {
    await expect(deleteAccount(uuidv7())).resolves.toEqual({ deleted: false, email: null });
  });
});

describe("the calendar grant", () => {
  async function connected(accountId: string, token: string): Promise<string> {
    const connection = await db
      .insertInto("connector_connections")
      .values({ account_id: accountId, provider: "google", external_account_email: `${uuidv7()}@g.com` })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("connector_secrets")
      .values({
        connection_id: connection.id,
        access_token: seal("access", connection.id, "access_token"),
        refresh_token: seal(token, connection.id, "refresh_token"),
        access_expires_at: null,
        scope: null,
        wrapped_by: "test",
      })
      .execute();
    return connection.id;
  }

  it("is held, sealed and nameless, until Google has taken it back", async () => {
    const me = await person("Jo");
    await connected(me.id, "refresh-123");
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: URLSearchParams }) => {
      asked.push(init.body.get("token")!);
      return new Response("", { status: 503 });
    });

    await deleteAccount(me.id);

    const held = await db.selectFrom("pending_revocations").selectAll().execute();
    expect(held).toHaveLength(1);
    expect(Buffer.from(held[0]!.sealed_token).includes(Buffer.from("refresh-123"))).toBe(false);
    expect(open(Buffer.from(held[0]!.sealed_token), held[0]!.id, "refresh_token")).toBe("refresh-123");
    expect(await db.selectFrom("connector_secrets").select("connection_id").execute()).toHaveLength(0);
    const job = await db.selectFrom("jobs").select(["account_id", "payload"]).where("kind", "=", "connector.revoke").executeTakeFirstOrThrow();
    expect(job.account_id).toBeNull();
    expect(JSON.stringify(job.payload)).not.toContain("refresh-123");

    // Google is down: the row waits and the job books itself again.
    await db.deleteFrom("jobs").execute();
    await handlers["connector.revoke"]!({}, { mailer: null as never }, null);
    expect(asked).toEqual(["refresh-123"]);
    expect((await db.selectFrom("pending_revocations").select("attempts").executeTakeFirstOrThrow()).attempts).toBe(1);
    expect(await db.selectFrom("jobs").select("id").where("kind", "=", "connector.revoke").execute()).toHaveLength(1);

    // Google answers: the row goes and nothing is booked.
    await db.deleteFrom("jobs").execute();
    vi.stubGlobal("fetch", async () => new Response("", { status: 200 }));
    await handlers["connector.revoke"]!({}, { mailer: null as never }, null);
    expect(await db.selectFrom("pending_revocations").select("id").execute()).toHaveLength(0);
    expect(await db.selectFrom("jobs").select("id").where("kind", "=", "connector.revoke").execute()).toHaveLength(0);
  });

  it("does not let one token it cannot open hold up the rest, and marks it rather than trying it again", async () => {
    const bad = uuidv7();
    const good = uuidv7();
    await db.insertInto("pending_revocations").values({ id: bad, provider: "google", sealed_token: Buffer.from("not a sealed token") }).execute();
    await db.insertInto("pending_revocations").values({ id: good, provider: "google", sealed_token: seal("fine", good, "refresh_token") }).execute();
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: URLSearchParams }) => {
      asked.push(init.body.get("token")!);
      return new Response("", { status: 200 });
    });
    await handlers["connector.revoke"]!({}, { mailer: null as never }, null);
    expect(asked).toEqual(["fine"]);
    const left = await db.selectFrom("pending_revocations").select(["id", "attempts", "unopenable_at"]).execute();
    expect(left).toMatchObject([{ id: bad, attempts: 0, unopenable_at: expect.any(Date) }]);
    // Marked, it books no hourly retry of its own.
    expect(await db.selectFrom("jobs").select("id").where("kind", "=", "connector.revoke").execute()).toHaveLength(0);
  });

  it("does not stop the account going when it no longer opens, and keeps the grant marked for a revoke by hand", async () => {
    // S27. A rotated vault key: the grant is live at Google and the row says so.
    const me = await person("Jo");
    const id = await connected(me.id, "refresh-123");
    // Sealed under a key the vault no longer holds.
    await db
      .updateTable("connector_secrets")
      .set({ access_token: Buffer.from("x".repeat(48)), refresh_token: Buffer.from("y".repeat(48)) })
      .where("connection_id", "=", id)
      .execute();

    await expect(deleteAccount(me.id)).resolves.toMatchObject({ deleted: true });
    const kept = await db.selectFrom("pending_revocations").selectAll().execute();
    expect(kept).toMatchObject([{ id, provider: "google", attempts: 0, unopenable_at: expect.any(Date) }]);
    // As it was sealed, so whoever holds the old key can open it.
    expect(Buffer.from(kept[0]!.sealed_token).toString()).toBe("y".repeat(48));
    expect(await db.selectFrom("accounts").select("id").where("id", "=", me.id).execute()).toEqual([]);

    const asked: string[] = [];
    vi.stubGlobal("fetch", async () => {
      asked.push("google");
      return new Response("", { status: 200 });
    });
    await handlers["connector.revoke"]!({}, { mailer: null as never }, null);
    expect(asked).toEqual([]);
    expect(await db.selectFrom("pending_revocations").select("attempts").execute()).toEqual([{ attempts: 0 }]);
  });

  it("is given up on after seven days", async () => {
    const id = uuidv7();
    await db
      .insertInto("pending_revocations")
      .values({ id, provider: "google", sealed_token: seal("old", id, "refresh_token"), created_at: sql`now() - interval '8 days'` })
      .execute();
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    await handlers["connector.revoke"]!({}, { mailer: null as never }, null);
    expect(await db.selectFrom("pending_revocations").select("id").execute()).toHaveLength(0);
  });
});

describe("DELETE /api/me", () => {
  const send = (cookie: string | null, body: unknown, headers: Record<string, string> = {}) =>
    app.inject({
      method: "DELETE",
      url: "/api/me",
      headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json", ...headers },
      payload: JSON.stringify(body),
    });

  it("needs a session, the word, and its own origin", async () => {
    const me = await person("Jo");
    const cookie = await signIn(me.id);
    expect((await send(null, { confirm: "delete" })).statusCode).toBe(401);
    expect((await send(cookie, { confirm: "remove" })).statusCode).toBe(400);
    expect((await send(cookie, {})).statusCode).toBe(400);
    expect((await send(cookie, { confirm: "delete" }, { origin: "https://evil.example" })).statusCode).toBe(403);
    // A form post is not JSON, and never reaches the handler.
    const form = await app.inject({
      method: "DELETE",
      url: "/api/me",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      payload: "confirm=delete",
    });
    expect(form.statusCode).toBeGreaterThanOrEqual(400);
    expect(await db.selectFrom("accounts").select("id").where("id", "=", me.id).execute()).toHaveLength(1);
  });

  it("deletes on the word, whatever its case, and every session dies with it", async () => {
    const me = await person("Jo");
    const here = await signIn(me.id);
    const elsewhere = await signIn(me.id);
    const answer = await send(here, { confirm: " Delete " }, { origin: env.WEB_URL });
    expect(answer.statusCode).toBe(204);
    expect(await db.selectFrom("accounts").select("id").where("id", "=", me.id).execute()).toHaveLength(0);
    for (const cookie of [here, elsewhere]) {
      expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).statusCode).toBe(401);
    }
    // The same address is a stranger afterwards.
    expect(await db.selectFrom("accounts").select("id").where("email", "=", me.email).execute()).toHaveLength(0);
    expect(await db.selectFrom("account_identities").select("id").where("account_id", "=", me.id).execute()).toHaveLength(0);
  });

  it("is open to an account still in first run", async () => {
    const me = await person("Jo");
    await db.updateTable("accounts").set({ state: "invited" }).where("id", "=", me.id).execute();
    expect((await send(await signIn(me.id), { confirm: "delete" })).statusCode).toBe(204);
  });

  it("tells the last staff owner no, and deletes nothing", async () => {
    const me = await person("Jo");
    await db.insertInto("staff").values({ account_id: me.id, role: "owner", created_at: new Date() }).execute();
    const answer = await send(await signIn(me.id), { confirm: "delete" });
    expect(answer.statusCode).toBe(409);
    expect(answer.json()).toEqual({ error: "last_owner" });
    expect(await db.selectFrom("accounts").select("id").where("id", "=", me.id).execute()).toHaveLength(1);
  });

  it("sends one notice to the address, from a job that names no account, and nothing else", async () => {
    const me = await person("Jo");
    const cookie = await signIn(me.id);
    const session = await db.selectFrom("sessions").select("id").where("account_id", "=", me.id).executeTakeFirstOrThrow();
    await db.insertInto("push_tokens").values({ account_id: me.id, session_id: session.id, token: "ExponentPushToken[x]", platform: "ios" }).execute();
    await db.deleteFrom("jobs").execute();
    expect((await send(cookie, { confirm: "delete" })).statusCode).toBe(204);

    const jobs = await db.selectFrom("jobs").select(["kind", "account_id", "payload"]).execute();
    expect(jobs.map((job) => job.kind)).toEqual(["email.account_deleted"]);
    expect(jobs[0]!.account_id).toBeNull();
    // The address is sealed while the job waits, and gone once it has sent:
    // a job row outlives its work by thirty days, and an address may not.
    expect(JSON.stringify(jobs[0]!.payload)).not.toContain(me.email);
    const mailer = new MemoryMailer();
    await handlers["email.account_deleted"]!(jobs[0]!.payload as Record<string, unknown>, { mailer }, null);
    expect(mailer.sent.map((message) => message.to)).toEqual([me.email]);
    expect((await db.selectFrom("jobs").select("payload").where("kind", "=", "email.account_deleted").executeTakeFirstOrThrow()).payload).toEqual({});
    expect(mailer.sent[0]!.subject).toBe("Your offload account is deleted");
    // When, so its owner can tell their own delete from somebody else's: the
    // day and the minute in the account's own zone, which the test account
    // has none of, so UTC.
    expect(mailer.sent[0]!.slots.body).toMatch(/^Your account was deleted on \d{1,2} \w+ \d{4} at \d{2}:\d{2} UTC\. /);
    expect(mailer.sent[0]!.slots.body).not.toMatch(/[\u2013\u2014]/);
    expect(await db.selectFrom("push_tokens").select("id").execute()).toHaveLength(0);
  });

  it("lets work already running finish into nothing", async () => {
    const me = await person("Jo");
    const job = await db
      .insertInto("jobs")
      .values({ kind: "dump.answer", account_id: me.id, payload: "{}", state: "running", priority: 10, run_after: new Date() })
      .returning("id")
      .executeTakeFirstOrThrow();
    await deleteAccount(me.id);
    expect(await db.selectFrom("jobs").select("id").where("id", "=", job.id).execute()).toHaveLength(0);
    await expect(complete(job.id)).resolves.toBeUndefined();
  });
});
