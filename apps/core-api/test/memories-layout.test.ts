// 040 part D. Where each memory sits on the map.
//
// AC-24 the daily run lays out each kind: the same embeddings always give
//       the same offsets, no two sentences in a kind share a row, and
//       memories that mean similar things sit together.
// AC-25 between nights, one with no place sits beside its nearest neighbour,
//       or on the kind's first free row.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { pillWorldSize } from "@offload/widgets";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { arrangeKind, layoutMemories } from "../src/memories/layout.js";
import { listMemories } from "../src/memories/store.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("memory_forgotten").execute();
  await db.deleteFrom("memory_kind_places").execute();
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

type Box = { dx: number; dy: number; w: number; h: number };
/** Two placed sentences overlap when their cards do, at the sentence threshold. */
function overlaps(a: Box, b: Box): boolean {
  return Math.abs(a.dx - b.dx) < (a.w + b.w) / 2 && Math.abs(a.dy - b.dy) < (a.h + b.h) / 2;
}

/** A vector near one of a few topics, with a seeded wobble, as real ones are. */
function near(topic: number, n: number): string {
  const v = new Array<number>(1024).fill(0);
  v[topic] = 1;
  v[20 + ((n * 7) % 50)] = 0.35;
  v[80 + ((n * 13) % 40)] = 0.2;
  return `[${v.join(",")}]`;
}

