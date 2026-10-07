// 041. PDFs: a third kind of blob, the locked and page checks before any
// write, the claim's caps, the clean copy's scan, the route that serves it,
// the row, the mail look's claim, the export.
//
// AC-5   ten files a message, two of them PDFs, counted by kind.
// AC-6   20 MB and a thousand pages; neither a photo nor a PDF by its bytes.
// AC-7   a locked PDF is never stored; an owner-password one is taken.
// AC-8   a PDF counts toward the daily ceiling.
// AC-9   the wire says which files are PDFs.
// AC-12  the Core API refuses a clean copy that fails its scan.
// AC-13  only the clean copy is served, to the dumper and members, with the
//        headers that keep it from running as offload.
// AC-14  no clean copy, nothing served.
// AC-16  a PDF the turn did not file is filed by the server as A PDF.
// AC-17  the page count ends the body.
// AC-22  AC-23  AC-24  the mail look's claim and what Activity names.
// AC-26  a rename changes the name of what opens next.
// AC-28  the export holds the clean copy.
// AC-29  purge removes four objects.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";
import { clearSettingsCache } from "../src/settings.js";
import { takeDump } from "../src/routes/dumps.js";
import { objectKey, objectStore, resetObjectStore } from "../src/blobs/store.js";
import { sniff } from "../src/blobs/photos.js";
import { inspectPdf } from "../src/blobs/pdf-inspect.js";
import { cleanCopyPasses, KILL } from "../src/blobs/pdf-scan.js";
import { pdfFileName } from "../src/blobs/pdf-name.js";

await migrate(() => {});

const HERE = dirname(fileURLToPath(import.meta.url));
const pdf = (name: string) => readFileSync(join(HERE, "fixtures/pdfs", name));
const photo = (name: string) => readFileSync(join(HERE, "fixtures/photos", name));

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  resetObjectStore();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("questions").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("blobs").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function person(): Promise<{ id: string; defaultThreadId: string }> {
  const outcome = await promote(`${uuidv7()}@example.test`);
  if (outcome.status !== "invited") throw new Error(outcome.status);
  await db.updateTable("accounts").set({ state: "active" }).where("id", "=", outcome.accountId).execute();
  const row = await db
    .selectFrom("accounts")
    .select("default_thread_id")
    .where("id", "=", outcome.accountId)
    .executeTakeFirstOrThrow();
  return { id: outcome.accountId, defaultThreadId: row.default_thread_id! };
}

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3600_000) })
    .execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

function form(file: Buffer, filename: string, type: string, clientKey = uuidv7()): FormData {
  const data = new FormData();
  data.append("clientKey", clientKey);
  data.append("name", filename);
  data.append("file", new Blob([new Uint8Array(file)], { type }), filename);
  return data;
}

async function upload(cookie: string, file: Buffer, filename = "boarding.pdf", type = "application/pdf", clientKey = uuidv7()) {
  return app.inject({ method: "POST", url: "/v1/blobs", headers: { cookie }, payload: form(file, filename, type, clientKey) });
}

describe("the migration", () => {
  it("takes a pdf blob with pages and no dimensions, and nothing else shaped like one", async () => {
    const me = await person();
    const insert = (values: Record<string, unknown>) =>
      db
        .insertInto("blobs")
        .values({
          account_id: me.id,
          client_key: uuidv7(),
          content_type: "application/pdf",
          byte_size: 10,
          sha256: Buffer.alloc(32),
          ...values,
        } as never)
        .execute();
    await insert({ kind: "pdf", pages: 3 });
    await expect(insert({ kind: "pdf", pages: null })).rejects.toThrow(/blobs_kind_shape_check/);
    await expect(insert({ kind: "pdf", pages: 3, width: 10, height: 10 })).rejects.toThrow(/blobs_kind_shape_check/);
    await expect(insert({ kind: "pdf", pages: 1001 })).rejects.toThrow(/blobs_pages_check/);
    await expect(insert({ kind: "image", width: 10, height: 10, pages: 2 })).rejects.toThrow(/blobs_kind_shape_check/);
  });

  it("lets the worker read pages and clean_at", async () => {
    const grants = await sql<{ column_name: string }>`
      select column_name from information_schema.column_privileges
      where table_name = 'blobs' and grantee = 'offload_agent' and privilege_type = 'SELECT'
        and column_name in ('pages', 'clean_at')`.execute(db);
    expect(grants.rows.map((r) => r.column_name).sort()).toEqual(["clean_at", "pages"]);
  });
});

