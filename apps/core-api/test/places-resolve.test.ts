// 030 T1.4. Turning a row's place into a point, on Google.
//
// The geocoder is a stub that runs the real filter first, so no test can pass
// a query the gate in front of Google would refuse: a stub that cannot fail
// tests the caller and nothing else (CLAUDE.md).

import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { mapsConfigProblem } from "../src/env.js";
import { placeQuery, queryKey } from "../src/places/query.js";
import { googleGeocoder, resolvePlace, type Geocoder, type MapsConfig } from "../src/places/resolve.js";
import { reverseGeocodingOn } from "../src/places/reverse.js";

await migrate(() => {});
afterAll(closeDb);

const ON: MapsConfig = { on: true, key: "test-key", pepper: "test-pepper-test-pepper-test-pepper" };
const OFF: MapsConfig = { on: false, key: "", pepper: "" };

beforeEach(async () => {
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("place_lookups").execute();
  await db.deleteFrom("places").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

afterEach(() => vi.unstubAllGlobals());

type Hit = NonNullable<Awaited<ReturnType<Geocoder>>>;
const market: Hit = { placeId: "ChIJ_market", lat: 38.7071, lng: -9.1459, approximate: false };

/** A geocoder that records what it was asked, refuses anything the filter
 *  would, and never touches the network. */
function stub(result: Hit | null) {
  const asked: string[] = [];
  const geocode: Geocoder = async (query) => {
    if (placeQuery(query) !== query) throw new Error(`the filter would not send ${query}`);
    asked.push(query);
    return result;
  };
  return { asked, geocode };
}

async function row(type: "location" | "event" | "link", title: string, location: string | null = null) {
  const me = (
    await db
      .insertInto("accounts")
      .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7() })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
  const t = (
    await db
      .insertInto("threads")
      .values({ created_by_account_id: me, name: "Lisbon trip", last_activity_at: sql`now()`, updated_at: sql`now()` })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
  await db.insertInto("thread_members").values({ thread_id: t, account_id: me, state: "accepted" }).execute();
  return (
    await db
      .insertInto("content")
      .values({ account_id: me, thread_id: t, title, type, location, updated_at: new Date() })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

const placeOf = async (id: string) =>
  (await db.selectFrom("content").select("place_id").where("id", "=", id).executeTakeFirstOrThrow()).place_id;

describe("switched on and off (AC-8)", () => {
  it("does nothing at all while off", async () => {
    const id = await row("location", "Time Out Market");
    const { asked, geocode } = stub(market);
    expect(await resolvePlace(id, geocode, OFF)).toBe("skipped");
    expect(asked).toEqual([]);
    expect(await db.selectFrom("place_lookups").selectAll().execute()).toHaveLength(0);
  });

  it("refuses to be switched on without a key and a pepper", () => {
    expect(mapsConfigProblem({ MAPS: "on" })).toMatch(/GOOGLE_MAPS_API_KEY/);
    expect(mapsConfigProblem({ MAPS: "on", GOOGLE_MAPS_API_KEY: "k" })).toMatch(/PLACE_HASH_PEPPER/);
    expect(mapsConfigProblem({ MAPS: "on", GOOGLE_MAPS_API_KEY: "k", PLACE_HASH_PEPPER: "p".repeat(32) })).toBeNull();
    expect(mapsConfigProblem({ MAPS: "off" })).toBeNull();
  });

  it("leaves the photo town's gate needing its own switch (AC-33)", () => {
    expect(reverseGeocodingOn()).toBe(false);
  });
});

describe("what is looked up (AC-1, AC-7)", () => {
  it("looks up a saved place by its name, an event and a link by their location", async () => {
    const place = await row("location", "Time Out Market");
    const event = await row("event", "Dinner", "Cervejaria Ramiro");
    const link = await row("link", "Casa Alfama on Airbnb", "Casa Alfama");
    const { asked, geocode } = stub(market);
    expect(await resolvePlace(place, geocode, ON)).toBe("resolved");
    expect(await resolvePlace(event, geocode, ON)).toBe("resolved");
    expect(await resolvePlace(link, geocode, ON)).toBe("resolved");
    expect(asked).toEqual(["Time Out Market", "Cervejaria Ramiro", "Casa Alfama"]);
  });

  it("keeps Google's id and coordinates with their age, and nothing else", async () => {
    const id = await row("location", "Time Out Market");
    await resolvePlace(id, stub(market).geocode, ON);
    const place = await db.selectFrom("places").selectAll().executeTakeFirstOrThrow();
    expect(place).toMatchObject({ provider: "google", provider_place_id: "ChIJ_market", lat: 38.7071, lng: -9.1459, approximate: false });
    expect(place.coords_at).toBeInstanceOf(Date);
    expect(await placeOf(id)).toBe(place.id);
  });

  it("sends nothing for a name the filter refuses, and keeps the row as it is (AC-5)", async () => {
    const id = await row("location", "Rua Augusta 12");
    const { asked, geocode } = stub(market);
    expect(await resolvePlace(id, geocode, ON)).toBe("skipped");
    expect(asked).toEqual([]);
    const kept = await db.selectFrom("content").select(["title", "place_id"]).where("id", "=", id).executeTakeFirstOrThrow();
    expect(kept).toEqual({ title: "Rua Augusta 12", place_id: null });
  });

  it("does not look up a row somebody has undone", async () => {
    const id = await row("location", "Time Out Market");
    await db.updateTable("content").set({ deleted_at: new Date(), purge_after: new Date() }).where("id", "=", id).execute();
    const { asked, geocode } = stub(market);
    expect(await resolvePlace(id, geocode, ON)).toBe("skipped");
    expect(asked).toEqual([]);
  });
});

describe("the query cache (AC-8)", () => {
  it("makes one call for one phrase however it is spelled, under a peppered key", async () => {
    const a = await row("location", "Time Out Market");
    const b = await row("location", "  time out   MARKET ");
    const { asked, geocode } = stub(market);
    expect(await resolvePlace(a, geocode, ON)).toBe("resolved");
    expect(await resolvePlace(b, geocode, ON)).toBe("hit");
    expect(asked).toHaveLength(1);
    const keys = await db.selectFrom("place_lookups").select("query_hash").execute();
    expect(keys.map((k) => k.query_hash)).toEqual([queryKey("Time Out Market", ON.pepper)]);
  });

  it("remembers a miss for thirty days, then asks again", async () => {
    const first = await row("location", "Blue Door Bar");
    const { asked, geocode } = stub(null);
    expect(await resolvePlace(first, geocode, ON)).toBe("not_found");
    const second = await row("location", "Blue Door Bar");
    expect(await resolvePlace(second, geocode, ON)).toBe("not_found");
    expect(asked).toHaveLength(1);

    await db.updateTable("place_lookups").set({ looked_up_at: sql`now() - interval '31 days'` }).execute();
    const third = await row("location", "Blue Door Bar");
    await resolvePlace(third, geocode, ON);
    expect(asked).toHaveLength(2);
  });

  it("attaches a hit whose coordinates aged out, and asks for them again", async () => {
    const a = await row("location", "Time Out Market");
    await resolvePlace(a, stub(market).geocode, ON);
    await db.updateTable("places").set({ lat: null, lng: null, approximate: null, coords_at: null }).execute();

    const b = await row("location", "Time Out Market");
    const { asked, geocode } = stub(market);
    expect(await resolvePlace(b, geocode, ON)).toBe("hit");
    expect(asked).toEqual([]);
    expect(await placeOf(b)).not.toBeNull();
    const jobs = await db.selectFrom("jobs").select(["kind", "payload"]).execute();
    expect(jobs.map((j) => j.kind)).toEqual(["places.refresh"]);
    const payload = (typeof jobs[0]!.payload === "string" ? JSON.parse(jobs[0]!.payload) : jobs[0]!.payload) as object;
    expect(Object.keys(payload)).toEqual(["placeId"]);
  });

  it("remembers nothing when Google fails, since the place may well exist", async () => {
    const id = await row("location", "Time Out Market");
    const angry: Geocoder = async () => {
      throw new Error("429 for Time Out Market");
    };
    expect(await resolvePlace(id, angry, ON)).toBe("provider_error");
    expect(await db.selectFrom("place_lookups").selectAll().execute()).toHaveLength(0);
    expect(await placeOf(id)).toBeNull();
  });
});

describe("a lookup that something overtook", () => {
  it("does not attach the old place to a renamed row", async () => {
    const id = await row("location", "Time Out Market");
    const renaming: Geocoder = async () => {
      await db.updateTable("content").set({ title: "Cervejaria Ramiro" }).where("id", "=", id).execute();
      return market;
    };
    expect(await resolvePlace(id, renaming, ON)).toBe("skipped");
    expect(await placeOf(id)).toBeNull();
  });

  it("does not attach the old place to an event whose location changed", async () => {
    const id = await row("event", "Dinner", "Time Out Market");
    const editing: Geocoder = async () => {
      await db.updateTable("content").set({ location: "Cervejaria Ramiro" }).where("id", "=", id).execute();
      return market;
    };
    expect(await resolvePlace(id, editing, ON)).toBe("skipped");
    expect(await placeOf(id)).toBeNull();
  });
});

describe("googleGeocoder (AC-3, AC-7)", () => {
  const fixture = (name: string) => readFileSync(new URL(`./fixtures/google/${name}.json`, import.meta.url), "utf8");

  function google(name: string) {
    const bodies = [fixture(`search-${name}`), fixture(`details-${name}`)];
    vi.stubGlobal("fetch", async () => new Response(bodies.shift(), { status: 200 }));
  }

  it("gives a spot for a restaurant", async () => {
    google("restaurant");
    expect(await googleGeocoder("Cervejaria Ramiro", ON.key)).toMatchObject({ approximate: false, placeId: expect.stringMatching(/^ChIJ/) });
  });

  it("gives an area for a neighbourhood", async () => {
    google("neighbourhood");
    expect(await googleGeocoder("Alfama", ON.key)).toMatchObject({ approximate: true });
  });

  it("gives nothing for a country", async () => {
    google("country");
    expect(await googleGeocoder("Portugal", ON.key)).toBeNull();
  });
});