describe("the nightly layout", () => {
  it("clusters what means similar things, apart from what does not, and never overlaps two sentences", async () => {
    const me = await account();
    const topics = { trips: 1, food: 2, work: 3 } as const;
    const ids: Record<string, string[]> = { trips: [], food: [], work: [] };
    for (const [name, topic] of Object.entries(topics)) {
      for (let n = 0; n < 8; n += 1) ids[name]!.push(await memory(me, `${name} memory number ${n}, a sentence of ordinary length.`, near(topic, n)));
    }
    await layoutMemories(me);
    const placed = await places(me);
    const at = (id: string) => ({ dx: placed.get(id)!.place_dx!, dy: placed.get(id)!.place_dy! });
    const mean = (pairs: [string, string][]) =>
      pairs.reduce((sum, [a, b]) => sum + Math.hypot(at(a).dx - at(b).dx, at(a).dy - at(b).dy), 0) / pairs.length;
    const within: [string, string][] = [];
    const across: [string, string][] = [];
    const names = Object.keys(ids);
    for (const a of names)
      for (const b of names)
        for (const x of ids[a]!)
          for (const y of ids[b]!) if (x < y) (a === b ? within : across).push([x, y]);
    expect(mean(within)).toBeLessThan(mean(across) * 0.6);

    // Not a table: the sentences do not sit in a few shared columns.
    const all = Object.values(ids).flat();
    const columns = new Set(all.map((id) => Math.round(at(id).dx)));
    expect(columns.size).toBeGreaterThan(all.length / 2);

    const texts = new Map((await db.selectFrom("notes").select(["id", "text"]).where("subject_id", "=", me).execute()).map((r) => [r.id, r.text]));
    const boxes = all.map((id) => ({ ...at(id), ...pillWorldSize(texts.get(id)!, false) }));
    // Staggered, not in rows: few cards share a row's height exactly.
    const rows = new Set(all.map((id) => Math.round(at(id).dy)));
    expect(rows.size).toBeGreaterThan(all.length / 2);
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false);
  });

  it("is the same every night for the same embeddings, and centres a kind of one", async () => {
    const me = await account();
    for (let n = 0; n < 12; n += 1) await memory(me, `Memory ${n}.`, near(1 + (n % 3), n));
    const person = await memory(me, "Their wife is Meera.", vector(3), "people");
    await layoutMemories(me);
    const first = await places(me);
    await db.updateTable("notes").set({ place_dx: null, place_dy: null }).where("subject_id", "=", me).execute();
    await layoutMemories(me);
    const second = await places(me);
    for (const [id, row] of first) expect([second.get(id)!.place_dx, second.get(id)!.place_dy]).toEqual([row.place_dx, row.place_dy]);
    expect([first.get(person)!.place_dx, first.get(person)!.place_dy]).toEqual([0, 0]);
    expect(first.get(person)!.placed_at).not.toBeNull();
  });

  it("places the kinds by what their memories mean together, kinds that talk alike near each other", async () => {
    const me = await account();
    // People and Things talk about the same topic; Patterns about another.
    for (let n = 0; n < 6; n += 1) await memory(me, `People ${n}.`, near(1, n), "people");
    for (let n = 0; n < 6; n += 1) await memory(me, `Things ${n}.`, near(1, n + 20), "things");
    for (let n = 0; n < 6; n += 1) await memory(me, `Patterns ${n}.`, near(5, n), "patterns");
    await layoutMemories(me);
    const kinds = new Map(
      (await db.selectFrom("memory_kind_places").select(["kind", "x", "y"]).where("account_id", "=", me).execute()).map((r) => [r.kind, r]),
    );
    expect([...kinds.keys()].sort()).toEqual(["patterns", "people", "things"]);
    const gap = (a: string, b: string) => Math.hypot(kinds.get(a)!.x - kinds.get(b)!.x, kinds.get(a)!.y - kinds.get(b)!.y);
    expect(gap("people", "things")).toBeLessThan(gap("people", "patterns"));
    // Normalised: spread about one, centred on zero.
    const xs = [...kinds.values()];
    expect(Math.abs(xs.reduce((s, k) => s + k.x, 0))).toBeLessThan(1e-3);
    const listed = await listMemories(me);
    expect(listed.kinds.map((k) => k.kind).sort()).toEqual(["patterns", "people", "things"]);
  });

  it("never holds the API's event loop for long: a kind of 300 yields as it goes", async () => {
    // The job runner shares the process that answers every request, and a
    // kind of 300 takes about a second to lay out.
    let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const v = Array.from({ length: 300 }, () => {
      const a = Array.from({ length: 16 }, () => rnd() - 0.5);
      const m = Math.hypot(...a);
      return a.map((x) => x / m);
    });
    const members = v.map((_, i) => ({ id: String(i).padStart(3, "0"), text: "They play squash with Tom on Thursdays.", learned: false, embedded: true }));
    const distance = (a: string, b: string) => 1 - v[+a]!.reduce((s, x, i) => s + x * v[+b]![i]!, 0);
    let last = performance.now();
    let longest = 0;
    const tick = setInterval(() => {
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
    }, 1);
    try {
      last = performance.now();
      await arrangeKind(members, distance);
      longest = Math.max(longest, performance.now() - last);
    } finally {
      clearInterval(tick);
    }
    expect(longest).toBeLessThan(100);
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
    const near_ = await memory(me, "Trip one.", vector(1, 0.1));
    const far = await memory(me, "Food one.", vector(2, 0.1));
    await layoutMemories(me);
    const laid = await places(me);
    const fresh = await memory(me, "Trip two.", vector(1, 0.2));
    const bare = await memory(me, "Not embedded yet.", null);

    const list = await listMemories(me);
    const at = (id: string) => list.memories.find((m) => m.id === id)!.place;
    const nearest = laid.get(near_)!;
    expect(at(fresh)!.dx).toBe(nearest.place_dx);
    // Under its nearest, clear of every placed sentence.
    expect(at(fresh)!.dy).toBeGreaterThan(nearest.place_dy!);
    for (const id of [near_, far]) {
      const other = { dx: laid.get(id)!.place_dx!, dy: laid.get(id)!.place_dy!, ...pillWorldSize(id === near_ ? "Trip one." : "Food one.", false) };
      expect(overlaps({ ...at(fresh)!, ...pillWorldSize("Trip two.", false) }, other)).toBe(false);
    }
    expect(at(bare)).not.toBeNull();
    expect(`${at(bare)!.dx},${at(bare)!.dy}`).not.toBe(`${at(fresh)!.dx},${at(fresh)!.dy}`);
    // Computed on read, never stored.
    expect((await places(me)).get(fresh)!.place_dx).toBeNull();
  });
});
