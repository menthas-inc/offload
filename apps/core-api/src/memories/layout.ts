// 040 part D. Where each memory sits on the map.
//
// Once a day, at the start of the account's daily run, each kind is laid out
// on its own, as a network rather than a table:
//
// 1. **The distances** between its memories' embeddings, from pgvector.
// 2. **t-SNE** takes them to two dimensions. Measured on 2026-10-07 against
//    90 real memory sentences embedded by Voyage, classical scaling kept 31% of
//    each memory's five nearest neighbours in 2D and t-SNE 56%: short memory
//    sentences sit close in 1024 dimensions, and only a method that keeps
//    neighbourhoods rather than the two widest directions shows them as
//    clusters. Exact t-SNE, since a kind holds at most 300.
// 3. **Room for the sentences.** The points are scaled to about the disc the
//    kind's pills would fill, then pushed apart only as far as their own pills need
//    (`pillWorldSize`), pulled back towards where t-SNE put
//    them while there is room. No two sentences overlap at any zoom. Each card
//    is its own size (`pillWorldSize`: one line when short, two when not, as
//    wide as its words), so cards stagger instead of sitting in rows.
//
// Stored as an offset from the kind's centre (`place_dx`, `place_dy`); the
// clients place the kinds. Deterministic: rows in created and id order, the
// starting layout from classical scaling, no randomness anywhere, so the same
// embeddings always give the same map.
//
// Between nights `placeOnRead` puts a memory with no place under its nearest
// placed neighbour in its kind, clear of every placed sentence, computed when
// the list is read and never stored, so the map moves only once a day.

import { ROW_PITCH, pillWorldSize } from "@offload/widgets";
import { sql } from "kysely";
import { db } from "../db.js";
import type { Executor } from "../threads/access.js";

/** How spread a kind's projection is, against the disc its pills would fill:
 *  a little more than tight, so clusters read as clusters with air between. */
const SPREAD = 1.1;
/** Clear space between two sentences side by side, and one above the other. */
const SIDE_GAP = 12;
const STACK_GAP = 8;
/** How finely a card looks for room around where it belongs: fine enough that
 *  cards stagger rather than settle into rows. */
const RING_STEP = 6;

/** Lets the event loop run. The job runner shares the process that answers
 *  every request, and a kind of 300 takes about a second to lay out: measured
 *  2026-10-07, t-SNE 0.5 s and making room 0.5 s, with 0.5 s more for the
 *  map of all kinds. Called often, it yields once its slice is used up, so
 *  no request waits more than a few milliseconds behind a layout. */
const SLICE_MS = 8;
let sliceFrom = performance.now();
async function breathe(): Promise<void> {
  if (performance.now() - sliceFrom < SLICE_MS) return;
  await new Promise<void>((resolve) => setImmediate(resolve));
  sliceFrom = performance.now();
}

/** The top eigenvector of a symmetric matrix, by power iteration from a fixed start. */
async function topVector(m: number[][]): Promise<{ vector: number[]; value: number }> {
  const n = m.length;
  let v = m.map((_, i) => 1 + i / n);
  let value = 0;
  for (let step = 0; step < 200; step += 1) {
    await breathe();
    const next = m.map((row) => row.reduce((sum, x, j) => sum + x * v[j]!, 0));
    const norm = Math.hypot(...next);
    if (norm < 1e-12) return { vector: new Array<number>(n).fill(0), value: 0 };
    value = norm;
    v = next.map((x) => x / norm);
  }
  return { vector: v, value };
}

/** Two coordinates per point from a distance matrix: classical scaling, the
 *  deterministic start t-SNE refines. */
export async function project(distance: number[][]): Promise<[number, number][]> {
  const n = distance.length;
  if (n === 0) return [];
  const squared = distance.map((row) => row.map((d) => d * d));
  const rowMean = squared.map((row) => row.reduce((a, b) => a + b, 0) / n);
  const all = rowMean.reduce((a, b) => a + b, 0) / n;
  const b = squared.map((row, i) => row.map((d, j) => -0.5 * (d - rowMean[i]! - rowMean[j]! + all)));
  const first = await topVector(b);
  const deflated = b.map((row, i) => row.map((x, j) => x - first.value * first.vector[i]! * first.vector[j]!));
  const second = await topVector(deflated);
  // An eigenvector's sign is arbitrary: fixed by the oldest point, so a
  // night's new memory does not mirror the map.
  const sign = (v: number[]) => (v[0]! < 0 ? -1 : 1);
  const s1 = sign(first.vector);
  const s2 = sign(second.vector);
  return first.vector.map((x, i) => [s1 * x * Math.sqrt(first.value), s2 * second.vector[i]! * Math.sqrt(second.value)]);
}

