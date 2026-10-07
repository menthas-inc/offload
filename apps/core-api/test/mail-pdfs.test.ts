// 041. A forwarded email's PDFs: the rules, the look's claim, and what
// Activity names.
//
// AC-22  a PDF goes on to the look when it is a PDF by its header, under the
//        size and page bounds and not locked; at most two it says yes to are
//        kept, in the email's order.
// AC-23  an email's message holds ten kept files, two of them PDFs, PDFs
//        claimed first.
// AC-24  Activity names a PDF the rules refused, a third yes, or a failed
//        look; never one the look declined.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { receiveMail } from "../src/mail-in/receive.js";
import { resetObjectStore } from "../src/blobs/store.js";
import { pdfCandidatesOf } from "../src/mail-in/images.js";
import { wipe } from "./labels-kit.js";
import { DOMAIN, person, resolver, signed, withPdfs } from "./mail-kit.js";

await migrate(() => {});
const HERE = dirname(fileURLToPath(import.meta.url));
const pdf = (name: string) => readFileSync(join(HERE, "fixtures/pdfs", name));

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

let jo: string;
beforeEach(async () => {
  resetObjectStore();
  await sql`delete from mail_signatures`.execute(db);
  await db.deleteFrom("blobs").execute();
  await wipe();
  jo = await person(`jo@${DOMAIN}`);
});

async function mail(pdfs: Buffer[], images = 0) {
  await receiveMail(await signed(withPdfs(pdfs, images)), { resolver: resolver() });
  const job = await db
    .selectFrom("jobs")
    .select(["id", "payload"])
    .where("account_id", "=", jo)
    .where("kind", "=", "dump.answer")
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirstOrThrow();
  const { messageId, mailLook } = job.payload as { messageId: string; mailLook?: string[] };
  return { jobId: job.id, messageId, look: mailLook ?? [] };
}

const look = (messageId: string, jobId: string, keep: string[], failed = false) =>
  app.inject({
    method: "POST",
    url: `/internal/v1/messages/${messageId}/look`,
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload: { jobId, keep, ...(failed ? { failed: true } : {}) },
  });

const leftOut = async (messageId: string) => {
  const row = await db.selectFrom("messages").select("attrs").where("id", "=", messageId).executeTakeFirstOrThrow();
  return (row.attrs as { mail: { leftOut: Record<string, number> } }).mail.leftOut;
};

const kinds = async (ids: string[]) =>
  (await db.selectFrom("blobs").select(["id", "kind"]).where("id", "in", ids).execute()).reduce<Record<string, string>>(
    (out, row) => ({ ...out, [row.id]: row.kind }),
    {},
  );

describe("the rules", () => {
  it("seal a real PDF as a candidate with its pages, and count a locked one as left out", async () => {
    const { look: ids, messageId } = await mail([pdf("boarding.pdf"), pdf("locked.pdf")]);
    expect(ids).toHaveLength(1);
    const row = await db.selectFrom("blobs").select(["kind", "pages", "message_id"]).where("id", "=", ids[0]!).executeTakeFirstOrThrow();
    expect(row).toEqual({ kind: "pdf", pages: 1, message_id: null });
    expect(await leftOut(messageId)).toEqual({ pdf: 1 });
  });

  it("stop at the budget and count the rest as left out", async () => {
    const result = await pdfCandidatesOf([pdf("boarding.pdf"), pdf("boarding.pdf")], { budgetMs: 0 });
    expect(result).toEqual({ candidates: [], leftOut: 2 });
  });

  it("count a thousand and one pages as left out", async () => {
    const result = await pdfCandidatesOf([pdf("pages1001.pdf"), pdf("restricted.pdf")]);
    expect(result.leftOut).toBe(1);
    expect(result.candidates.map((c) => c.pages)).toEqual([1]);
  });
});

describe("the look's claim", () => {
  it("claims PDFs first, two at most, then images up to ten, and names a third yes in Activity", async () => {
    const { jobId, messageId, look: ids } = await mail([pdf("boarding.pdf"), pdf("restricted.pdf"), pdf("boarding.pdf")], 9);
    const byKind = await kinds(ids);
    const pdfs = ids.filter((id) => byKind[id] === "pdf");
    const images = ids.filter((id) => byKind[id] === "image");
    expect(pdfs).toHaveLength(3);
    expect(images).toHaveLength(9);

    const res = await look(messageId, jobId, ids);
    expect(res.statusCode).toBe(200);
    expect(res.json().kept).toEqual([...pdfs.slice(0, 2), ...images.slice(0, 8)]);
    expect(await leftOut(messageId)).toEqual({ pdf: 1 });
  });

  it("drops a PDF the look declined without naming it", async () => {
    const { jobId, messageId, look: ids } = await mail([pdf("boarding.pdf"), pdf("restricted.pdf")]);
    const res = await look(messageId, jobId, [ids[1]!]);
    expect(res.json().kept).toEqual([ids[1]]);
    expect(await leftOut(messageId)).toEqual({});
    const dropped = await db.selectFrom("blobs").select("deleted_at").where("id", "=", ids[0]!).executeTakeFirstOrThrow();
    expect(dropped.deleted_at).not.toBeNull();
  });

  it("names every PDF when the look failed", async () => {
    const { jobId, messageId } = await mail([pdf("boarding.pdf"), pdf("restricted.pdf")], 1);
    const res = await look(messageId, jobId, [], true);
    expect(res.json().kept).toEqual([]);
    expect(await leftOut(messageId)).toEqual({ pdf: 2 });
  });

  it("makes a wordless email that kept only PDFs a file message", async () => {
    await receiveMail(await signed(withPdfs([pdf("boarding.pdf")], 0, "")), { resolver: resolver() });
    const job = await db.selectFrom("jobs").select(["id", "payload"]).where("account_id", "=", jo).where("kind", "=", "dump.answer").executeTakeFirstOrThrow();
    const { messageId, mailLook } = job.payload as { messageId: string; mailLook: string[] };
    await look(messageId, job.id, mailLook);
    const message = await db.selectFrom("messages").select("type").where("id", "=", messageId).executeTakeFirstOrThrow();
    expect(message.type).toBe("file");
  });
});