describe("the sniff", () => {
  it("knows a PDF by its first bytes and nothing else", () => {
    expect(sniff(pdf("boarding.pdf"))).toBe("application/pdf");
    expect(sniff(pdf("offset.pdf"))).toBeNull();
    expect(sniff(photo("plain.jpg"))).toBe("image/jpeg");
  });
});

describe("the inspection", () => {
  it("counts pages", async () => {
    expect(await inspectPdf(pdf("boarding.pdf"))).toEqual({ pages: 1 });
  });

  it("calls a PDF that needs a password locked, and one that only restricts printing a PDF", async () => {
    expect(await inspectPdf(pdf("locked.pdf"))).toEqual({ refused: "locked" });
    expect(await inspectPdf(pdf("restricted.pdf"))).toEqual({ pages: 1 });
  });

  it("refuses over a thousand pages", async () => {
    expect(await inspectPdf(pdf("pages1001.pdf"))).toEqual({ refused: "too_many_pages" });
  });

  it("calls a PDF with no pages unreadable, since a row needs at least one", async () => {
    const objects = [
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
      "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n",
    ];
    let body = "%PDF-1.7\n";
    const offsets = objects.map((object) => {
      const at = body.length;
      body += object;
      return at;
    });
    const xref = body.length;
    body += `xref\n0 3\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, "0")} 00000 n \n`).join("")}`;
    body += `trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    expect(await inspectPdf(Buffer.from(body))).toEqual({ refused: "unreadable" });
  });

  it("calls anything it cannot read unreadable, and a slow read too", async () => {
    expect(await inspectPdf(Buffer.from("%PDF-1.7\nnot really a pdf at all"))).toEqual({ refused: "unreadable" });
    expect(await inspectPdf(pdf("boarding.pdf"), { timeoutMs: 1 })).toEqual({ refused: "unreadable" });
  });
});

describe("the upload", () => {
  it("stores a PDF sealed, as a pdf blob with its pages and no dimensions", async () => {
    const me = await person();
    const res = await upload(await signIn(me.id), pdf("boarding.pdf"), "Boarding pass TAP.pdf");
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ blobId: expect.any(String), kind: "pdf", pages: 1 });
    const row = await db.selectFrom("blobs").selectAll().where("id", "=", res.json().blobId).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ kind: "pdf", content_type: "application/pdf", pages: 1, width: null, height: null });
    const sealed = await objectStore()!.get(objectKey(row.id, "original"));
    expect(sealed!.subarray(0, 5).toString("latin1")).not.toBe("%PDF-");
  });

  it("answers a photo with its kind too", async () => {
    const me = await person();
    const res = await upload(await signIn(me.id), photo("plain.jpg"), "a.jpg", "image/jpeg");
    expect(res.json()).toMatchObject({ kind: "image", width: expect.any(Number) });
  });

  it("never stores a locked PDF", async () => {
    const me = await person();
    const res = await upload(await signIn(me.id), pdf("locked.pdf"));
    expect(res.statusCode).toBe(415);
    expect(res.json()).toEqual({ error: "locked_pdf" });
    expect(await db.selectFrom("blobs").select("id").execute()).toEqual([]);
  });

  it("refuses over a cap before it opens the PDF at all", async () => {
    // Opening a stranger's PDF is the expensive step; an account that cannot
    // store anything more does not get to make the server do it.
    const me = await person();
    await db.insertInto("account_limits").values({ account_id: me.id, key: "cap.storage_bytes", value: 1024 * 1024 }).execute();
    await db
      .insertInto("blobs")
      .values({ account_id: me.id, client_key: uuidv7(), content_type: "image/jpeg", byte_size: 1024 * 1024, width: 1, height: 1, sha256: Buffer.alloc(32) } as never)
      .execute();
    const res = await upload(await signIn(me.id), pdf("locked.pdf"));
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: "storage_full" });
  });

  it("takes a PDF that only restricts printing", async () => {
    const me = await person();
    expect((await upload(await signIn(me.id), pdf("restricted.pdf"))).statusCode).toBe(201);
  });

  it("calls a thousand and one pages too big, and writes nothing", async () => {
    const me = await person();
    const res = await upload(await signIn(me.id), pdf("pages1001.pdf"));
    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ error: "too_big" });
    expect(await db.selectFrom("blobs").select("id").execute()).toEqual([]);
  });

  it("goes by the bytes: a PDF behind other bytes is neither, a PDF declared a JPEG is a PDF", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    expect((await upload(cookie, pdf("offset.pdf"))).statusCode).toBe(415);
    const disguised = await upload(cookie, pdf("boarding.pdf"), "photo.jpg", "image/jpeg");
    expect(disguised.statusCode).toBe(201);
    expect(disguised.json().kind).toBe("pdf");
  });

  it("returns the same PDF for a repeated client key", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const key = uuidv7();
    const first = await upload(cookie, pdf("boarding.pdf"), "a.pdf", "application/pdf", key);
    const again = await upload(cookie, pdf("boarding.pdf"), "a.pdf", "application/pdf", key);
    expect(again.json()).toEqual(first.json());
    expect((await db.selectFrom("blobs").select("id").execute()).length).toBe(1);
  });

  it("counts a PDF toward the day's ceiling", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    await db.insertInto("app_settings").values({ key: "cap.photos", value: "1", updated_by_account_id: null }).execute();
    clearSettingsCache();
    try {
      expect((await upload(cookie, pdf("boarding.pdf"))).statusCode).toBe(201);
      const second = await upload(cookie, photo("plain.jpg"), "a.jpg", "image/jpeg");
      expect(second.statusCode).toBe(429);
    } finally {
      await db.deleteFrom("app_settings").where("key", "=", "cap.photos").execute();
      clearSettingsCache();
    }
  });
});

