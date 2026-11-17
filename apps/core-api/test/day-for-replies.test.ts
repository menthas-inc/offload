// 052 T1.11. A reply's calendar lists a day's entries from Today's day read,
// with what an entry's details need: where an event is, and the calendar a
// row is on. A reply can show a past day, which Today never asks for.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { readDay } from "../src/today/day.js";
import { account, as, row, signIn, thread, wipe } from "./labels-kit.js";

let app: App;
await migrate(() => {});
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(async () => {
  await db.deleteFrom("connector_calendars").execute();
  await db.deleteFrom("connector_connections").execute();
  await wipe();
});

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe("a past day", () => {
  it("is read for a reply, and still refused to Today", async () => {
    const me = await account();
    const cookie = await signIn(me);
    expect((await as(app, cookie).get(`/v1/today/day?date=${day(-3)}`)).statusCode).toBe(400);
    expect((await as(app, cookie).get(`/v1/today/day?date=${day(-3)}&past=1`)).statusCode).toBe(200);
    expect((await as(app, cookie).get(`/v1/today/day?date=${day(-400)}&past=1`)).statusCode).toBe(400);
  });
});

describe("what an entry's details need", () => {
  it("gives an event its location and place", async () => {
    const me = await account();
    const home = await thread(me, "Ana's bbq");
    const place = await db
      .insertInto("places")
      .values({ provider: "google", provider_place_id: `p-${Date.now()}-${Math.random()}`, lat: 51.53, lng: -0.04, approximate: false })
      .returning("id")
      .executeTakeFirstOrThrow();
    const at = `${day(2)}T13:00:00Z`;
    await row(me, home, "Ana's 40th birthday bbq at Victoria Park", { type: "event", occurs_at: new Date(at), location: "Victoria Park", place_id: place.id });
    const read = await readDay(me, day(2));
    if (read === "bad_date") throw new Error("bad_date");
    expect(read.events[0]).toMatchObject({ location: "Victoria Park", place: { lat: 51.53, lng: -0.04, approximate: false } });
  });

  it("gives a row on a calendar that calendar's name and colour", async () => {
    const me = await account();
    const home = await thread(me, "Flat admin");
    const conn = await db
      .insertInto("connector_connections")
      .values({ account_id: me, provider: "google", external_account_email: "me@g.com" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("connector_calendars")
      .values({ connection_id: conn.id, external_id: "cal-home", summary: "Home", access_role: "owner", selected: true, participants: 2, is_primary: false, colour: "#E67C73" })
      .execute();
    await row(me, home, "Pay rent", { type: "task", due_at: new Date(`${day(2)}T09:00:00Z`), source_ref: "cal-home:evt-1" });
    const read = await readDay(me, day(2));
    if (read === "bad_date") throw new Error("bad_date");
    const rent = [...read.timed, ...read.rest][0]!;
    expect(rent).toMatchObject({ title: "Pay rent", calendar: { name: "Home", colour: "#E67C73" } });
  });
});
