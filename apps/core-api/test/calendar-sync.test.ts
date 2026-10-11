// 012 sync: a recurring series cut short at Google leaves offload on the
// quarter-hour pass, not the nightly one.
//
// "Delete this and following" cancels nothing. Google moves the series' end
// back and may say nothing about the occurrences it dropped, so the delta pass
// asks Google for the series' occurrences whenever the delta touches it and
// retires the ones that are gone. Deleting the whole series arrives as the
// series itself cancelled, which no occurrence row is keyed on.

import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { seal } from "../src/connectors/vault.js";
import { sourceRefFor } from "../src/connectors/events.js";
import { syncConnection } from "../src/connectors/sync.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

const CAL = "cal-home";
const DAY = 24 * 60 * 60 * 1000;
const original = globalThis.fetch;
let calls: URL[] = [];

beforeEach(async () => {
  calls = [];
  await db.deleteFrom("connector_events").execute();
  await db.deleteFrom("connector_calendars").execute();
  await db.deleteFrom("connector_connections").execute();
  await db.deleteFrom("accounts").execute();
});

afterEach(() => {
  globalThis.fetch = original;
});

async function setup(): Promise<{ accountId: string; connectionId: string; calendarId: string }> {
  const account = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state: "active",
      email_verified: true,
      display_name: "Jo Alves",
      analytics_subject_id: uuidv7(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const connection = await db
    .insertInto("connector_connections")
    .values({ account_id: account.id, provider: "google", external_account_email: "jo@g.com" })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("connector_secrets")
    .values({
      connection_id: connection.id,
      access_token: seal("access", connection.id, "access_token"),
      refresh_token: null,
      access_expires_at: new Date(Date.now() + 60 * 60 * 1000),
      scope: null,
      wrapped_by: "vault:v1",
    })
    .execute();
  const calendar = await db
    .insertInto("connector_calendars")
    .values({
      connection_id: connection.id,
      external_id: CAL,
      summary: "Home",
      access_role: "owner",
      is_primary: true,
      selected: true,
      sync_token: "tok-1",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { accountId: account.id, connectionId: connection.id, calendarId: calendar.id };
}

const at = (days: number) => new Date(Date.now() + days * DAY);
const occurrenceId = (series: string, days: number) => `${series}_${days}`;

async function occurrence(ids: { accountId: string; calendarId: string }, series: string | null, days: number, id?: string) {
  await db
    .insertInto("connector_events")
    .values({
      account_id: ids.accountId,
      calendar_id: ids.calendarId,
      source_ref: sourceRefFor(CAL, id ?? occurrenceId(series ?? "single", days)),
      title: "Swim",
      occurs_at: at(days),
      occurs_end_at: null,
      all_day: false,
      timezone: null,
      location: null,
      series_ref: series,
      organizer_is_me: true,
      untrusted: false,
      link: null,
      created_by_me: true,
      invited_me: false,
    })
    .execute();
}

function item(series: string | null, days: number, status = "confirmed", id?: string) {
  return {
    id: id ?? occurrenceId(series ?? "single", days),
    status,
    summary: "Swim",
    ...(series ? { recurringEventId: series } : {}),
    organizer: { self: true },
    start: { dateTime: at(days).toISOString() },
    end: { dateTime: new Date(at(days).getTime() + 60 * 60 * 1000).toISOString() },
  };
}

/** Google, as far as this pass talks to it: the delta, and a series' occurrences. */
function google(delta: unknown[], instances: Record<string, unknown[] | number>) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url);
    const series = url.pathname.match(/\/events\/([^/]+)\/instances$/)?.[1];
    if (series !== undefined) {
      const answer = instances[decodeURIComponent(series)];
      if (answer === undefined) throw new Error(`unexpected instances call for ${series}`);
      if (typeof answer === "number") return new Response("{}", { status: answer });
      return new Response(JSON.stringify({ items: answer }), { status: 200 });
    }
    return new Response(JSON.stringify({ items: delta, nextSyncToken: "tok-2" }), { status: 200 });
  }) as typeof fetch;
}

async function live(calendarId: string): Promise<string[]> {
  const rows = await db
    .selectFrom("connector_events")
    .select("source_ref")
    .where("calendar_id", "=", calendarId)
    .where("deleted_at", "is", null)
    .orderBy("occurs_at")
    .execute();
  return rows.map((r) => r.source_ref.slice(CAL.length + 1));
}

