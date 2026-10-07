// 040 part D. Where each memory sits on the map.
//
// Once a day, at the start of the account's daily run, each kind is laid out
// on its own: the distances between its memories' embeddings, from pgvector,
// projected to two dimensions by classical scaling, then **one sentence per
// row** in a roughly round grid, so no two sentences overlap at any zoom. The
// first coordinate runs down the rows and the second across the columns, so
// what means similar things sits together. Stored as an offset from the
// kind's centre (`place_dx`, `place_dy`); the clients place the kinds.
//
// Deterministic: rows are read in id order, the power iteration starts from a
// fixed vector, each axis's sign is fixed by the oldest memory, and ties go by
// id. The same embeddings always give the same map.
//
// Between nights `placeOnRead` puts a memory with no place beside its nearest
// placed neighbour in its kind, computed when the list is read and never
// stored, so the map moves only once a day.

import { COLUMN_PITCH, ROW_PITCH } from "@offload/widgets";
import { sql } from "kysely";
import { db } from "../db.js";
import type { Executor } from "../threads/access.js";

/** The grid a kind of `n` is laid out in: about as tall as it is wide. */
export function gridOf(n: number): { columns: number; rows: number } {
  if (n <= 1) return { columns: 1, rows: 1 };
  const columns = Math.max(1, Math.round(Math.sqrt((n * ROW_PITCH) / COLUMN_PITCH)));
  return { columns, rows: Math.ceil(n / columns) };
}

/** The top eigenvector of a symmetric matrix, by power iteration from a fixed start. */
function topVector(m: number[][]): { vector: number[]; value: number } {
  const n = m.length;
  let v = m.map((_, i) => 1 + i / n);
  let value = 0;
  for (let step = 0; step < 200; step += 1) {
    const next = m.map((row) => row.reduce((sum, x, j) => sum + x * v[j]!, 0));
    const norm = Math.hypot(...next);
    if (norm < 1e-12) return { vector: new Array<number>(n).fill(0), value: 0 };
    value = norm;
    v = next.map((x) => x / norm);
  }
  return { vector: v, value };
}

/** Two coordinates per point from a distance matrix: classical scaling. */
export function project(distance: number[][]): [number, number][] {
  const n = distance.length;
  if (n === 0) return [];
  const squared = distance.map((row) => row.map((d) => d * d));
  const rowMean = squared.map((row) => row.reduce((a, b) => a + b, 0) / n);
  const all = rowMean.reduce((a, b) => a + b, 0) / n;
  const b = squared.map((row, i) => row.map((d, j) => -0.5 * (d - rowMean[i]! - rowMean[j]! + all)));
  const first = topVector(b);
  const deflated = b.map((row, i) => row.map((x, j) => x - first.value * first.vector[i]! * first.vector[j]!));
  const second = topVector(deflated);
  // The sign of an eigenvector is arbitrary: fixed by the first point (the
  // oldest), so a night's new memory does not mirror the map.
  const sign = (v: number[]) => (v[0]! < 0 ? -1 : 1);
  const s1 = sign(first.vector);
  const s2 = sign(second.vector);
  return first.vector.map((x, i) => [s1 * x * Math.sqrt(first.value), s2 * second.vector[i]! * Math.sqrt(second.value)]);
}

interface Point {
  id: string;
  coords: [number, number] | null;
}

/** Offsets for one kind: columns by the second coordinate, rows by the first,
 *  what has no embedding last, ties by id. */
export function arrange(points: Point[]): Map<string, { dx: number; dy: number }> {
  const out = new Map<string, { dx: number; dy: number }>();
  const { columns, rows } = gridOf(points.length);
  const key = (p: Point, axis: 0 | 1) => (p.coords ? p.coords[axis] : Number.POSITIVE_INFINITY);
  const byId = (a: Point, b: Point) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const across = [...points].sort((a, b) => key(a, 1) - key(b, 1) || byId(a, b));
  for (let column = 0; column < columns; column += 1) {
    const inColumn = across.slice(column * rows, (column + 1) * rows).sort((a, b) => key(a, 0) - key(b, 0) || byId(a, b));
    inColumn.forEach((point, row) => {
      out.set(point.id, {
        dx: (column - (columns - 1) / 2) * COLUMN_PITCH,
        dy: (row - (inColumn.length - 1) / 2) * ROW_PITCH,
      });
    });
  }
  return out;
}

