// AC-3. Who may reach the admin panel.
//
// Sessions here are real ones: a row in `sessions` plus a cookie signed with
// the same HMAC Better Auth signs its own with. A test that stubs the session
// check would be testing the stub, and this route set is the one place where
// getting authorization wrong exposes every account's address at once.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { env } from "../src/env.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";

await migrate(() => {});

let app: App;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("thread_keys").execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("account_keys").execute();
  await db.deleteFrom("staff").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("account_identities").execute();
  await db.deleteFrom("accounts").execute();
});

/** A session the API will accept, signed the way Better Auth signs one. */
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

  // The same name and the same HMAC Better Auth uses, so this cookie is
  // indistinguishable from one it issued itself.
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

async function activeAccount(email: string): Promise<string> {
  const promoted = await promote(email);
  await db
    .updateTable("accounts")
    .set({ state: "active" })
    .where("id", "=", promoted.accountId)
    .execute();
  return promoted.accountId;
}

describe("AC-3 the admin API", () => {
  it("is invisible without a session", async () => {
    for (const url of ["/v1/admin/me", "/v1/admin/waitlist"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(404);
    }
  });

  it("is invisible to a signed-in account that is not staff", async () => {
    const id = await activeAccount("ordinary@example.test");
    const cookie = await signIn(id);

    // 404, not 403. The panel does not confirm its own existence to someone
    // signed in who has no business knowing it is there, which is the same
    // rule the design states for owner-only pages: support does not see them
    // refused, it does not see them.
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/waitlist",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it("opens for staff", async () => {
    const id = await activeAccount("support@example.test");
    await db.insertInto("staff").values({ account_id: id, role: "support" }).execute();
    const cookie = await signIn(id);

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/me",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ role: "support" });
  });

  it("closes again the moment that account is disabled", async () => {
    const id = await activeAccount("revoked@example.test");
    await db.insertInto("staff").values({ account_id: id, role: "owner" }).execute();
    const cookie = await signIn(id);

    expect((await app.inject({ method: "GET", url: "/v1/admin/me", headers: { cookie } })).statusCode).toBe(200);

    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", id).execute();

    // The staff row is still there. Revoking admin has to be one action, not
    // "disable the account and remember the second table".
    expect((await app.inject({ method: "GET", url: "/v1/admin/me", headers: { cookie } })).statusCode).toBe(404);
  });

  it("refuses an owner-only page to support", async () => {
    const id = await activeAccount("support2@example.test");
    await db.insertInto("staff").values({ account_id: id, role: "support" }).execute();
    const cookie = await signIn(id);

    // No owner-only route exists yet, so this asserts the middleware itself
    // rather than a page: requireStaff("owner") must turn support away.
    const { requireStaff } = await import("../src/admin/staff.js");
    const guard = requireStaff("owner");

    let status = 200;
    const reply = {
      status(code: number) {
        status = code;
        return reply;
      },
      async send() {},
    };
    await guard({ headers: { cookie } } as any, reply as any);
    expect(status).toBe(404);
  });
});

describe("the waitlist page's data", () => {
  async function staffCookie(): Promise<string> {
    const id = await activeAccount("boss@example.test");
    await db.insertInto("staff").values({ account_id: id, role: "owner" }).execute();
    return signIn(id);
  }

  it("returns one list carrying the state, not a tab split", async () => {
    const cookie = await staffCookie();
    await db
      .insertInto("accounts")
      .values([
        { email: "w1@example.test", state: "waitlist" },
        { email: "w2@example.test", state: "waitlist" },
      ])
      .execute();
    await promote("i1@example.test");

    const all = await app.inject({ method: "GET", url: "/v1/admin/waitlist", headers: { cookie } });
    const rows = all.json().rows as Array<{ email: string; state: string; note: string | null; source: string }>;

    const byEmail = Object.fromEntries(rows.map((r) => [r.email, r]));
    expect(byEmail["w1@example.test"]?.state).toBe("waiting");
    expect(byEmail["i1@example.test"]?.state).toBe("invited");
    // The line under the address, which is the only thing on this page an
    // admin can act on.
    expect(byEmail["i1@example.test"]?.note).toMatch(/not accepted|email not sent/);
    expect(byEmail["w1@example.test"]?.note).toBeNull();
    expect(byEmail["w1@example.test"]?.source).toBe("waitlist");
  });

  it("searches by part of an address, because support rarely has all of it", async () => {
    const cookie = await staffCookie();
    await db
      .insertInto("accounts")
      .values([
        { email: "ana.romero@example.test", state: "waitlist" },
        { email: "bruno@example.test", state: "waitlist" },
      ])
      .execute();

    const found = await app.inject({
      method: "GET",
      url: "/v1/admin/waitlist?q=ROME",
      headers: { cookie },
    });
    const emails = found.json().rows.map((r: { email: string }) => r.email);
    expect(emails).toContain("ana.romero@example.test");
    expect(emails).not.toContain("bruno@example.test");
  });

  it("invites the oldest N still waiting, chosen by the server", async () => {
    const cookie = await staffCookie();
    // Distinct timestamps, because a real waitlist accumulates over days. A
    // bulk insert shares one transaction timestamp, which makes "oldest" a
    // coin toss and would test nothing.
    for (let i = 0; i < 6; i++) {
      await db
        .insertInto("accounts")
        .values({
          email: `q${i}@example.test`,
          state: "waitlist",
          created_at: new Date(Date.UTC(2026, 0, 1 + i)),
        })
        .execute();
    }

    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/waitlist/invite-next",
      headers: { cookie },
      payload: { count: 4 },
    });
    expect(response.json().results).toHaveLength(4);

    const stillWaiting = await db
      .selectFrom("accounts")
      .select("email")
      .where("state", "=", "waitlist")
      .execute();
    // The two youngest are still waiting, so it took the oldest four rather
    // than an arbitrary four.
    expect(stillWaiting.map((r) => r.email).sort()).toEqual(["q4@example.test", "q5@example.test"]);
  });

  it("resends the invite email, which the original claim would otherwise block", async () => {
    const cookie = await staffCookie();
    const promoted = await promote("resend@example.test");

    // Pretend the first send happened.
    await db
      .updateTable("accounts")
      .set({ invite_email_sent_at: new Date() })
      .where("id", "=", promoted.accountId)
      .execute();
    await db.deleteFrom("jobs").execute();

    const response = await app.inject({
      method: "POST",
      url: `/v1/admin/waitlist/${promoted.accountId}/resend`,
      headers: { cookie },
    });
    expect(response.json()).toEqual({ status: "queued" });

    const account = await db
      .selectFrom("accounts")
      .select("invite_email_sent_at")
      .where("id", "=", promoted.accountId)
      .executeTakeFirstOrThrow();
    // The claim is released, or the handler would find nothing to send.
    expect(account.invite_email_sent_at).toBeNull();
    expect(await db.selectFrom("jobs").selectAll().execute()).toHaveLength(1);
  });

  it("refuses to resend to someone who was never invited", async () => {
    const cookie = await staffCookie();
    const { id } = await db
      .insertInto("accounts")
      .values({ email: "waiting@example.test", state: "waitlist" })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    // Creating the staff account promoted it, which queued an invite of its
    // own. Clear it so the assertion is about this request.
    await db.deleteFrom("jobs").execute();

    const response = await app.inject({
      method: "POST",
      url: `/v1/admin/waitlist/${id}/resend`,
      headers: { cookie },
    });
    expect(response.json()).toEqual({ status: "not-invited" });
    expect(await db.selectFrom("jobs").selectAll().execute()).toHaveLength(0);
  });

  it("pages with a cursor rather than an offset", async () => {
    const cookie = await staffCookie();
    await db
      .insertInto("accounts")
      .values(
        Array.from({ length: 5 }, (_, i) => ({ email: `p${i}@example.test`, state: "waitlist" as const }))
      )
      .execute();

    const first = await app.inject({
      method: "GET",
      url: "/v1/admin/waitlist?state=waiting&limit=2",
      headers: { cookie },
    });
    expect(first.json().rows).toHaveLength(2);
    expect(first.json().nextCursor).toBeTruthy();

    const second = await app.inject({
      method: "GET",
      url: `/v1/admin/waitlist?state=waiting&limit=2&cursor=${encodeURIComponent(first.json().nextCursor)}`,
      headers: { cookie },
    });

    // No overlap and no gap, which an offset cannot promise on a set that
    // grows while it is being read.
    const firstIds = first.json().rows.map((r: { id: string }) => r.id);
    const secondIds = second.json().rows.map((r: { id: string }) => r.id);
    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
  });

  it("promotes a batch, and says what actually happened", async () => {
    const cookie = await staffCookie();
    const rows = await db
      .insertInto("accounts")
      .values([
        { email: "b1@example.test", state: "waitlist" },
        { email: "b2@example.test", state: "waitlist" },
      ])
      .returning(["id"])
      .execute();

    const ids = rows.map((r) => r.id);
    const first = await app.inject({
      method: "POST",
      url: "/v1/admin/waitlist/invite",
      headers: { cookie },
      payload: { ids },
    });
    expect(first.json().results.map((r: { status: string }) => r.status)).toEqual([
      "invited",
      "invited",
    ]);

    // Again. Idempotent, and honest about it: already-in is not counted as a
    // success, because no second email went out.
    const second = await app.inject({
      method: "POST",
      url: "/v1/admin/waitlist/invite",
      headers: { cookie },
      payload: { ids },
    });
    expect(second.json().results.every((r: { status: string }) => r.status === "already-in")).toBe(true);
  });
});