describe("a series cut short at Google", () => {
  it("retires the occurrences after the cut on the delta pass", async () => {
    const ids = await setup();
    for (const days of [-90, -7, 1, 8, 15]) await occurrence(ids, "swim", days);
    await occurrence(ids, null, 3);

    // The delta touches the series without cancelling anything.
    google([item("swim", 1)], { swim: [item("swim", -7), item("swim", 1)] });

    const outcome = await syncConnection(ids.connectionId);

    // Behind the window Google is never asked, so that row is left alone.
    expect(await live(ids.calendarId)).toEqual(["swim_-90", "swim_-7", "swim_1", "single_3"]);
    expect(outcome.retired).toBe(2);

    const asked = calls.find((u) => u.pathname.endsWith("/events/swim/instances"));
    expect(asked?.searchParams.get("timeMin")).toBeTruthy();
    expect(asked?.searchParams.get("timeMax")).toBeTruthy();
  });

  it("also does so when the delta names the series only through a cancelled occurrence", async () => {
    const ids = await setup();
    for (const days of [1, 8, 15]) await occurrence(ids, "swim", days);

    google([item("swim", 8, "cancelled")], { swim: [item("swim", 1)] });

    await syncConnection(ids.connectionId);

    expect(await live(ids.calendarId)).toEqual(["swim_1"]);
  });

  it("retires every occurrence when Google says the series is gone", async () => {
    const ids = await setup();
    for (const days of [1, 8]) await occurrence(ids, "swim", days);

    google([item("swim", 1)], { swim: 410 });

    await syncConnection(ids.connectionId);

    expect(await live(ids.calendarId)).toEqual([]);
  });
});

describe("a whole series deleted at Google", () => {
  it("retires every occurrence when the delta carries the series itself as cancelled", async () => {
    const ids = await setup();
    for (const days of [1, 8, 15]) await occurrence(ids, "swim", days);
    await occurrence(ids, null, 3);

    google([{ id: "swim", status: "cancelled" }], {});

    const outcome = await syncConnection(ids.connectionId);

    expect(await live(ids.calendarId)).toEqual(["single_3"]);
    expect(outcome.retired).toBe(3);
  });
});

describe("one calendar's expired token", () => {
  it("re-reads that calendar only, and the next one in the connection stays a delta", async () => {
    const ids = await setup();
    const work = await db
      .insertInto("connector_calendars")
      .values({
        connection_id: ids.connectionId,
        external_id: "cal-work",
        summary: "Work",
        access_role: "owner",
        is_primary: false,
        selected: true,
        sync_token: "tok-w",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await occurrence({ accountId: ids.accountId, calendarId: work.id }, null, 3);

    // Home's token is too old; work's delta is empty, nothing changed there.
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      calls.push(url);
      const home = url.pathname.includes(`/calendars/${CAL}/`);
      if (home && url.searchParams.has("syncToken")) return new Response("{}", { status: 410 });
      return new Response(JSON.stringify({ items: [], nextSyncToken: "tok-2" }), { status: 200 });
    }) as typeof fetch;

    const outcome = await syncConnection(ids.connectionId);

    expect(outcome.resynced).toBe(true);
    expect(await live(work.id)).toEqual(["single_3"]);
  });
});

describe("a series with more occurrences than one page", () => {
  it("reads every page before deciding what is gone", async () => {
    const ids = await setup();
    for (const days of [1, 8, 15]) await occurrence(ids, "swim", days);

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      calls.push(url);
      if (!url.pathname.endsWith("/instances")) {
        return new Response(JSON.stringify({ items: [item("swim", 1)], nextSyncToken: "tok-2" }), { status: 200 });
      }
      const body = url.searchParams.get("pageToken") === "p2"
        ? { items: [item("swim", 15)] }
        : { items: [item("swim", 1), item("swim", 8)], nextPageToken: "p2" };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;

    await syncConnection(ids.connectionId);

    expect(await live(ids.calendarId)).toEqual(["swim_1", "swim_8", "swim_15"]);
  });
});

describe("what the delta pass costs", () => {
  it("asks Google nothing more when no series changed", async () => {
    const ids = await setup();
    await occurrence(ids, null, 3);

    google([item(null, 3)], {});

    await syncConnection(ids.connectionId);

    expect(calls).toHaveLength(1);
  });

  it("asks once per series however many of its occurrences changed", async () => {
    const ids = await setup();
    for (const days of [1, 8, 15]) await occurrence(ids, "swim", days);

    google([item("swim", 1), item("swim", 8), item("swim", 15)], { swim: [item("swim", 1), item("swim", 8), item("swim", 15)] });

    await syncConnection(ids.connectionId);

    expect(calls.filter((u) => u.pathname.endsWith("/instances"))).toHaveLength(1);
    expect(await live(ids.calendarId)).toEqual(["swim_1", "swim_8", "swim_15"]);
  });
});

describe("a secret that no longer opens", () => {
  it("asks the person to reconnect rather than failing every tick", async () => {
    const { connectionId } = await setup();
    // Sealed under a key the vault no longer holds: what a rotated
    // CONNECTOR_VAULT_KEY leaves behind. The bytes are well formed and the tag
    // does not verify.
    await db
      .updateTable("connector_secrets")
      .set({ access_token: Buffer.from(randomBytes(48)) })
      .where("connection_id", "=", connectionId)
      .execute();
    google([], {});

    await expect(syncConnection(connectionId)).resolves.toMatchObject({ calendars: 0 });
    const row = await db.selectFrom("connector_connections").select("state").where("id", "=", connectionId).executeTakeFirstOrThrow();
    expect(row.state).toBe("needs_reauth");
    expect(calls).toEqual([]);
  });
});
