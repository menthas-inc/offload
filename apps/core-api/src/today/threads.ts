// Today, open in your threads (design 2026-10-07). Replaces If you have time.
//
// A page per thread holding open to-dos with no date (a rule always has one), every one
// the account reads, whoever filed it. The thread whose oldest such to-do is
// oldest comes first, and each page carries its oldest four and how many it
// holds. Not in a thread is always last, and only when it holds one. The
// server's rule, not a setting; no model call.

import { sql } from "kysely";
import { z } from "zod";
import { db } from "../db.js";
import { defaultThreadOf, facesOf, looseCounts, suggestionsFor } from "../loose/read.js";
import { openThreadsOn, resolveLayout } from "./layout.js";
import { agendaQuery, agendaRow, shapeRows, type AgendaRaw } from "./rows.js";

/** Thread pages drawn, Not in a thread aside. */
export const OPEN_PAGES = 12;
/** To-dos drawn on a page; the foot counts the rest. */
export const OPEN_ROWS = 4;
/** Faces drawn on a page's head. */
const FACES = 3;

export const openPage = z.object({
  threadId: z.string(),
  /** Null for Not in a thread, with the icon and the hue. */
  name: z.string().nullable(),
  icon: z.string().nullable(),
  hue: z.number().nullable(),
  /** The other people sharing the thread. */
  people: z.array(z.object({ accountId: z.string(), displayName: z.string(), initials: z.string() })),
  todos: z.array(agendaRow),
  /** Every open undated to-do the page holds, drawn or not. */
  count: z.number(),
  /** Not in a thread only: how many of its drawn to-dos offload has a thread
   *  in mind for, and what else it holds by kind. */
  loose: z.object({ inMind: z.number(), holds: z.record(z.string(), z.number()) }).nullable(),
});
export type OpenPage = z.infer<typeof openPage>;
export const openResponse = z.object({ pages: z.array(openPage), count: z.number() });

type Ranked = AgendaRaw & { rank: string; held: string; oldest: Date };

/** The oldest four of each thread's open undated to-dos, with the thread's
 *  count and its oldest, in one read. */
function ranked(accountId: string) {
  const open = agendaQuery(accountId)
    .where("content.type", "=", "task")
    .where("content.due_at", "is", null)
    .select([
      sql<string>`row_number() over (partition by content.thread_id order by content.created_at, content.id)`.as("rank"),
      sql<string>`count(*) over (partition by content.thread_id)`.as("held"),
      sql<Date>`min(content.created_at) over (partition by content.thread_id)`.as("oldest"),
    ]);
  return db.selectFrom(open.as("open")).selectAll().where("open.rank", "<=", String(OPEN_ROWS));
}

export async function openThreads(accountId: string): Promise<z.infer<typeof openResponse>> {
  const account = await db.selectFrom("accounts").select("today_layout").where("id", "=", accountId).executeTakeFirst();
  if (!openThreadsOn(resolveLayout(account?.today_layout ?? null))) return { pages: [], count: 0 };
  const looseId = await defaultThreadOf(accountId);

  let threaded = ranked(accountId);
  if (looseId) threaded = threaded.where("open.threadId", "<>", looseId);
  const [inThreads, inLoose] = await Promise.all([
    threaded
      .orderBy("open.oldest")
      .orderBy("open.threadId")
      .orderBy("open.rank")
      // Every page holds one row at least, so this reaches the last page.
      .limit(OPEN_PAGES * OPEN_ROWS)
      .execute() as Promise<Ranked[]>,
    looseId ? (ranked(accountId).where("open.threadId", "=", looseId).orderBy("open.rank").execute() as Promise<Ranked[]>) : Promise.resolve([]),
  ]);

  const groups = new Map<string, Ranked[]>();
  for (const row of [...inThreads, ...inLoose]) groups.set(row.threadId, [...(groups.get(row.threadId) ?? []), row]);
  const ids = [...groups.keys()].filter((id) => id !== looseId).slice(0, OPEN_PAGES);
  if (looseId && groups.has(looseId)) ids.push(looseId);

  const shaped = new Map((await shapeRows(ids.flatMap((id) => groups.get(id)!), accountId)).map((row) => [row.id, row]));
  const faces = await facesOf(accountId, ids.filter((id) => id !== looseId));

  const pages: OpenPage[] = [];
  for (const id of ids) {
    const rows = groups.get(id)!;
    const first = rows[0]!;
    const todos = rows.map((row) => shaped.get(row.id)!);
    let loose: OpenPage["loose"] = null;
    if (id === looseId) {
      const [mind, counts] = await Promise.all([
        suggestionsFor(accountId, id, { contentIds: todos.map((row) => row.id), noteIds: [] }),
        looseCounts(id),
      ]);
      const { todo: _todos, ...holds } = counts.byType;
      loose = { inMind: mind.size, holds: holds as Record<string, number> };
    }
    pages.push({
      threadId: id,
      name: first.threadName,
      icon: first.threadIcon,
      hue: first.threadHue,
      people: (faces.get(id) ?? []).slice(0, FACES),
      todos,
      count: Number(first.held),
      loose,
    });
  }
  return { pages, count: pages.reduce((sum, page) => sum + page.count, 0) };
}