/** Exact t-SNE on a cosine distance matrix, deterministic from `start`. */
export async function tsne(distance: number[][], start: [number, number][]): Promise<[number, number][]> {
  const n = distance.length;
  if (n <= 2) return start.map(([x, y]) => [x, y]);
  await breathe();
  // For unit vectors the squared Euclidean distance is twice the cosine one.
  const d2 = distance.map((row) => row.map((d) => 2 * d));
  const perplexity = Math.max(2, Math.min(10, (n - 1) / 3));
  const target = Math.log(perplexity);

  // Each point's bandwidth, by bisection on the entropy of its neighbours.
  const p = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    await breathe();
    let beta = 1;
    let lo = 0;
    let hi = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 60; step += 1) {
      let sum = 0;
      let weighted = 0;
      for (let j = 0; j < n; j += 1) {
        if (j === i) continue;
        const e = Math.exp(-d2[i]![j]! * beta);
        p[i]![j] = e;
        sum += e;
        weighted += d2[i]![j]! * e;
      }
      sum = Math.max(sum, 1e-12);
      const entropy = Math.log(sum) + (beta * weighted) / sum;
      for (let j = 0; j < n; j += 1) p[i]![j]! /= sum;
      if (Math.abs(entropy - target) < 1e-5) break;
      if (entropy > target) {
        lo = beta;
        beta = hi === Number.POSITIVE_INFINITY ? beta * 2 : (beta + hi) / 2;
      } else {
        hi = beta;
        beta = (beta + lo) / 2;
      }
    }
  }
  const pij = p.map((row, i) => row.map((x, j) => Math.max((x + p[j]![i]!) / (2 * n), 1e-12)));

  // Start from classical scaling, small, as scikit-learn's pca start is.
  const sx = Math.sqrt(start.reduce((s, [x]) => s + x * x, 0) / n) || 1;
  const y = start.map(([a, b]) => [(a / sx) * 1e-4, (b / sx) * 1e-4]);
  const velocity = y.map(() => [0, 0]);
  const gains = y.map(() => [1, 1]);
  const rate = Math.max(n / 48, 50);
  const q = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  const grad = y.map(() => [0, 0]);
  for (let step = 0; step < 750; step += 1) {
    await breathe();
    const exaggeration = step < 250 ? 12 : 1;
    const momentum = step < 250 ? 0.5 : 0.8;
    let total = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const dx = y[i]![0]! - y[j]![0]!;
        const dy = y[i]![1]! - y[j]![1]!;
        const num = 1 / (1 + dx * dx + dy * dy);
        q[i]![j] = num;
        q[j]![i] = num;
        total += 2 * num;
      }
    }
    // Every gradient from the same positions, then every step.
    for (let i = 0; i < n; i += 1) {
      let gx = 0;
      let gy = 0;
      for (let j = 0; j < n; j += 1) {
        if (j === i) continue;
        const num = q[i]![j]!;
        const force = (exaggeration * pij[i]![j]! - num / total) * num;
        gx += 4 * force * (y[i]![0]! - y[j]![0]!);
        gy += 4 * force * (y[i]![1]! - y[j]![1]!);
      }
      grad[i]![0] = gx;
      grad[i]![1] = gy;
    }
    for (let i = 0; i < n; i += 1) {
      for (const axis of [0, 1] as const) {
        const g = grad[i]![axis]!;
        // A step against the gradient that keeps its direction grows; one
        // that turns shrinks. Same as scikit-learn's gains.
        const turning = velocity[i]![axis]! * g > 0;
        gains[i]![axis] = Math.max(0.01, turning ? gains[i]![axis]! * 0.8 : gains[i]![axis]! + 0.2);
        velocity[i]![axis] = momentum * velocity[i]![axis]! - rate * gains[i]![axis]! * g;
        y[i]![axis]! += velocity[i]![axis]!;
      }
    }
  }
  return y.map(([a, b]) => [a!, b!]);
}

interface Pill {
  id: string;
  x: number;
  y: number;
  /** Where the projection put it, which the pills are pulled back towards. */
  homeX: number;
  homeY: number;
  w: number;
  h: number;
}

function clash(a: Pill, b: Pill): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + SIDE_GAP && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + STACK_GAP;
}

/** Each pill, from the centre outward, takes the free spot nearest where the
 *  projection put it: rings around its target, finest first, so a cluster
 *  stays a cluster and nothing overlaps. Every step deterministic. */