describe("the claim", () => {
  async function blobs(cookie: string, pdfs: number, photos: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < pdfs; i++) ids.push((await upload(cookie, pdf("boarding.pdf"))).json().blobId);
    for (let i = 0; i < photos; i++) ids.push((await upload(cookie, photo("plain.jpg"), "a.jpg", "image/jpeg")).json().blobId);
    return ids;
  }

  it("refuses a third PDF and claims nothing", async () => {
    const me = await person();
    const ids = await blobs(await signIn(me.id), 3, 0);
    await expect(takeDump(me.id, "", uuidv7(), undefined, { blobIds: ids, viaShare: false })).rejects.toThrow(/too_many_pdfs/);
    const claimed = await db.selectFrom("blobs").select("id").where("message_id", "is not", null).execute();
    expect(claimed).toEqual([]);
  });

  it("counts PDFs and photos together toward ten", async () => {
    const me = await person();
    const ids = await blobs(await signIn(me.id), 2, 9);
    await expect(takeDump(me.id, "", uuidv7(), undefined, { blobIds: ids, viaShare: false })).rejects.toThrow(/too_many_photos/);
  });

  it("makes PDFs with no words a file message, and counts them in the event", async () => {
    const me = await person();
    const ids = await blobs(await signIn(me.id), 2, 0);
    const sent = await takeDump(me.id, "", uuidv7(), undefined, { blobIds: ids, viaShare: false });
    const message = await db.selectFrom("messages").select("type").where("id", "=", sent.messageId).executeTakeFirstOrThrow();
    expect(message.type).toBe("file");
    const event = await db.selectFrom("analytics_events").select("properties").where("name", "=", "dump_sent").executeTakeFirstOrThrow();
    expect(event.properties).toMatchObject({ pdfs: 2, pdf_pages: 2 });
    expect(JSON.stringify(event.properties)).not.toContain("boarding");
  });
});

// ------------------------------------------------------------ the clean copy and its route

