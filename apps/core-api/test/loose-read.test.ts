// 028. My threads without Always on, and what is not in a thread, read.
//
// T1.3 two groups; T1.4 the bundle says isDefault; T1.7 the summary; T1.8 the
// paged list; T1.9 suggestions on the read.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { uuidv7 } from "../src/uuid.js";
import { as, account, createSuggestion, join, moveSuggestion, note, owner, proposal, row, signIn, thread, wipe } from "./loose-kit.js";

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

type Item =
  | { kind: "content"; row: { id: string; title: string; type: string }; suggestion: Suggestion | null }
  | { kind: "note"; note: { id: string; text: string }; suggestion: Suggestion | null };
type Suggestion =
  | { id: string; kind: "move"; thread: { id: string; name: string }; faces: { initials: string }[]; more: number }
  | { id: string; kind: "create"; proposal: { id: string; name: string; count: number } };
type Threads = {
  groups: { key: string; threads: { id: string; name: string }[] }[];
  loose: { count: number; byType: Record<string, number>; rows: Item[] } | null;
};
type Page = { rows: Item[]; nextCursor: string | null; count: number; byType: Record<string, number>; archived: number };

/** UUIDv7 orders by the millisecond; where a test asserts order, it waits one. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 3));

const titleOf = (item: Item) => (item.kind === "content" ? item.row.title : item.note.text);

async function threads(me: string): Promise<Threads> {
  const response = await as(app, await signIn(me)).get("/v1/threads");
  expect(response.statusCode).toBe(200);
  return response.json() as Threads;
}

describe("My threads (T1.3, AC-1, AC-2)", () => {
  it("returns exactly two groups and never the default thread", async () => {
    const { me } = await owner();
    await thread(me, "Lisbon trip");
    const body = await threads(me);
    expect(body.groups.map((g) => g.key)).toEqual(["now", "older"]);
    expect(body.groups.flatMap((g) => g.threads.map((t) => t.name))).toEqual(["Lisbon trip"]);
  });

  it("groups by staleness only: always_on no longer holds a thread up", async () => {
    const { me } = await owner();
    const read = await thread(me, "Read later");
    const fresh = await thread(me, "Flat admin");
    await db.updateTable("threads").set({ always_on: true, last_activity_at: sql`now() - interval '40 days'` }).where("id", "=", read).execute();
    await db.updateTable("threads").set({ always_on: true }).where("id", "=", fresh).execute();
    const byKey = Object.fromEntries((await threads(me)).groups.map((g) => [g.key, g.threads.map((t) => t.name)]));
    expect(byKey).toEqual({ now: ["Flat admin"], older: ["Read later"] });
  });
});

describe("the bundle (T1.4, AC-4)", () => {
  it("says isDefault on the caller's own default thread only", async () => {
    const { me, loose } = await owner();
    const other = await thread(me, "Lisbon trip");
    const cookie = await signIn(me);
    expect((await as(app, cookie).get(`/v1/threads/${loose}`)).json().isDefault).toBe(true);
    expect((await as(app, cookie).get(`/v1/threads/${other}`)).json().isDefault).toBe(false);
  });

  it("answers 404 for another account's default thread", async () => {
    const { loose } = await owner();
    const { me: them } = await owner("Sam Ibekwe");
    expect((await as(app, await signIn(them)).get(`/v1/threads/${loose}`)).statusCode).toBe(404);
  });
});

describe("the summary (T1.7, AC-6, AC-7)", () => {
  it("counts live rows and current notes, and leaves the rest out", async () => {
    const { me, loose } = await owner();
    await row(me, loose, "Renew passport");
    await row(me, loose, "Done already", { done_at: new Date() });
    await row(me, loose, "Archived", { archived_at: new Date() });
    await row(me, loose, "Deleted", { deleted_at: new Date() });
    await row(me, loose, "A link", { type: "link" });
    await row(me, loose, "A photo", { type: "image" });
    await row(me, loose, "A screenshot", { type: "screenshot" });
    await row(me, loose, "A place", { type: "location" });
    await note(me, loose, "Ana's shoe size is 38");
    const folded = await note(me, loose, "Folded away");
    await db.updateTable("notes").set({ superseded_at: new Date() }).where("id", "=", folded).execute();

    const { loose: summary } = await threads(me);
    expect(summary!.count).toBe(6);
    expect(summary!.byType).toEqual({ todo: 1, link: 1, photo: 2, place: 1, note: 1 });
  });

  it("draws the newest three across rows and notes, and they may be notes", async () => {
    const { me, loose } = await owner();
    await row(me, loose, "Oldest");
    await tick();
    await row(me, loose, "Second");
    await tick();
    await note(me, loose, "Third, a note");
    await tick();
    await row(me, loose, "Newest");
    const { loose: summary } = await threads(me);
    expect(summary!.rows.map(titleOf)).toEqual(["Newest", "Third, a note", "Second"]);
    expect(summary!.rows[1]!.kind).toBe("note");
  });

  it("is null when nothing is loose, and for an account with no default thread", async () => {
    const { me } = await owner();
    expect((await threads(me)).loose).toBeNull();
    const bare = await account("Nobody");
    expect((await threads(bare)).loose).toBeNull();
  });

  it("never reads another account's loose things", async () => {
    const { me } = await owner();
    const { me: them, loose: theirs } = await owner("Sam Ibekwe");
    await row(them, theirs, "Theirs");
    expect((await threads(me)).loose).toBeNull();
  });
});

describe("the full list (T1.8, AC-12, AC-13, AC-14)", () => {
  it("reaches every row across pages, rows and notes interleaved, newest first", async () => {
    const { me, loose } = await owner();
    const made: string[] = [];
    for (let i = 0; i < 70; i += 1) {
      if (i % 3 === 0) made.push(await note(me, loose, `n${i}`));
      else made.push(await row(me, loose, `r${i}`));
    }
    const cookie = await signIn(me);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const response = await as(app, cookie).get(`/v1/loose${cursor ? `?cursor=${cursor}` : ""}`);
      expect(response.statusCode).toBe(200);
      const page = response.json() as Page;
      expect(page.rows.length).toBeLessThanOrEqual(30);
      seen.push(...page.rows.map((item) => (item.kind === "content" ? item.row.id : item.note.id)));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    // Newest first is id order: UUIDv7, ordered by the millisecond, which is
    // all a person can tell apart. Every row once, none lost at a page edge.
    expect(seen).toEqual([...made].sort().reverse());
  });

  it("filters by chip key, and refuses an unknown one", async () => {
    const { me, loose } = await owner();
    await row(me, loose, "A link", { type: "link" });
    await row(me, loose, "A to-do");
    await note(me, loose, "A note");
    await tick();
    await row(me, loose, "Another link", { type: "link" });
    const cookie = await signIn(me);
    const links = (await as(app, cookie).get("/v1/loose?type=link")).json() as Page;
    expect(links.rows.map(titleOf)).toEqual(["Another link", "A link"]);
    const notes = (await as(app, cookie).get("/v1/loose?type=note")).json() as Page;
    expect(notes.rows.map(titleOf)).toEqual(["A note"]);
    expect(links.byType).toEqual({ link: 2, todo: 1, note: 1 });
    expect((await as(app, cookie).get("/v1/loose?type=folder")).statusCode).toBe(400);
  });

  it("does not move an edited note", async () => {
    const { me, loose } = await owner();
    const n = await note(me, loose, "First");
    await tick();
    await row(me, loose, "Second");
    await db.updateTable("notes").set({ text: "First, edited", updated_at: sql`now() + interval '1 minute'` }).where("id", "=", n).execute();
    const page = (await as(app, await signIn(me)).get("/v1/loose")).json() as Page;
    expect(page.rows.map(titleOf)).toEqual(["Second", "First, edited"]);
  });

  it("refuses a cursor that is not an id, and a borrowed cursor reads only the caller's rows", async () => {
    const { me, loose } = await owner();
    const { me: them, loose: theirs } = await owner("Sam Ibekwe");
    await row(me, loose, "Mine");
    const theirsRow = await row(them, theirs, "Theirs");
    const cookie = await signIn(me);
    expect((await as(app, cookie).get("/v1/loose?cursor=nope")).statusCode).toBe(400);
    const page = (await as(app, cookie).get(`/v1/loose?cursor=${uuidv7()}`)).json() as Page;
    expect(page.rows.map(titleOf)).toEqual(["Mine"]);
    expect(page.rows.some((item) => item.kind === "content" && item.row.id === theirsRow)).toBe(false);
  });

  it("counts the archived rows and reads them on request", async () => {
    const { me, loose } = await owner();
    await row(me, loose, "Live");
    await row(me, loose, "Put away", { archived_at: new Date() });
    const cookie = await signIn(me);
    expect(((await as(app, cookie).get("/v1/loose")).json() as Page).archived).toBe(1);
    const archived = (await as(app, cookie).get("/v1/loose?archived=true")).json() as { rows: { title: string }[] };
    expect(archived.rows.map((r) => r.title)).toEqual(["Put away"]);
  });

  it("is 401 signed out and empty with no default thread", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/loose" })).statusCode).toBe(401);
    const bare = await account("Nobody");
    const page = (await as(app, await signIn(bare)).get("/v1/loose")).json() as Page;
    expect(page.rows).toEqual([]);
    expect(page.count).toBe(0);
  });
});

describe("suggestions on the read (T1.9, AC-16, AC-17, AC-18, AC-23)", () => {
  it("draws a Move to with the thread's current name, and faces for a shared thread", async () => {
    const { me, loose } = await owner();
    const sam = await account("Sam Ibekwe");
    const priya = await account("Priya Nair");
    const ines = await account("Ines Costa");
    const flat = await thread(me, "Flat admin");
    await join(flat, sam);
    await join(flat, priya);
    await join(flat, ines);
    const lone = await thread(me, "Lisbon trip");
    const a = await row(me, loose, "Boiler receipt");
    const b = await row(me, loose, "Hotels near Alfama");
    await moveSuggestion(me, { contentId: a }, flat);
    await moveSuggestion(me, { contentId: b }, lone);
    await db.updateTable("threads").set({ name: "Flat, admin" }).where("id", "=", flat).execute();

    const rows = (await threads(me)).loose!.rows;
    const byTitle = Object.fromEntries(rows.map((item) => [titleOf(item), item.suggestion]));
    const shared = byTitle["Boiler receipt"] as Extract<Suggestion, { kind: "move" }>;
    expect(shared.thread.name).toBe("Flat, admin");
    expect(shared.faces).toHaveLength(2);
    expect(shared.more).toBe(1);
    const alone = byTitle["Hotels near Alfama"] as Extract<Suggestion, { kind: "move" }>;
    expect(alone.faces).toEqual([]);
    expect(alone.more).toBe(0);
  });

  it("does not draw a Move to whose thread was left or deleted", async () => {
    const { me, loose } = await owner();
    const left = await thread(me, "Left");
    const gone = await thread(me, "Gone");
    const a = await row(me, loose, "A");
    const b = await row(me, loose, "B");
    await moveSuggestion(me, { contentId: a }, left);
    await moveSuggestion(me, { contentId: b }, gone);
    await db.updateTable("thread_members").set({ state: "left" }).where("thread_id", "=", left).execute();
    await db.updateTable("threads").set({ deleted_at: new Date() }).where("id", "=", gone).execute();
    expect((await threads(me)).loose!.rows.map((item) => item.suggestion)).toEqual([null, null]);
  });

  it("draws a Create on every live target with the count, and on none below two", async () => {
    const { me, loose } = await owner();
    const p = await proposal(me, "Kitchen shelves");
    const a = await row(me, loose, "Oak brackets");
    const b = await row(me, loose, "Wall plugs", { type: "link" });
    const n = await note(me, loose, "Alcove is 92cm wide");
    await createSuggestion(me, { contentId: a }, p);
    await createSuggestion(me, { contentId: b }, p);
    await createSuggestion(me, { noteId: n }, p);

    let rows = (await threads(me)).loose!.rows;
    expect(rows.every((item) => item.suggestion?.kind === "create" && item.suggestion.proposal.count === 3)).toBe(true);

    await db.updateTable("content").set({ deleted_at: new Date() }).where("id", "=", a).execute();
    rows = (await threads(me)).loose!.rows;
    expect(rows.map((item) => (item.suggestion?.kind === "create" ? item.suggestion.proposal.count : null))).toEqual([2, 2]);

    await db.updateTable("content").set({ thread_id: await thread(me, "Elsewhere") }).where("id", "=", b).execute();
    rows = (await threads(me)).loose!.rows;
    expect(rows.map((item) => item.suggestion)).toEqual([null]);
  });

  it("does not draw an accepted suggestion or a spent proposal", async () => {
    const { me, loose } = await owner();
    const home = await thread(me, "Flat admin");
    const p = await proposal(me);
    const a = await row(me, loose, "A");
    const b = await row(me, loose, "B");
    const c = await row(me, loose, "C");
    const s = await moveSuggestion(me, { contentId: a }, home);
    await createSuggestion(me, { contentId: b }, p);
    await createSuggestion(me, { contentId: c }, p);
    await db.updateTable("suggestions").set({ accepted_at: new Date() }).where("id", "=", s).execute();
    await db.updateTable("thread_proposals").set({ spent_at: new Date() }).where("id", "=", p).execute();
    expect((await threads(me)).loose!.rows.map((item) => item.suggestion)).toEqual([null, null, null]);
  });
});