export async function makeRoom(pills: Pill[]): Promise<void> {
  const order = [...pills].sort((a, b) => Math.hypot(a.homeX, a.homeY) - Math.hypot(b.homeX, b.homeY) || (a.id < b.id ? -1 : 1));
  const placed: Pill[] = [];
  for (const pill of order) {
    await breathe();
    let found = false;
    for (let ring = 0; ring < 400 && !found; ring += 1) {
      const radius = ring * RING_STEP;
      const steps = ring === 0 ? 1 : Math.ceil((2 * Math.PI * radius) / RING_STEP);
      for (let k = 0; k < steps; k += 1) {
        const angle = (2 * Math.PI * k) / steps;
        pill.x = pill.homeX + radius * Math.cos(angle);
        pill.y = pill.homeY + radius * Math.sin(angle);
        if (!placed.some((other) => clash(pill, other))) {
          found = true;
          break;
        }
      }
    }
    while (placed.some((other) => clash(pill, other))) pill.y += pill.h;
    placed.push(pill);
  }
}

/** Far points pulled in, near ones kept: r' = R(1 - e^(-r/R)) around the
 *  kind's centre, so one outlier does not stretch the cloud and the space on
 *  screen goes to the memories, not to the gap before the last one. */
export function compress(points: [number, number][], reach: number): [number, number][] {
  return points.map(([x, y]) => {
    const r = Math.hypot(x, y);
    if (r < 1e-9) return [x, y];
    const r2 = reach * (1 - Math.exp(-r / reach));
    return [(x / r) * r2, (y / r) * r2];
  });
}

/** One kind's offsets: t-SNE from the distances, scaled to the room its pills
 *  need, room made for each pill, centred on the kind.
 *  What has no embedding yet joins under the rest. */
export async function arrangeKind(
  members: { id: string; text: string; learned: boolean; embedded: boolean }[],
  distance: (a: string, b: string) => number,
): Promise<Map<string, { dx: number; dy: number }>> {
  const out = new Map<string, { dx: number; dy: number }>();
  if (members.length === 1) {
    out.set(members[0]!.id, { dx: 0, dy: 0 });
    return out;
  }
  const embedded = members.filter((m) => m.embedded);
  const matrix = embedded.map((a) => embedded.map((b) => (a.id === b.id ? 0 : distance(a.id, b.id))));
  const flat = await tsne(matrix, await project(matrix));

  // Scale by room, not by neighbours: the cloud's spread is about the disc
  // its pills would fill, so coincident points (two memories saying nearly
  // the same thing) cannot blow the scale up or shrink it to nothing.
  const room = members.reduce((sum, m) => {
    const size = pillWorldSize(m.text, m.learned);
    return sum + (size.w + SIDE_GAP) * (size.h + STACK_GAP);
  }, 0);
  const wanted = Math.sqrt(room / Math.PI) * SPREAD;
  const mx = flat.reduce((s, [x]) => s + x, 0) / Math.max(flat.length, 1);
  const my = flat.reduce((s, [, y]) => s + y, 0) / Math.max(flat.length, 1);
  const rms = Math.sqrt(flat.reduce((s, [x, y]) => s + (x - mx) ** 2 + (y - my) ** 2, 0) / Math.max(flat.length, 1));
  const scale = rms > 1e-9 ? wanted / rms : 1;
  const centred = compress(
    flat.map(([x, y]) => [(x - mx) * scale, (y - my) * scale] as [number, number]),
    wanted,
  );
  const at = new Map(embedded.map((m, i) => [m.id, centred[i]!] as const));
  const lowest = Math.max(0, ...[...at.values()].map(([, y]) => y));

  let below = 0;
  const pills: Pill[] = members.map((m) => {
    const home = at.get(m.id) ?? [0, lowest + ROW_PITCH * (1 + below++)];
    return { id: m.id, x: home[0], y: home[1], homeX: home[0], homeY: home[1], ...pillWorldSize(m.text, m.learned) };
  });
  await makeRoom(pills);

  const cx = pills.reduce((s, p) => s + p.x, 0) / pills.length;
  const cy = pills.reduce((s, p) => s + p.y, 0) / pills.length;
  for (const p of pills) out.set(p.id, { dx: Math.round(p.x - cx), dy: Math.round(p.y - cy) });
  return out;
}

/** Each kind at the mean of its memories in one t-SNE of them all, centred
 *  and scaled to a spread of one. Pairs across kinds need their distance, so
 *  this reads them itself; a kind with no embedding yet is not placed and the
 *  clients put it where there is room. */
