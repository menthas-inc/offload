// 030 T1.11 to T1.13. A connected calendar's event, put on a thread's map.
//
// The location text was written by whoever made the event. It goes to Google
// only through the filter, never enters the query cache, and the event keeps a
// fingerprint of what it looked up rather than a second copy of the words.

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { placeQuery } from "../src/places/query.js";
import { locateCalendar, resolveEventPlace, type Geocoder, type MapsConfig } from "../src/places/resolve.js";
import { setPick, threadEvents } from "../src/threads/calendars.js";

await migrate(() => {});
afterAll(closeDb);

const ON: MapsConfig = { on: true, key: "test-key", pepper: "test-pepper-test-pepper-test-pepper" };

const saved = { MAPS: env.MAPS, KEY: env.GOOGLE_MAPS_API_KEY, PEPPER: env.PLACE_HASH_PEPPER };
function mapsOn() {
  env.MAPS = "on";
  env.GOOGLE_MAPS_API_KEY = ON.key;
  env.PLACE_HASH_PEPPER = ON.pepper;
}
afterEach(() => {
  env.MAPS = saved.MAPS;
  env.GOOGLE_MAPS_API_KEY = saved.KEY;
  env.PLACE_HASH_PEPPER = saved.PEPPER;
});

beforeEach(async () => {
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("connector_calendars").execute();
  await db.deleteFrom("connector_connections").execute();
  await db.deleteFrom("place_lookups").execute();
  await db.deleteFrom("places").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

function stub() {
  const asked: string[] = [];
  const geocode: Geocoder = async (query) => {
    if (placeQuery(query) !== query) throw new Error(`the filter would not send ${query}`);
    asked.push(query);
    return { placeId: `ChIJ_${query.replace(/\W/g, "")}`, lat: 38.7, lng: -9.1, approximate: false };
  };
  return { asked, geocode };
}

async function account(): Promise<string> {
  return (
    await db
      .insertInto("accounts")
      .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, display_name: "Jo", analytics_subject_id: uuidv7() })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

async function calendarOf(accountId: string): Promise<string> {
  const connection = (
    await db
      .insertInto("connector_connections")
      .values({ account_id: accountId, provider: "google", external_account_email: `${uuidv7()}@g.com` })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
  return (
    await db
      .insertInto("connector_calendars")
      .values({ connection_id: connection, external_id: `cal-${uuidv7()}`, summary: "Home", access_role: "owner", selected: true, participants: 1 })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

const DAY = 86_400_000;
async function event(accountId: string, calendarId: string, location: string | null, inDays = 3, deleted = false) {
  const at = new Date(Date.now() + inDays * DAY);
  return (
    await db
      .insertInto("connector_events")
      .values({
        account_id: accountId,
        calendar_id: calendarId,
        source_ref: `x:${uuidv7()}`,
        title: "Dinner",
        location,
        occurs_at: at,
        occurs_end_at: new Date(at.getTime() + 3_600_000),
        untrusted: false,
        attendees: JSON.stringify([{ name: "Ana", email: "ana@example.com" }]),
        created_by_me: true,
        invited_me: false,
        ...(deleted ? { deleted_at: new Date() } : {}),
      } as never)
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

async function thread(accountId: string): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: accountId, name: "Lisbon trip", last_activity_at: sql`now()`, updated_at: sql`now()` })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state: "accepted" }).execute();
  return row.id;
}

const eventRow = (id: string) =>
  db.selectFrom("connector_events").select(["place_id", "located_key", "location"]).where("id", "=", id).executeTakeFirstOrThrow();

describe("an event's location (T1.11, AC-6)", () => {
  it("is looked up and remembered by a fingerprint, never by its words", async () => {
    const me = await account();
    const cal = await calendarOf(me);
    const id = await event(me, cal, "Time Out Market");
    const { asked, geocode } = stub();
    expect(await resolveEventPlace(id, geocode, ON)).toBe("resolved");
    expect(asked).toEqual(["Time Out Market"]);
    const row = await eventRow(id);
    expect(row.place_id).not.toBeNull();
    expect(row.located_key).toMatch(/^[0-9a-f]{64}$/);
    expect(row.located_key).not.toContain("Time");
    expect(await db.selectFrom("place_lookups").selectAll().execute()).toHaveLength(0);
  });

  it("is not looked up again while unchanged, and is when it changes", async () => {
    const me = await account();
    const cal = await calendarOf(me);
    const id = await event(me, cal, "Time Out Market");
    const { asked, geocode } = stub();
    await resolveEventPlace(id, geocode, ON);
    await db.updateTable("connector_events").set({ place_id: null }).where("id", "=", id).execute();
    expect(await resolveEventPlace(id, geocode, ON)).toBe("skipped");
    await db.updateTable("connector_events").set({ location: "Cervejaria Ramiro" }).where("id", "=", id).execute();
    expect(await resolveEventPlace(id, geocode, ON)).toBe("resolved");
    expect(asked).toEqual(["Time Out Market", "Cervejaria Ramiro"]);
  });

  it("sends nothing for an address, a person's place, a call or a link, and remembers that", async () => {
    const me = await account();
    const cal = await calendarOf(me);
    const { asked, geocode } = stub();
    for (const text of ["Rua Augusta 12", "Ana's place", "Zoom", "https://meet.example.com/abc"]) {
      const id = await event(me, cal, text);
      expect(await resolveEventPlace(id, geocode, ON), text).toBe("skipped");
      expect((await eventRow(id)).located_key, text).not.toBeNull();
    }
    expect(asked).toEqual([]);
  });

  it("leaves a deleted event alone", async () => {
    const me = await account();
    const cal = await calendarOf(me);
    const id = await event(me, cal, "Time Out Market", 3, true);
    const { asked, geocode } = stub();
    expect(await resolveEventPlace(id, geocode, ON)).toBe("skipped");
    expect(asked).toEqual([]);
  });
});

describe("a calendar filled in a batch at a time (T1.11)", () => {
  it("looks up events from yesterday to sixty days ahead, and nothing further", async () => {
    const me = await account();
    const cal = await calendarOf(me);
    await event(me, cal, "Time Out Market", 3);
    await event(me, cal, "Cervejaria Ramiro", -5);
    await event(me, cal, "Torre de Belem", 90);
    const { asked, geocode } = stub();
    const done = await locateCalendar(cal, geocode, ON);
    expect(asked).toEqual(["Time Out Market"]);
    expect(done).toMatchObject({ looked: 1 });
  });

  it("does two hundred a run and leaves the rest for the next", async () => {
    const me = await account();
    const cal = await calendarOf(me);
    for (let i = 0; i < 201; i++) await event(me, cal, `Cafe Numero ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`, 2);
    const { asked, geocode } = stub();
    await locateCalendar(cal, geocode, ON);
    expect(asked).toHaveLength(200);
    await locateCalendar(cal, geocode, ON);
    expect(asked).toHaveLength(201);
  });
});

describe("when a calendar is looked up (T1.12)", () => {
  it("books a lookup when a calendar is first picked, only while the map is on", async () => {
    const me = await account();
    const cal = await calendarOf(me);
    const t = await thread(me);
    await setPick(me, t, cal, true);
    expect(await db.selectFrom("jobs").select("kind").where("kind", "=", "event.locate").execute()).toHaveLength(0);
    await setPick(me, t, cal, false);
    mapsOn();
    await setPick(me, t, cal, true);
    expect(await db.selectFrom("jobs").select("kind").where("kind", "=", "event.locate").execute()).toHaveLength(1);
  });
});

describe("the location crosses with the event (T1.13, AC-6)", () => {
  async function shared() {
    const ana = await account();
    const ben = await account();
    const cal = await calendarOf(ana);
    const t = await thread(ana);
    await db.insertInto("thread_members").values({ thread_id: t, account_id: ben, state: "accepted" }).execute();
    await db.insertInto("thread_calendars").values({ thread_id: t, calendar_id: cal, account_id: ana }).execute();
    const id = await event(ana, cal, "Time Out Market");
    await resolveEventPlace(id, stub().geocode, ON);
    return { ana, ben, t };
  }
  const window = () => [new Date(Date.now() - DAY), new Date(Date.now() + 10 * DAY)] as const;

  it("reaches another member with where it is, while the map is on", async () => {
    mapsOn();
    const { ben, t } = await shared();
    const [from, to] = window();
    const [seen] = await threadEvents(ben, t, from, to);
    expect(seen!.location).toBe("Time Out Market");
    expect(seen!.place).toMatchObject({ lat: 38.7, lng: -9.1, approximate: false });
    expect(seen).not.toHaveProperty("attendees");
    expect(seen!.involved).toBe(false);
  });

  it("carries no location while the map is off", async () => {
    const { ben, t } = await shared();
    const [from, to] = window();
    const [seen] = await threadEvents(ben, t, from, to);
    expect(seen!.location).toBeNull();
    expect(seen!.place).toBeNull();
  });
});
