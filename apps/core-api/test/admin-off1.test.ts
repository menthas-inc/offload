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
// that carries the marks rather than about nobody. Writes, the CSV, the alert
// emails and the audit log join this at the merge, with the same kit.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App, type RouteEntry } from "../src/app.js";
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

describe("AC-4 and AC-5 every admin read", () => {
  it("returns no content and no credential, whatever it is asked", async () => {
    const marked = await seedMarked();
    const owner = await staffMember("owner");
    const reads = adminRoutesOf(app).filter((route) => route.method === "GET");
    expect(reads.map((route) => route.url)).toContain("/v1/admin/waitlist");

    let answered = 0;
    for (const route of reads) {
      for (const query of QUERIES) {
        const url = `${fill(route.url, paramsFor(route, marked))}${query}`;
        const response = await app.inject({ method: "GET", url, headers: { cookie: owner.cookie } });
        // An owner is never turned away by the guard, so a 404 here is a
        // route saying it has nothing, and a 500 is a broken route.
        expect(response.statusCode, `${route.url}${query}`).toBeLessThan(500);
        if (response.statusCode === 200) answered += 1;
        expect(leaks(response.payload, marked), `${route.url}${query}`).toEqual([]);
        expect(leaks(JSON.stringify(response.headers), marked), `${route.url}${query} headers`).toEqual([]);
      }
    }
    // The walk reached real answers, or it proved nothing.
    expect(answered).toBeGreaterThanOrEqual(reads.length);
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
