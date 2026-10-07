// 034 AC-4 and AC-5. No admin output contains content, and none contains a
// credential.
//
// The panel shows who somebody is, how much they use offload, what it cost
// and what failed, and nothing they put in or offload wrote. That is a
// promise the privacy page makes in public, so it is held the blunt way: an
// account is seeded with a mark in every column the impl-spec rules out and a
// token in every credential column, **every registered admin GET is called**
// as an owner, and neither may come back.
//
// The routes come from the route table, so a section's new route is walked by
// being registered. Its `:id` is filled with the seeded account's id, and a
// job's with the seeded dead job's, so the route answers about the account
// that carries the marks rather than about nobody.
//
// Writes are walked from the same table. Each one is listed below with the
// body it is sent and the answer it should give, run once against the marked
// account, and its response held to the same check. **A write route that is
// registered and not listed fails the test**, until it is given a row or an
// exemption with its reason. Then the CSV is built, every alert is rendered,
// every audit row is read, and every GET is walked again over what the
// writes left behind.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App, type RouteEntry } from "../src/app.js";
import { sql } from "kysely";
import { SCHEDULED } from "../src/jobs/schedule.js";
import { SERVICES } from "../src/health/services.js";
import { STAFF_ALERTS, renderAlert, type AlertPayload } from "../src/health/mail.js";
import { adminRoutesOf, fill, staffMember, wipeAdmin } from "./admin-kit.js";
import { MARK, TOKEN, leaks, seedMarked, wipeMarked, type Marked } from "./admin-off1-kit.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await wipeMarked();
  await wipeAdmin();
  await app.close();
  await closeDb();
});
beforeEach(async () => {
  await wipeMarked();
  await wipeAdmin();
});

/** Which seeded id a route's `:id` means, by where the route lives. */
function paramsFor(route: RouteEntry, marked: Marked): Record<string, string> {
  if (route.url.startsWith("/v1/admin/jobs/")) return { ...marked.params, id: marked.jobId };
  return marked.params;
}

/** The ranges and filters a page may ask for, so a route that reads a range
 *  is walked across all of it. A route that takes none ignores them or
 *  refuses them, and a refusal carries nothing either. */
const QUERIES = ["", "?range=24h", "?range=90d", "?state=all&limit=100", "?q=example", `?q=${MARK}`, "?dim=job&range=30d", "?failed=true", "?months=12"];

describe("the fixture", () => {
  it("puts the mark where the panel may not look", async () => {
    const marked = await seedMarked();
    const thread = await db.selectFrom("threads").select("name").where("id", "=", marked.threadId).executeTakeFirstOrThrow();
    expect(thread.name).toBe(MARK);
    const job = await db.selectFrom("jobs").select(["payload", "last_error", "error_code"]).where("id", "=", marked.jobId).executeTakeFirstOrThrow();
    expect(JSON.stringify(job.payload)).toContain(MARK);
    expect(job.last_error).toBe(MARK);
    const session = await db.selectFrom("sessions").select("token").where("account_id", "=", marked.accountId).executeTakeFirstOrThrow();
    expect(session.token).toBe(TOKEN);
    // The transcription vendor's reference for a file is a credential to it.
    const blob = await db.selectFrom("blobs").select("provider_ref").where("account_id", "=", marked.accountId).executeTakeFirstOrThrow();
    expect(blob.provider_ref).toBe(TOKEN);
    // A job that finished, with a code and text left on it from an attempt.
    const done = await db.selectFrom("jobs").select(["last_error", "error_code", "payload"]).where("state", "=", "done").where("account_id", "=", marked.accountId).executeTakeFirstOrThrow();
    expect(done).toMatchObject({ last_error: MARK, error_code: "model_error" });
    expect(JSON.stringify(done.payload)).toContain(MARK);
  });

  it("gives Health something to answer with: an outage, a backup, an hour of history", async () => {
    await seedMarked();
    const owner = await staffMember("owner");
    const read = async (path: string) => (await app.inject({ method: "GET", url: `/v1/admin/health/${path}`, headers: { cookie: owner.cookie } })).json();
    expect((await read("incidents?range=24h")).incidents.length).toBeGreaterThan(0);
    expect((await read("backups")).last).toMatchObject({ ok: true, bytes: 4096 });
    const queue = await read("queue?range=24h");
    expect(queue.historyStarts).not.toBeNull();
    expect(queue.points.some((point: { finished: number; failed: number; dead: number }) => point.finished > 0 && point.failed > 0 && point.dead > 0)).toBe(true);
    const vendors = (await read("vendors?range=24h")).vendors as Array<{ recorded: boolean; calls: number | null }>;
    expect(vendors.length).toBeGreaterThan(0);
    for (const vendor of vendors) expect(vendor, JSON.stringify(vendor)).toMatchObject({ recorded: true });
  });

  it("is found by the check when it does leak, in any spelling", async () => {
    const marked = await seedMarked();
    expect(leaks(JSON.stringify({ name: MARK }), marked)).toEqual(["the content mark"]);
    expect(leaks(Buffer.from(TOKEN).toString("base64"), marked)).toEqual(["the credential mark in base64"]);
    expect(leaks(`\\x${Buffer.from(TOKEN).toString("hex")}`, marked)).toEqual(["the credential mark in hex"]);
    expect(leaks(JSON.stringify({ lat: 38.7113917, at: "1987-06-05T04:03:02.000Z", subject: marked.subjectId }), marked)).toHaveLength(3);
    expect(leaks(JSON.stringify({ email: "jo@example.test", threads: 3, error: "model_error" }), marked)).toEqual([]);
  });
});

