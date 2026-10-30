// 2026-10-29. My threads is one list, newest made first, until a person drags
// one; then it is in their order, one list per person, kept across devices.
// Activity never moves a thread, and there is no Older threads.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { closeDb, db } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { uuidv7 } from "../src/uuid.js";
import { account, as, join, signIn, thread, wipe } from "./labels-kit.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(wipe);

interface List {
  groups: { key: string; threads: { id: string; name: string; faces: { accountId: string; initials: string }[] }[] }[];
  order: { sort: "newest" | "mine"; ids: string[] };
}

async function list(cookie: string): Promise<List> {
  const response = await as(app, cookie).get("/v1/threads");
  expect(response.statusCode).toBe(200);
  return response.json() as List;
}
const names = (body: List) => body.groups.flatMap((group) => group.threads.map((row) => row.name));

/** Three threads made a day apart, the oldest first. */
async function three(me: string): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const [n, name] of ["Berlin", "Dentist", "Lisbon trip"].entries()) {
    ids[name] = await thread(me, name);
    await db.updateTable("threads").set({ created_at: sql`now() - make_interval(days => ${3 - n})` }).where("id", "=", ids[name]!).execute();
  }
  return ids;
}

describe("the read (AC-2)", () => {
  it("is one list, newest made first, and activity does not move it", async () => {
    const me = await account();
    const ids = await three(me);
    // Berlin is the oldest and the most recently active, and was quiet for 40 days before.
    await db.updateTable("threads").set({ last_activity_at: sql`now() + interval '1 minute'` }).where("id", "=", ids["Berlin"]!).execute();
    await db.updateTable("threads").set({ last_activity_at: sql`now() - interval '40 days'` }).where("id", "=", ids["Lisbon trip"]!).execute();
    const body = await list(await signIn(me));
    expect(body.groups.map((group) => group.key)).toEqual(["now"]);
    expect(names(body)).toEqual(["Lisbon trip", "Dentist", "Berlin"]);
    expect(body.order).toEqual({ sort: "newest", ids: [] });
  });

  it("carries the other members' faces, by initials", async () => {
    const me = await account("Ana Duarte");
    const sam = await account("Sam Reed");
    const shared = await thread(me, "Flat admin");
    await join(shared, sam);
    const row = (await list(await signIn(me))).groups[0]!.threads[0]!;
    expect(row.faces).toEqual([{ accountId: sam, initials: "SR" }]);
  });
});

describe("the faces", () => {
  it("come in the same order on every read", async () => {
    const me = await account("Ana Duarte");
    const zoe = await account("Zoe Young");
    const ben = await account("Ben Abel");
    const shared = await thread(me, "Flat admin");
    await join(shared, zoe);
    await join(shared, ben);
    const row = (await list(await signIn(me))).groups[0]!.threads[0]!;
    expect(row.faces.map((face) => face.initials)).toEqual(["BA", "ZY"]);
  });
});

describe("the write (AC-3, AC-4)", () => {
  it("keeps a dragged order, and puts a thread made since at the top", async () => {
    const me = await account();
    const ids = await three(me);
    const cookie = await signIn(me);
    const put = await as(app, cookie).patch("/v1/threads/order", { sort: "mine", ids: [ids["Berlin"], ids["Lisbon trip"], ids["Dentist"]] });
    expect(put.statusCode).toBe(204);
    expect(names(await list(cookie))).toEqual(["Berlin", "Lisbon trip", "Dentist"]);

    await thread(me, "Garden");
    const body = await list(cookie);
    expect(names(body)).toEqual(["Garden", "Berlin", "Lisbon trip", "Dentist"]);
    expect(body.order).toEqual({ sort: "mine", ids: [ids["Berlin"], ids["Lisbon trip"], ids["Dentist"]] });
  });

  it("switches to newest first without losing the order, and back", async () => {
    const me = await account();
    const ids = await three(me);
    const cookie = await signIn(me);
    await as(app, cookie).patch("/v1/threads/order", { sort: "mine", ids: [ids["Berlin"], ids["Dentist"], ids["Lisbon trip"]] });
    await as(app, cookie).patch("/v1/threads/order", { sort: "newest" });
    const newest = await list(cookie);
    expect(names(newest)).toEqual(["Lisbon trip", "Dentist", "Berlin"]);
    expect(newest.order).toEqual({ sort: "newest", ids: [ids["Berlin"], ids["Dentist"], ids["Lisbon trip"]] });
    await as(app, cookie).patch("/v1/threads/order", { sort: "mine" });
    expect(names(await list(cookie))).toEqual(["Berlin", "Dentist", "Lisbon trip"]);
  });

  it("is one list per person: a shared thread sits where each put it", async () => {
    const me = await account("Ana Duarte");
    const sam = await account("Sam Reed");
    const ids = await three(me);
    await join(ids["Berlin"]!, sam);
    await join(ids["Dentist"]!, sam);
    await as(app, await signIn(me)).patch("/v1/threads/order", { sort: "mine", ids: [ids["Berlin"], ids["Dentist"], ids["Lisbon trip"]] });
    await as(app, await signIn(sam)).patch("/v1/threads/order", { sort: "mine", ids: [ids["Dentist"], ids["Berlin"]] });
    expect(names(await list(await signIn(me)))).toEqual(["Berlin", "Dentist", "Lisbon trip"]);
    expect(names(await list(await signIn(sam)))).toEqual(["Dentist", "Berlin"]);
  });

  it("keeps only ids the person can see, once each, and drops what is not one", async () => {
    const me = await account("Ana Duarte");
    const other = await account("Sam Reed");
    const theirs = await thread(other, "Not yours");
    const ids = await three(me);
    const cookie = await signIn(me);
    const put = await as(app, cookie).patch("/v1/threads/order", {
      sort: "mine",
      ids: [theirs, uuidv7(), "c1", ids["Dentist"], ids["Dentist"], ids["Berlin"]],
    });
    expect(put.statusCode).toBe(204);
    const kept = await db.selectFrom("thread_order").select("ids").where("account_id", "=", me).executeTakeFirstOrThrow();
    expect(kept.ids).toEqual([ids["Dentist"], ids["Berlin"]]);
    expect(names(await list(cookie))).toEqual(["Lisbon trip", "Dentist", "Berlin"]);
  });

  it("never keeps the default thread, which My threads never draws", async () => {
    const me = await account();
    const loose = await thread(me, "Miscellaneous");
    await db.updateTable("accounts").set({ default_thread_id: loose }).where("id", "=", me).execute();
    const mine = await thread(me, "Dentist");
    await as(app, await signIn(me)).patch("/v1/threads/order", { sort: "mine", ids: [loose, mine] });
    const kept = await db.selectFrom("thread_order").select("ids").where("account_id", "=", me).executeTakeFirstOrThrow();
    expect(kept.ids).toEqual([mine]);
  });

  it("refuses what is not an order", async () => {
    const cookie = await signIn(await account());
    for (const payload of [{ sort: "oldest" }, { sort: "mine", ids: "x" }, {}]) {
      expect((await as(app, cookie).patch("/v1/threads/order", payload)).statusCode).toBe(400);
    }
  });

  it("asks for a session", async () => {
    expect((await app.inject({ method: "PATCH", url: "/v1/threads/order", payload: { sort: "newest" } })).statusCode).toBe(401);
  });
});