const internal = { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` };

async function jobOf(messageId: string): Promise<string> {
  const rows = await db.selectFrom("jobs").select(["id", "payload"]).where("kind", "=", "dump.answer").execute();
  const job = rows.find((row) => (row.payload as { messageId?: string }).messageId === messageId);
  if (!job) throw new Error("no job");
  await db
    .updateTable("jobs")
    .set({ state: "running", locked_at: new Date(), locked_by: "test", attempts: 1 })
    .where("id", "=", job.id)
    .execute();
  return job.id;
}

async function postRenditions(jobId: string, blobId: string, clean: Buffer | null, pages = "1", thumb = photo("plain.jpg")) {
  const data = new FormData();
  data.append("thumb", new Blob([new Uint8Array(thumb)], { type: "image/jpeg" }), "thumb.jpg");
  data.append("large", new Blob([new Uint8Array(photo("plain.jpg"))], { type: "image/jpeg" }), "large.jpg");
  if (clean) data.append("clean", new Blob([new Uint8Array(clean)], { type: "application/pdf" }), "clean.pdf");
  data.append("pages", pages);
  return app.inject({ method: "POST", url: `/internal/v1/blobs/${blobId}/renditions?jobId=${jobId}`, headers: internal, payload: data });
}

/** A PDF uploaded and claimed by a dump, its job running. */
async function sentPdf(me: { id: string }, file = "boarding.pdf", name = "Boarding pass TAP.pdf") {
  const cookie = await signIn(me.id);
  const blobId = (await upload(cookie, pdf(file), name)).json().blobId as string;
  const sent = await takeDump(me.id, "", uuidv7(), undefined, { blobIds: [blobId], viaShare: false });
  return { cookie, blobId, jobId: await jobOf(sent.messageId), messageId: sent.messageId };
}

describe("the clean copy, posted", () => {
  it("is sealed under the blob's key at its own object, with clean_at and pages", async () => {
    const me = await person();
    const { blobId, jobId } = await sentPdf(me);
    const res = await postRenditions(jobId, blobId, pdf("clean.pdf"));
    expect(res.statusCode).toBe(200);
    const sealed = await objectStore()!.get(objectKey(blobId, "clean"));
    expect(sealed).not.toBeNull();
    expect(sealed!.subarray(0, 5).toString("latin1")).not.toBe("%PDF-");
    const row = await db.selectFrom("blobs").select(["clean_at", "renditions_at", "pages"]).where("id", "=", blobId).executeTakeFirstOrThrow();
    expect(row.clean_at).not.toBeNull();
    expect(row.renditions_at).not.toBeNull();
    expect(row.pages).toBe(1);
  });

  it.each(["hostile.pdf", "objstm.pdf", "incremental.pdf", "locked.pdf", "boarding.pdf"])(
    "refuses %s posted as a clean copy, and stores nothing",
    async (name) => {
      const me = await person();
      const { blobId, jobId } = await sentPdf(me);
      const res = await postRenditions(jobId, blobId, pdf(name));
      expect(res.statusCode).toBe(415);
      expect(res.json()).toEqual({ error: "not_a_rendition" });
      expect(await objectStore()!.get(objectKey(blobId, "clean"))).toBeNull();
      const row = await db.selectFrom("blobs").select("clean_at").where("id", "=", blobId).executeTakeFirstOrThrow();
      expect(row.clean_at).toBeNull();
    },
  );

  // A dictionary hidden where this scan sees stream data and a viewer does
  // not: a viewer that takes the last /Length, or that finds the stream's end
  // by searching for `endstream`, reads the script as an object.
  function smuggled(lengths: string): Buffer {
    const hidden = "q Q\nendstream\nendobj\n5 0 obj\n<< /S /JavaScript /JS (app.alert(1)) >>\nendobj\n";
    const data = hidden.padEnd(200, " ");
    const body =
      "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>\nendobj\n" +
      `4 0 obj\n<< ${lengths} >>\nstream\n${data}\nendstream\nendobj\n`;
    return Buffer.from(`${body}xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`, "latin1");
  }

  it("kills the same names as the worker, actions that play media or reach out included", () => {
    const worker = readFileSync(new URL("../../agent/src/offload_agent/pdfs.py", import.meta.url), "utf8");
    const block = /^KILL = frozenset\(\n([\s\S]*?)\n\)/m.exec(worker)![1]!;
    const names = [...block.matchAll(/"\/([^"]+)"/g)].map((m) => m[1]!);
    expect(names.sort()).toEqual([...KILL].sort());
    for (const name of ["Rendition", "URL", "SetOCGState"]) expect(KILL.has(name)).toBe(true);
  });

  it("refuses a stream with two lengths, or whose data holds its own end", () => {
    expect(cleanCopyPasses(smuggled("/Length 200 /Length 4"))).toBe(false);
    expect(cleanCopyPasses(smuggled("/Length 200"))).toBe(false);
    expect(cleanCopyPasses(pdf("clean.pdf"))).toBe(true);
  });

  it("keeps a picture to a photo's size though a clean copy may be larger", async () => {
    const me = await person();
    const { blobId, jobId } = await sentPdf(me);
    const huge = Buffer.concat([photo("plain.jpg"), Buffer.alloc(21 * 1024 * 1024)]);
    expect((await postRenditions(jobId, blobId, pdf("clean.pdf"), "1", huge)).statusCode).toBe(415);
  });

  it("takes a clean copy whose stream data happens to hold the bytes of a script", async () => {
    const me = await person();
    const { blobId, jobId } = await sentPdf(me);
    expect((await postRenditions(jobId, blobId, pdf("clean-stream-names.pdf"))).statusCode).toBe(200);
  });

  it("needs a clean copy for a PDF, and refuses one for a photo", async () => {
    const me = await person();
    const { blobId, jobId } = await sentPdf(me);
    expect((await postRenditions(jobId, blobId, null)).statusCode).toBe(400);

    const cookie = await signIn(me.id);
    const photoId = (await upload(cookie, photo("plain.jpg"), "a.jpg", "image/jpeg")).json().blobId as string;
    const sent = await takeDump(me.id, "", uuidv7(), undefined, { blobIds: [photoId], viaShare: false });
    const res = await postRenditions(await jobOf(sent.messageId), photoId, pdf("clean.pdf"));
    expect(res.statusCode).toBe(415);
  });

  it("is one of the four objects a purge removes", async () => {
    const { RENDITIONS } = await import("../src/blobs/store.js");
    expect([...RENDITIONS].sort()).toEqual(["clean", "large", "original", "thumb"]);
  });
});

describe("GET /v1/blobs/:id/pdf", () => {
  const get = (cookie: string, id: string) => app.inject({ method: "GET", url: `/v1/blobs/${id}/pdf`, headers: { cookie } });

  async function ready(me: { id: string }) {
    const sent = await sentPdf(me);
    expect((await postRenditions(sent.jobId, sent.blobId, pdf("clean.pdf"))).statusCode).toBe(200);
    return sent;
  }

  it("serves the dumper the clean copy, never the original, with every header that keeps it inert", async () => {
    const me = await person();
    const { cookie, blobId } = await ready(me);
    const res = await get(cookie, blobId);
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(pdf("clean.pdf"))).toBe(true);
    expect(res.rawPayload.equals(pdf("boarding.pdf"))).toBe(false);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBe("sandbox");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-site");
    expect(res.headers["accept-ranges"]).toBe("none");
    // The dumper's own name for it.
    expect(res.headers["content-disposition"]).toBe(
      `inline; filename="Boarding pass TAP.pdf"; filename*=UTF-8''Boarding%20pass%20TAP.pdf`,
    );
  });

  it("serves a member the row's title, made safe for a header, and follows a rename", async () => {
    const me = await person();
    const other = await person();
    const { blobId, messageId } = await ready(me);
    const shared = await db
      .insertInto("threads")
      .values({ created_by_account_id: me.id, name: "Lisbon trip", last_activity_at: sql`now()`, updated_at: sql`now()` })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db.insertInto("thread_members").values([
      { thread_id: shared.id, account_id: me.id, state: "accepted" },
      { thread_id: shared.id, account_id: other.id, state: "accepted" },
    ]).execute();
    const row = await db
      .insertInto("content")
      .values({
        thread_id: shared.id,
        account_id: me.id,
        type: "file",
        title: 'Boarding pass "TP1336"\r\nSet-Cookie: x=1 / ção',
        derived_from_message_id: messageId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db.insertInto("content_blobs").values({ content_id: row.id, blob_id: blobId, created_at: new Date() }).execute();

    const res = await get(await signIn(other.id), blobId);
    expect(res.statusCode).toBe(200);
    const disposition = String(res.headers["content-disposition"]);
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(disposition).toBe(
      `inline; filename="Boarding pass TP1336 Set-Cookie x=1 cao.pdf"; filename*=UTF-8''Boarding%20pass%20TP1336%20Set-Cookie%20x%3D1%20%C3%A7%C3%A3o.pdf`,
    );

    await db.updateTable("content").set({ title: "Flight home" }).where("id", "=", row.id).execute();
    const renamed = await get(await signIn(other.id), blobId);
    expect(renamed.headers["content-disposition"]).toBe(`inline; filename="Flight home.pdf"; filename*=UTF-8''Flight%20home.pdf`);

    // Out of the thread, out of reach.
    await db.updateTable("content").set({ thread_id: me.defaultThreadId }).where("id", "=", row.id).execute();
    expect((await get(await signIn(other.id), blobId)).statusCode).toBe(404);
  });

  it("is 404 for a stranger, for a PDF with no clean copy, and for a photo", async () => {
    const me = await person();
    const stranger = await person();
    const { blobId } = await ready(me);
    expect((await get(await signIn(stranger.id), blobId)).statusCode).toBe(404);

    const unclean = await sentPdf(me);
    expect((await get(unclean.cookie, unclean.blobId)).statusCode).toBe(404);

    const cookie = await signIn(me.id);
    const photoId = (await upload(cookie, photo("plain.jpg"), "a.jpg", "image/jpeg")).json().blobId as string;
    expect((await get(cookie, photoId)).statusCode).toBe(404);
  });

  it("names the file without line breaks or direction marks a title can carry", () => {
    // U+2028 and U+0085 break a line in some viewers; U+202E turns
    // "Invoice\u202Efdp.exe" into a name that reads as something else.
    expect(pdfFileName("Invoice\u2028Paid\u0085now")).toBe("Invoice Paid now.pdf");
    expect(pdfFileName("Invoice\u202Eexe.pdf")).toBe("Invoice exe.pdf");
    expect(pdfFileName("a\u200Eb\u2066c\u2069\uFEFF")).toBe("a b c.pdf");
  });

  it("answers HEAD, which the web's Retry asks before it opens a tab on it", async () => {
    const me = await person();
    const { blobId, cookie } = await ready(me);
    const head = (id: string) => app.inject({ method: "HEAD", url: `/v1/blobs/${id}/pdf`, headers: { cookie } });
    const res = await head(blobId);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-security-policy"]).toBe("sandbox");
    expect(res.rawPayload.length).toBe(0);
    const unclean = await sentPdf(me);
    expect((await head(unclean.blobId)).statusCode).toBe(404);
  });

  it("serves no original, to anybody", async () => {
    const me = await person();
    const { cookie, blobId } = await ready(me);
    const res = await app.inject({ method: "GET", url: `/v1/blobs/${blobId}/original`, headers: { cookie } });
    expect(res.statusCode).not.toBe(200);
  });
});

// ------------------------------------------------------------ the row

const tool = (payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/internal/v1/tool-call", headers: internal, payload });
const turnResult = (payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/internal/v1/turn-result", headers: internal, payload });
const goodUsage = [{ model: "claude-sonnet-5", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, costMicros: 1, latencyMs: 1 }];

/** Photos and PDFs on one message, claimed, renditions posted. */
async function sentMixed(me: { id: string }, files: string[], text = "") {
  const cookie = await signIn(me.id);
  const blobIds: string[] = [];
  for (const file of files) {
    const isPdf = file.endsWith(".pdf");
    const res = isPdf ? await upload(cookie, pdf(file), file) : await upload(cookie, photo(file), file, "image/jpeg");
    expect(res.statusCode).toBe(201);
    blobIds.push(res.json().blobId);
  }
  const sent = await takeDump(me.id, text, uuidv7(), undefined, { blobIds, viaShare: false });
  const jobId = await jobOf(sent.messageId);
  for (const [at, blobId] of blobIds.entries()) {
    const res = await postRenditions(jobId, blobId, files[at]!.endsWith(".pdf") ? pdf("clean.pdf") : null, "12");
    expect(res.statusCode).toBe(200);
  }
  return { cookie, blobIds, jobId, messageId: sent.messageId };
}

describe("the PDF's row", () => {
  it("links the PDF by its own index, wraps the thread, and ends the body with the page count", async () => {
    const me = await person();
    const { jobId, blobIds } = await sentMixed(me, ["plain.jpg", "boarding.pdf", "boarding.pdf"]);
    const first = await tool({ tool: "add_content", jobId, toolCallId: "c1", threadId: me.defaultThreadId, title: "Boarding pass", body: "To travel with.", type: "file", pdf: 2 });
    expect(first.json().ok).toBe(true);
    const row = await db.selectFrom("content").selectAll().where("id", "=", first.json().contentId).executeTakeFirstOrThrow();
    expect(row.body).toBe("To travel with.\n\n12 pages.");
    const link = await db.selectFrom("content_blobs").selectAll().where("content_id", "=", row.id).executeTakeFirstOrThrow();
    // The second PDF, not the second file: indexes count PDFs.
    expect(link.blob_id).toBe(blobIds[2]);
  });

  it("refuses an index past the PDFs, the same PDF twice, a PDF on a task, and a photo on a file row", async () => {
    const me = await person();
    const { jobId } = await sentMixed(me, ["plain.jpg", "boarding.pdf"]);
    const call = (extra: Record<string, unknown>) =>
      tool({ tool: "add_content", jobId, toolCallId: uuidv7(), threadId: me.defaultThreadId, title: "X", ...extra });
    expect((await call({ type: "file", pdf: 2 })).json()).toEqual({ ok: false, error: "unknown_pdf" });
    expect((await call({ type: "file", pdf: 1 })).json().ok).toBe(true);
    expect((await call({ type: "file", pdf: 1 })).json()).toEqual({ ok: false, error: "unknown_pdf" });
    expect((await call({ type: "task", pdf: 1 })).json()).toEqual({ ok: false, error: "unknown_pdf" });
    expect((await call({ type: "file", photo: 1 })).json()).toEqual({ ok: false, error: "unknown_photo" });
  });

  it("is filed by the server as A PDF when the turn did not, never as A photo", async () => {
    const me = await person();
    const { jobId, messageId } = await sentMixed(me, ["plain.jpg", "boarding.pdf"]);
    await turnResult({ outcome: "answered", jobId, usage: goodUsage });
    const rows = await db
      .selectFrom("content")
      .select(["title", "type", "body"])
      .where("derived_from_message_id", "=", messageId)
      .orderBy("title")
      .execute();
    expect(rows).toEqual([
      { title: "A PDF", type: "file", body: "12 pages." },
      { title: "A photo", type: "image", body: null },
    ]);
  });

  it("says one page, not one pages", async () => {
    const me = await person();
    const { jobId } = await sentMixed(me, ["boarding.pdf"]);
    await db.updateTable("blobs").set({ pages: 1 }).execute();
    const res = await tool({ tool: "add_content", jobId, toolCallId: "c1", threadId: me.defaultThreadId, title: "Pass", body: "", type: "file", pdf: 1 });
    const row = await db.selectFrom("content").select("body").where("id", "=", res.json().contentId).executeTakeFirstOrThrow();
    expect(row.body).toBe("1 page.");
  });
});

describe("the wire", () => {
  it("says which of a message's files are PDFs, and whether one can be opened", async () => {
    const me = await person();
    const { cookie, blobIds, messageId } = await sentMixed(me, ["plain.jpg", "boarding.pdf"]);
    const tail = (await app.inject({ method: "GET", url: "/v1/conversations/current", headers: { cookie } })).json();
    const message = tail.messages.find((m: { id: string }) => m.id === messageId);
    expect(message.photos).toEqual([
      { blobId: blobIds[0], kind: "image", name: "plain.jpg", width: 320, height: 240, ready: true },
      { blobId: blobIds[1], kind: "pdf", name: "boarding.pdf", pages: 12, ready: true, openable: true, unreadable: false },
    ]);
  });

  it("earns Files with a PDF row and carries the PDF on the row", async () => {
    const me = await person();
    const { cookie, jobId, blobIds } = await sentMixed(me, ["boarding.pdf"]);
    const res = await tool({ tool: "add_content", jobId, toolCallId: "c1", threadId: me.defaultThreadId, title: "Pass", type: "file", pdf: 1 });
    const page = (await app.inject({ method: "GET", url: `/v1/threads/${me.defaultThreadId}/content`, headers: { cookie } })).json();
    const row = page.rows.find((r: { id: string }) => r.id === res.json().contentId);
    expect(row.photo).toEqual({ blobId: blobIds[0], kind: "pdf", pages: 12, ready: true, openable: true, unreadable: false });

    // One the worker could not make safe says so, so a client can tell it
    // from one still being made.
    await db.updateTable("blobs").set({ clean_at: null, renditions_at: null, unreadable_at: new Date() }).execute();
    const after = (await app.inject({ method: "GET", url: `/v1/threads/${me.defaultThreadId}/content`, headers: { cookie } })).json();
    expect(after.rows.find((r: { id: string }) => r.id === res.json().contentId).photo).toMatchObject({
      ready: false,
      openable: false,
      unreadable: true,
    });
  });
});
