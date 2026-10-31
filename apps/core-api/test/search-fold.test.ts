// 049. Accents fold in the one index both searches read.
//
// AC-5   *cafe* finds Café, *sao paulo* finds São Paulo, in rows, notes and
//        messages; the model's own reads find them too; nothing that matched
//        before stops matching.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { listContent, search } from "../src/search/read.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

let accountId: string;
let threadId: string;

beforeEach(async () => {
  await db.deleteFrom("content_chunks").execute();
  await db.deleteFrom("note_chunks").execute();
  await db.deleteFrom("message_chunks").execute();
  await db.deleteFrom("notes").execute();
  await db.deleteFrom("content").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();

  accountId = (
    await db
      .insertInto("accounts")
      .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7() })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
  threadId = (
    await db.insertInto("threads").values({ created_by_account_id: accountId, name: "São Paulo" }).returning("id").executeTakeFirstOrThrow()
  ).id;
  await db.insertInto("thread_members").values({ thread_id: threadId, account_id: accountId, state: "accepted" }).execute();
});

async function row(title: string, body: string | null = null): Promise<string> {
  const inserted = await db
    .insertInto("content")
    .values({ thread_id: threadId, account_id: accountId, title, body, type: "link" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return inserted.id;
}

const matches = async (table: "content" | "notes" | "messages", id: string, query: string) =>
  (
    await sql<{ hit: boolean }>`select search_text @@ websearch_to_tsquery('offload_search', ${query}) as hit
      from ${sql.table(table)} where id = ${id}::uuid`.execute(db)
  ).rows[0]?.hit;

describe("accents fold", () => {
  it("in rows, notes and messages", async () => {
    const content = await row("Café Lisboa", "Rua de São Bento");
    const note = await db
      .insertInto("notes")
      .values({ scope: "thread", subject_id: threadId, account_id: accountId, kind: "standing", text: "The café opens at nine", origin: "stated" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const chat = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
    const message = await db
      .insertInto("messages")
      .values({ conversation_id: chat.id, account_id: accountId, role: "person", turn_id: uuidv7(), text: "Pão de queijo for the café", state: "answered" })
      .returning("id")
      .executeTakeFirstOrThrow();

    expect(await matches("content", content, "cafe")).toBe(true);
    expect(await matches("content", content, "sao bento")).toBe(true);
    expect(await matches("content", content, "café")).toBe(true);
    expect(await matches("notes", note.id, "cafe")).toBe(true);
    expect(await matches("messages", message.id, "pao")).toBe(true);
  });

  it("nothing that matched before stops matching", async () => {
    const titles = ["Flight to Lisbon TP1351", "wifi password", "naïve résumé", "e-mail Ana's draft", "Ünïcödé 2026"];
    const ids = await Promise.all(titles.map((title) => row(title)));
    for (const [i, title] of titles.entries()) {
      for (const word of title.split(/\s+/)) {
        const before = (
          await sql<{ hit: boolean }>`select to_tsvector('simple', ${title}) @@ websearch_to_tsquery('simple', ${word}) as hit`.execute(db)
        ).rows[0]?.hit;
        if (before) expect(await matches("content", ids[i]!, word), `${word} in ${title}`).toBe(true);
      }
    }
  });

  it("the model's reads find an accented row from a plain query and back", async () => {
    await row("Café Lisboa");
    await row("Cafe list");
    const found = await search(accountId, { query: "cafe" });
    expect(found.rows.map((r) => r.title).sort()).toEqual(["Cafe list", "Café Lisboa"]);
    const listed = await listContent(accountId, { threadId, matching: "café" });
    expect(listed?.rows.map((r) => r.title).sort()).toEqual(["Cafe list", "Café Lisboa"]);
  });
});
