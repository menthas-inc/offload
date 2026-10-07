// 040 part D. Where each memory sits on the map.
//
// AC-24 the daily run lays out each kind: the same embeddings always give
//       the same offsets, no two sentences in a kind share a row, and
//       memories that mean similar things sit together.
// AC-25 between nights, one with no place sits beside its nearest neighbour,
//       or on the kind's first free row.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { COLUMN_PITCH, ROW_PITCH } from "@offload/widgets";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { layoutMemories, gridOf } from "../src/memories/layout.js";
import { listMemories } from "../src/memories/store.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("memory_forgotten").execute();
  await db.deleteFrom("notes").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(): Promise<string> {
  return (
    await db
      .insertInto("accounts")
      .values({ email: `${uuidv7()}@example.test`, display_name: "Ana", state: "active" } as never)
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

/** A unit vector leaning towards one axis, a little towards another. */
function vector(axis: number, lean = 0, towards = 7): string {
  const v = new Array<number>(1024).fill(0);
  v[axis] = 1;
  v[towards] = lean;
  return `[${v.join(",")}]`;
}

async function memory(me: string, text: string, embedding: string | null, kind = "about", agoHours = 1): Promise<string> {
  return (
    await db
      .insertInto("notes")
      .values({
        account_id: me,
        scope: "account",
        subject_id: me,
        kind,
        text,
        origin: "stated",
        created_at: new Date(Date.now() - agoHours * 3600_000),
        ...(embedding ? { embedding: sql`${embedding}::halfvec`, embedding_model: "voyage-4", embedded_at: new Date() } : {}),
      } as never)
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
}

const places = async (me: string) =>
  new Map(
    (await db.selectFrom("notes").select(["id", "place_dx", "place_dy", "placed_at"]).where("subject_id", "=", me).execute()).map((r) => [
      r.id,
      r,
    ]),
  );

describe("the grid a kind is laid out in", () => {
  it("is roughly round, one sentence per row", () => {
    expect(gridOf(1)).toEqual({ columns: 1, rows: 1 });
    expect(gridOf(30).columns * gridOf(30).rows).toBeGreaterThanOrEqual(30);
    const big = gridOf(300);
    expect(big.columns * big.rows).toBeGreaterThanOrEqual(300);
    // Round, not a ribbon: the width and the height within a column's width.
    expect(Math.abs(big.columns * COLUMN_PITCH - big.rows * ROW_PITCH)).toBeLessThan(COLUMN_PITCH * 1.5);
  });
});

describe("the nightly layout", () => {
  it("puts what means similar things together, the same way every time, never two on one row", async () => {
    const me = await account();
    const trips = [await memory(me, "Trip one.", vector(1, 0.1)), await memory(me, "Trip two.", vector(1, 0.2)), await memory(me, "Trip three.", vector(1, 0.3))];
    const food = [await memory(me, "Food one.", vector(2, 0.1)), await memory(me, "Food two.", vector(2, 0.2)), await memory(me, "Food three.", vector(2, 0.3))];
    const person = await memory(me, "Their wife is Meera.", vector(3), "people");

    await layoutMemories(me);
    const first = await places(me);
    await db.updateTable("notes").set({ place_dx: null, place_dy: null }).where("subject_id", "=", me).execute();
    await layoutMemories(me);
    const second = await places(me);
    for (const [id, row] of first) expect([second.get(id)!.place_dx, second.get(id)!.place_dy]).toEqual([row.place_dx, row.place_dy]);

    const about = [...trips, ...food].map((id) => first.get(id)!);
    const spots = new Set(about.map((r) => `${r.place_dx},${r.place_dy}`));
    expect(spots.size).toBe(6);
    for (const a of about)
      for (const b of about) {
        if (a === b) continue;
        const sameColumn = a.place_dx === b.place_dx;
        if (sameColumn) expect(Math.abs(a.place_dy! - b.place_dy!)).toBeGreaterThanOrEqual(ROW_PITCH);
        else expect(Math.abs(a.place_dx! - b.place_dx!)).toBeGreaterThanOrEqual(COLUMN_PITCH);
      }
    // The trips are a run of the order and so are the food: no food between two trips.
    const order = [...about].sort((a, b) => a.place_dx! - b.place_dx! || a.place_dy! - b.place_dy!).map((r) => r.id);
    const tripAt = trips.map((id) => order.indexOf(id)).sort();
    expect(tripAt[2]! - tripAt[0]!).toBe(2);
    // A kind of its own is laid out on its own, at its centre.
    expect([first.get(person)!.place_dx, first.get(person)!.place_dy]).toEqual([0, 0]);
    expect(first.get(person)!.placed_at).not.toBeNull();
  });

  it("runs at the start of the daily run", async () => {
    const me = await account();
    const id = await memory(me, "Their wife is Meera.", vector(3), "people");
    await handlers["account.daily.run"]!({}, { mailer: new MemoryMailer() }, me);
    expect((await places(me)).get(id)!.placed_at).not.toBeNull();
  });
});

describe("between nights", () => {
  it("a new one sits on the free row beside its nearest neighbour, or on the kind's first free row", async () => {
    const me = await account();
    const near = await memory(me, "Trip one.", vector(1, 0.1));
    const far = await memory(me, "Food one.", vector(2, 0.1));
    await layoutMemories(me);
    const laid = await places(me);
    const fresh = await memory(me, "Trip two.", vector(1, 0.2));
    const bare = await memory(me, "Not embedded yet.", null);

    const list = await listMemories(me);
    const at = (id: string) => list.memories.find((m) => m.id === id)!.place;
    const nearest = laid.get(near)!;
    expect(at(fresh)!.dx).toBe(nearest.place_dx);
    const taken = new Set([near, far].map((id) => `${laid.get(id)!.place_dx},${laid.get(id)!.place_dy}`));
    expect(taken.has(`${at(fresh)!.dx},${at(fresh)!.dy}`)).toBe(false);
    expect(Math.abs(at(fresh)!.dy - nearest.place_dy!) % ROW_PITCH).toBe(0);
    expect(at(bare)).not.toBeNull();
    expect(`${at(bare)!.dx},${at(bare)!.dy}`).not.toBe(`${at(fresh)!.dx},${at(fresh)!.dy}`);
    // Computed on read, never stored.
    expect((await places(me)).get(fresh)!.place_dx).toBeNull();
  });
});