async function placeKinds(
  trx: Executor,
  accountId: string,
  embedded: { id: string; kind: string }[],
  within: (a: string, b: string) => number,
): Promise<void> {
  await trx.deleteFrom("memory_kind_places").where("account_id", "=", accountId).execute();
  const kinds = [...new Set(embedded.map((m) => m.kind))];
  if (kinds.length === 0) return;
  let points: [number, number][];
  if (embedded.length < 3) {
    points = embedded.map((_, i) => [i, 0]);
  } else {
    const across = await sql<{ a: string; b: string; d: number }>`
      select a.id as a, b.id as b, (a.embedding <=> b.embedding)::float8 as d
        from notes a
        join notes b on b.subject_id = a.subject_id and b.kind <> a.kind and a.id < b.id
       where a.scope = 'account' and b.scope = 'account'
         and a.subject_id = ${accountId} and a.account_id = ${accountId} and b.account_id = ${accountId}
         and a.deleted_at is null and a.superseded_at is null
         and b.deleted_at is null and b.superseded_at is null
         and a.embedding is not null and b.embedding is not null
    `.execute(trx);
    const other = new Map<string, number>();
    for (const p of across.rows) {
      other.set(`${p.a}:${p.b}`, p.d);
      other.set(`${p.b}:${p.a}`, p.d);
    }
    const matrix = embedded.map((a) =>
      embedded.map((b) => (a.id === b.id ? 0 : a.kind === b.kind ? within(a.id, b.id) : (other.get(`${a.id}:${b.id}`) ?? 1))),
    );
    points = await tsne(matrix, await project(matrix));
  }
  const means = kinds.map((kind) => {
    const own = points.filter((_, i) => embedded[i]!.kind === kind);
    return {
      kind,
      x: own.reduce((s, [x]) => s + x, 0) / own.length,
      y: own.reduce((s, [, y]) => s + y, 0) / own.length,
    };
  });
  const mx = means.reduce((s, k) => s + k.x, 0) / means.length;
  const my = means.reduce((s, k) => s + k.y, 0) / means.length;
  const spread = Math.sqrt(means.reduce((s, k) => s + (k.x - mx) ** 2 + (k.y - my) ** 2, 0) / means.length) || 1;
  await trx
    .insertInto("memory_kind_places")
    .values(means.map((k) => ({ account_id: accountId, kind: k.kind, x: (k.x - mx) / spread, y: (k.y - my) / spread })))
    .execute();
}

/** The daily layout of every kind of one account's memories. */
export async function layoutMemories(accountId: string, trx: Executor = db): Promise<void> {
  const rows = await trx
    .selectFrom("notes")
    .select(["id", "kind", "text", "origin", sql<boolean>`embedding is not null`.as("embedded")])
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

  // Between kinds: every embedded memory together, and each kind at the mean
  // of its own. Kinds that talk about the same things land near each other.
  await placeKinds(trx, accountId, rows.filter((r) => r.embedded), (a, b) => distance.get(`${a}:${b}`) ?? 1);

  for (const members of kinds.values()) {
    const offsets = await arrangeKind(
      members.map((m) => ({ id: m.id, text: m.text, learned: m.origin === "learned", embedded: m.embedded })),
      (a, b) => distance.get(`${a}:${b}`) ?? 1,
    );
    for (const [id, place] of offsets) {
      await trx
        .updateTable("notes")
        .set({ place_dx: place.dx, place_dy: place.dy, placed_at: sql`now()` })
        .where("id", "=", id)
        .execute();
    }
  }
}

/** Between nights: a place for each memory that has none, under its nearest
 *  placed neighbour in its kind, or under the kind's lowest sentence when it
 *  has no embedding yet, stepped down until it clears every placed sentence.
 *  Never stored. */
export async function placeOnRead(
  accountId: string,
  memories: { id: string; kind: string; text: string; origin: string; createdAt: Date; place: { dx: number; dy: number } | null }[],
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

  const placed = new Map<string, Pill[]>();
  for (const m of memories) {
    if (!m.place) continue;
    const pill = { id: m.id, x: m.place.dx, y: m.place.dy, homeX: 0, homeY: 0, ...pillWorldSize(m.text, m.origin === "learned") };
    placed.set(m.kind, [...(placed.get(m.kind) ?? []), pill]);
  }
  for (const m of unplaced) {
    const kind = placed.get(m.kind) ?? [];
    placed.set(m.kind, kind);
    const start = beside.get(m.id);
    const pill: Pill = {
      id: m.id,
      x: start?.dx ?? 0,
      y: start ? start.dy + ROW_PITCH : kind.length ? Math.max(...kind.map((p) => p.y)) + ROW_PITCH : 0,
      homeX: 0,
      homeY: 0,
      ...pillWorldSize(m.text, m.origin === "learned"),
    };
    while (kind.some((p) => clash(pill, p))) pill.y += pill.h;
    kind.push(pill);
    out.set(m.id, { dx: pill.x, dy: pill.y });
  }
  return out;
}
