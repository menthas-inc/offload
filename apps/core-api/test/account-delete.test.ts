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
    await db.insertInto("notes").values({ account_id: me.id, scope: "account", subject_id: null, kind: "preference", text: "z", origin: "stated" }).execute();

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

  it("does not let one token it cannot open hold up the rest", async () => {
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
    const left = await db.selectFrom("pending_revocations").select(["id", "attempts"]).execute();
    expect(left).toEqual([{ id: bad, attempts: 1 }]);
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
    await db.insertInto("push_tokens").values({ account_id: me.id, token: "ExponentPushToken[x]", platform: "ios" }).execute();
    await db.deleteFrom("jobs").execute();
    expect((await send(await signIn(me.id), { confirm: "delete" })).statusCode).toBe(204);

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