/** The daily layout of every kind of one account's memories. */
export async function layoutMemories(accountId: string, trx: Executor = db): Promise<void> {
  const rows = await trx
    .selectFrom("notes")
    .select(["id", "kind", sql<boolean>`embedding is not null`.as("embedded")])
    .where("scope", "=", "account")
    .where("subject_id", "=", accountId)
    .where("account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .orderBy("created_at", "asc")
    .orderBy("id", "asc")
    .execute();
  if (rows.length === 0) return;

  const pairs = await sql<{ a: string; b: string; d: number }>`
    select a.id as a, b.id as b, (a.embedding <=> b.embedding)::float8 as d
      from notes a
      join notes b on b.subject_id = a.subject_id and b.kind = a.kind and a.id < b.id
     where a.scope = 'account' and b.scope = 'account'
       and a.subject_id = ${accountId} and a.account_id = ${accountId} and b.account_id = ${accountId}
       and a.deleted_at is null and a.superseded_at is null
       and b.deleted_at is null and b.superseded_at is null
       and a.embedding is not null and b.embedding is not null
  `.execute(trx);
  const distance = new Map<string, number>();
  for (const p of pairs.rows) {
    distance.set(`${p.a}:${p.b}`, p.d);
    distance.set(`${p.b}:${p.a}`, p.d);
  }

  const kinds = new Map<string, typeof rows>();
  for (const row of rows) kinds.set(row.kind, [...(kinds.get(row.kind) ?? []), row]);

  for (const members of kinds.values()) {
    const embedded = members.filter((m) => m.embedded);
    const matrix = embedded.map((a) => embedded.map((b) => (a.id === b.id ? 0 : (distance.get(`${a.id}:${b.id}`) ?? 1))));
    const coords = project(matrix);
    const at = new Map(embedded.map((m, i) => [m.id, coords[i]!]));
    const offsets = arrange(members.map((m) => ({ id: m.id, coords: at.get(m.id) ?? null })));
    for (const [id, place] of offsets) {
      await trx
        .updateTable("notes")
        .set({ place_dx: place.dx, place_dy: place.dy, placed_at: sql`now()` })
        .where("id", "=", id)
        .execute();
    }
  }
}

/** Between nights: a place for each memory that has none, beside its nearest
 *  placed neighbour in its kind (the next free row down that column), or on
 *  the kind's first free row below what is placed. Never stored. */
export async function placeOnRead(
  accountId: string,
  memories: { id: string; kind: string; createdAt: Date; place: { dx: number; dy: number } | null }[],
  trx: Executor = db,
): Promise<Map<string, { dx: number; dy: number }>> {
  const out = new Map<string, { dx: number; dy: number }>();
  const unplaced = memories.filter((m) => !m.place).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
  if (unplaced.length === 0) return out;

  const nearest = await sql<{ id: string; dx: number; dy: number }>`
    select distinct on (n.id) n.id, p.place_dx as dx, p.place_dy as dy
      from notes n
      join notes p on p.subject_id = n.subject_id and p.kind = n.kind and p.id <> n.id
     where n.scope = 'account' and p.scope = 'account'
       and n.subject_id = ${accountId} and n.account_id = ${accountId} and p.account_id = ${accountId}
       and n.id in (${sql.join(unplaced.map((m) => m.id))})
       and n.embedding is not null and p.embedding is not null
       and p.place_dx is not null and p.place_dy is not null
       and p.deleted_at is null and p.superseded_at is null
     order by n.id, n.embedding <=> p.embedding, p.id
  `.execute(trx);
  const beside = new Map(nearest.rows.map((r) => [r.id, { dx: r.dx, dy: r.dy }]));

  const taken = new Map<string, Set<string>>();
  const spot = (kind: string, dx: number, dy: number) => `${dx},${dy}`;
  for (const m of memories) {
    if (!m.place) continue;
    const set = taken.get(m.kind) ?? new Set<string>();
    set.add(spot(m.kind, m.place.dx, m.place.dy));
    taken.set(m.kind, set);
  }
  for (const m of unplaced) {
    const set = taken.get(m.kind) ?? new Set<string>();
    taken.set(m.kind, set);
    const start = beside.get(m.id);
    let dx: number;
    let dy: number;
    if (start) {
      dx = start.dx;
      dy = start.dy + ROW_PITCH;
    } else {
      const placed = memories.filter((o) => o.kind === m.kind && o.place);
      dx = 0;
      dy = placed.length ? Math.max(...placed.map((o) => o.place!.dy)) + ROW_PITCH : 0;
    }
    while (set.has(spot(m.kind, dx, dy))) dy += ROW_PITCH;
    set.add(spot(m.kind, dx, dy));
    out.set(m.id, { dx, dy });
  }
  return out;
}