/** Every registered admin GET, across every query, as an owner. */
async function walkReads(cookie: string, marked: Marked): Promise<void> {
  const reads = adminRoutesOf(app).filter((route) => route.method === "GET");
  expect(reads.map((route) => route.url)).toContain("/v1/admin/waitlist");

  for (const route of reads) {
    let answered = 0;
    for (const query of QUERIES) {
      const url = `${fill(route.url, paramsFor(route, marked))}${query}`;
      const response = await app.inject({ method: "GET", url, headers: { cookie } });
      // An owner is never turned away by the guard, so a 404 here is a
      // route saying it has nothing, and a 500 is a broken route.
      expect(response.statusCode, `${route.url}${query}`).toBeLessThan(500);
      if (response.statusCode === 200) answered += 1;
      expect(leaks(response.payload, marked), `${route.url}${query}`).toEqual([]);
      expect(leaks(JSON.stringify(response.headers), marked), `${route.url}${query} headers`).toEqual([]);
    }
    // Each route gave a real answer about the marked account at least once,
    // or walking it proved nothing.
    expect(answered, route.url).toBeGreaterThan(0);
  }
}

describe("AC-4 and AC-5 every admin read", () => {
  it("returns no content and no credential, whatever it is asked", async () => {
    const marked = await seedMarked();
    const owner = await staffMember("owner");
    await walkReads(owner.cookie, marked);
  });

  it("lists the marked account on People, so the walk reaches a person's routes", async () => {
    const marked = await seedMarked();
    const owner = await staffMember("owner");
    const res = await app.inject({ method: "GET", url: `/v1/admin/people/${marked.accountId}`, headers: { cookie: owner.cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Jo Alves");
  });

  it("names the seeded account on the waitlist by its address and nothing else of it", async () => {
    // All the panel does show about a person: who they are.
    const marked = await seedMarked();
    const owner = await staffMember("owner");
    const res = await app.inject({ method: "GET", url: "/v1/admin/waitlist?limit=100", headers: { cookie: owner.cookie } });
    const row = (res.json().rows as Array<Record<string, unknown>>).find((one) => one["id"] === marked.accountId);
    expect(row).toBeDefined();
    expect(Object.keys(row!).sort()).toEqual(["email", "id", "joined", "note", "source", "state"]);
  });
});

// ------------------------------------------------------------------ writes

interface Ctx {
  marked: Marked;
  /** The marked account's address: who they are, which the panel may show. */
  email: string;
}

interface Write {
  /** `METHOD /v1/admin/...`, as the route table names it. */
  route: string;
  body?: (ctx: Ctx) => unknown;
  /** What the answer holds, so each write is known to have done its work
   *  and not only to have been refused quietly. A write whose answer is a
   *  file says its first line instead. */
  says: Record<string, unknown> | { csv: string };
}

/** Every write the panel has, once, in an order each can run in: disable
 *  before enable, set before clear, dismiss before the retry that takes the
 *  job off the dead list, added to staff before the role and the removal.
 *  All of it against the marked account, and none of it destroys anything:
 *  the waitlist's removals only ever touch somebody still waiting. */
const WRITES: Write[] = [
  { route: "POST /v1/admin/session", says: { status: "open" } },
  { route: "POST /v1/admin/people/:id/viewed", says: { status: "recorded" } },
  { route: "POST /v1/admin/people/:id/sign-out", says: { status: "signed-out", sessions: 1 } },
  { route: "POST /v1/admin/people/:id/disable", says: { status: "disabled" } },
  { route: "POST /v1/admin/people/:id/enable", says: { status: "active" } },
  // Marked and cancelled inside the hold, which destroys nothing; cancel
  // leaves it disabled, so it is enabled again for what follows.
  { route: "POST /v1/admin/people/:id/delete", body: ({ email }) => ({ email }), says: { status: "scheduled" } },
  { route: "POST /v1/admin/people/:id/delete/cancel", says: { status: "cancelled" } },
  { route: "POST /v1/admin/people/:id/enable", says: { status: "active" } },
  { route: "PATCH /v1/admin/people/:id/limits", body: () => ({ key: "cap.turns", value: 50 }), says: { key: "cap.turns", value: 50 } },
  { route: "PATCH /v1/admin/people/:id/limits", body: () => ({ key: "cap.turns", value: null }), says: { key: "cap.turns", value: null } },
  { route: "POST /v1/admin/jobs/:id/dismiss", says: { status: "dismissed" } },
  { route: "POST /v1/admin/jobs/:id/retry", says: { status: "queued" } },
  { route: "PATCH /v1/admin/settings", body: () => ({ changes: { "cap.turns": 90 }, expected: { "cap.turns": 100 } }), says: {} },
  { route: "POST /v1/admin/staff", body: ({ email }) => ({ email, role: "support" }), says: {} },
  { route: "PATCH /v1/admin/staff/:id", body: () => ({ role: "owner" }), says: { role: "owner" } },
  { route: "DELETE /v1/admin/staff/:id", says: { status: "removed" } },
  { route: "POST /v1/admin/waitlist/:id/invite", says: { status: "already-in" } },
  { route: "POST /v1/admin/waitlist/invite", body: ({ marked }) => ({ ids: [marked.accountId] }), says: {} },
  { route: "POST /v1/admin/waitlist/:id/resend", says: { status: "not-invited" } },
  { route: "DELETE /v1/admin/waitlist/:id", says: { status: "not-waiting" } },
  { route: "POST /v1/admin/waitlist/remove", body: ({ marked }) => ({ ids: [marked.accountId] }), says: { removed: 0, skipped: 1 } },
  { route: "POST /v1/admin/waitlist/invite-next", body: () => ({ count: 1 }), says: { batchSize: 1 } },
  { route: "POST /v1/admin/waitlist/invite-address", body: ({ email }) => ({ email }), says: { status: "already-in" } },
  // 039. A review code: the answer carries the code, once, and nobody.
  { route: "POST /v1/admin/codes", body: () => ({ note: "App Store review 1.0" }), says: { state: "live", maxUses: 5 } },
  { route: "POST /v1/admin/codes/:id/revoke", says: { status: "already" } },
  // Going-public 17c. The two files, last, so the log has every write above
  // in it. The marked account is in the log by name and address, which the
  // Audit page shows too; what may not be there is anything the mark is on.
  { route: "POST /v1/admin/staff/export", says: { csv: "account_id,name,email,role,state,added_at,added_by_id,added_by_email,last_panel_opened_at,last_here_at" } },
  {
    route: "POST /v1/admin/audit/export",
    body: () => ({}),
    says: { csv: "id,at,kind,staff_id,staff_name,staff_email,target_id,target_name,target_email,target_deleted,setting_key,old,new,job_id" },
  },
];

/** A write route this test does not call, and why not. Empty: a route goes
 *  here only when calling it once would destroy what the rest of the walk
 *  needs, and then its own test holds it to the same check. */
const EXEMPT: Record<string, string> = {};

const nameOf = (route: RouteEntry) => `${route.method} ${route.url}`;

/** Every condition an owner can be mailed about, in every state. */
function everyAlert(actorAccountId: string, targetAccountId: string): AlertPayload[] {
  const conditions = [
    "platform_cap",
    ...SERVICES.map((service) => `service_down:${service}`),
    ...SCHEDULED.map((job) => `job_late:${job.kind}`),
    "job_dead",
    "backup_late",
    "something_new",
  ];
  return [
    ...conditions.flatMap((condition): AlertPayload[] => [
      { alert: "condition", condition, state: "opened" },
      { alert: "condition", condition, state: "cleared" },
      { alert: "condition", condition, state: "paused", was: "opened" },
      { alert: "condition", condition, state: "paused", was: "cleared" },
    ]),
    ...STAFF_ALERTS.map((alert): AlertPayload => ({ alert, actorAccountId, targetAccountId })),
  ];
}

describe("AC-4 and AC-5 every admin write, the CSV, the alerts and the audit log", () => {
  it("has a row or an exemption for every write route that is registered", () => {
    const writes = adminRoutesOf(app).filter((route) => route.method !== "GET").map(nameOf);
    const covered = new Set([...WRITES.map((write) => write.route), ...Object.keys(EXEMPT)]);
    expect(writes.filter((route) => !covered.has(route))).toEqual([]);
    // And nothing listed that is no longer a route.
    expect([...covered].filter((route) => !writes.includes(route))).toEqual([]);
    for (const reason of Object.values(EXEMPT)) expect(reason.length).toBeGreaterThan(20);
  });

  it("returns no content and no credential from any write, or from what the writes leave behind", async () => {
    const marked = await seedMarked();
    const owner = await staffMember("owner", "boss@example.test");
    await db.updateTable("accounts").set({ display_name: "Hana Ito" }).where("id", "=", owner.id).execute();
    const { email } = await db.selectFrom("accounts").select("email").where("id", "=", marked.accountId).executeTakeFirstOrThrow();
    const ctx: Ctx = { marked, email };
    const routes = new Map(adminRoutesOf(app).map((route) => [nameOf(route), route]));

    for (const write of WRITES) {
      const route = routes.get(write.route)!;
      const payload = write.body?.(ctx);
      const response = await app.inject({
        method: route.method as "POST",
        url: fill(route.url, paramsFor(route, marked)),
        headers: { cookie: owner.cookie },
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
      });
      const label = `${write.route} ${JSON.stringify(payload ?? null)}`;
      expect(response.statusCode, `${label}: ${response.payload}`).toBe(200);
      if ("csv" in write.says) expect(response.payload.split("\r\n")[0], label).toBe(write.says.csv);
      else expect(response.json(), label).toMatchObject(write.says);
      expect(leaks(response.payload, marked), label).toEqual([]);
      expect(leaks(JSON.stringify(response.headers), marked), `${label} headers`).toEqual([]);
    }

    // The CSV: the daily figures, and nobody in it.
    const csv = await app.inject({ method: "GET", url: "/v1/admin/costs/export.csv?range=90d", headers: { cookie: owner.cookie } });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.payload).toContain("dump.answer");
    expect(leaks(csv.payload, marked)).toEqual([]);
    for (const who of [marked.accountId, email, "Jo Alves"]) expect(csv.payload).not.toContain(who);

    // Every alert, as the mail it becomes. A staff action names the staff
    // member, and the account it was done to by id and nothing else.
    const alerts = everyAlert(owner.id, marked.accountId);
    expect(alerts.length).toBeGreaterThan(STAFF_ALERTS.length + 20);
    for (const payload of alerts) {
      const mail = JSON.stringify(renderAlert(payload, { name: "Hana Ito", email: "boss@example.test" }));
      expect(leaks(mail, marked), JSON.stringify(payload)).toEqual([]);
      for (const who of [email, "Jo Alves"]) expect(mail, JSON.stringify(payload)).not.toContain(who);
    }
    // And the ones the writes above really booked: ids and a kind.
    const booked = await db.selectFrom("jobs").select(["payload"]).where("kind", "=", "email.alert").execute();
    expect(booked.map((job) => (job.payload as { alert: string }).alert).sort()).toEqual(["deletion.cancelled", "deletion.scheduled", "staff.added", "staff.removed", "staff.role_changed"]);
    for (const job of booked) {
      expect(leaks(JSON.stringify(job.payload), marked)).toEqual([]);
      expect(JSON.stringify(job.payload)).not.toContain(email);
    }

    // Every audit row, whole, as the table holds it: ids, a kind, a key and
    // two values. No content, no credential, and no address (AC-53).
    const entries = (await sql<{ row: Record<string, unknown> }>`select to_jsonb(a) as row from staff_audit a order by a.id`.execute(db)).rows.map((one) => one.row);
    const kinds = new Set(entries.map((entry) => entry["kind"]));
    for (const kind of ["person.viewed", "signed_out", "disabled", "enabled", "deletion.scheduled", "deletion.cancelled", "override.set", "override.cleared", "job.dismissed", "job.retried", "setting.changed", "staff.added", "staff.role_changed", "staff.removed"]) {
      expect(kinds, kind).toContain(kind);
    }
    for (const entry of entries) {
      const row = JSON.stringify(entry);
      expect(leaks(row, marked), row).toEqual([]);
      for (const who of [email, "boss@example.test", "Jo Alves", "Hana Ito"]) expect(row).not.toContain(who);
    }

    // The reads again, over what the writes left: the audit log now has
    // rows, the job was retried, a limit moved.
    await walkReads(owner.cookie, marked);
  });
});
