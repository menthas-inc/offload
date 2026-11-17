// 035 part B. The copy itself: what is in the archive and how it is kept.
//
// AC-15 Activity says the copy is ready, with no push.
// AC-16 every readable thread, conversations, notes, people, each blob a file.
// AC-17 a shared row names who added it, or says its author is gone.
// AC-18 sealed in storage under a key storage never receives.
// AC-22 nothing in a member name, the job row or the row says what is inside.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import yauzl from "yauzl";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";
import { unwrap, wrap } from "../src/crypto/keys.js";
import { accountKey, ensureThreadWrap, mintObjectKey } from "../src/blobs/keys.js";
import { objectKey, objectStore, resetObjectStore } from "../src/blobs/store.js";
import { copyState, requestCopy } from "../src/exports/copy.js";
import { buildCopy, openCopy } from "../src/exports/build.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { wipe } from "./labels-kit.js";

await migrate(() => {});
afterAll(closeDb);

beforeEach(async () => {
  resetObjectStore();
  await db.deleteFrom("exports").execute();
  await db.deleteFrom("content_blobs").execute();
  await db.deleteFrom("blob_keys").execute();
  await db.deleteFrom("blobs").execute();
  await db.deleteFrom("connections").execute();
  await wipe();
  await db.deleteFrom("jobs").execute();
});

interface Person {
  id: string;
  defaultThreadId: string;
}

async function person(name: string): Promise<Person> {
  const outcome = await promote(`${uuidv7()}@example.test`);
  if (outcome.status !== "invited") throw new Error(outcome.status);
  const row = await db
    .updateTable("accounts")
    .set({ state: "active", display_name: name, time_zone: "Europe/Lisbon" })
    .where("id", "=", outcome.accountId)
    .returning("default_thread_id")
    .executeTakeFirstOrThrow();
  return { id: outcome.accountId, defaultThreadId: row.default_thread_id! };
}

async function thread(name: string, ...members: Person[]): Promise<string> {
  const row = await db.insertInto("threads").values({ name, created_by_account_id: members[0]!.id }).returning("id").executeTakeFirstOrThrow();
  for (const member of members) {
    await db.insertInto("thread_members").values({ thread_id: row.id, account_id: member.id, state: "accepted" }).execute();
  }
  return row.id;
}

async function row(accountId: string, threadId: string, title: string, extra: Record<string, unknown> = {}): Promise<string> {
  const made = await db
    .insertInto("content")
    .values({ account_id: accountId, thread_id: threadId, type: "task", title, source: "person", ...extra })
    .returning("id")
    .executeTakeFirstOrThrow();
  return made.id;
}

/** A photo as an upload leaves it: sealed under its own key, wrapped for the
 *  account, and for the thread when it hangs off a row there. */
async function photo(owner: Person, bytes: Buffer, on: { contentId: string; threadId: string } | { messageId: string }): Promise<string> {
  const blob = await db
    .insertInto("blobs")
    .values({
      account_id: owner.id,
      message_id: "messageId" in on ? on.messageId : null,
      client_key: uuidv7(),
      name: "IMG_4821 at home.jpg",
      content_type: "messageId" in on ? "audio/mp4" : "image/jpeg",
      kind: "messageId" in on ? "audio" : "image",
      byte_size: bytes.length,
      ...("messageId" in on ? { duration_ms: 4000 } : { width: 4, height: 3 }),
      sha256: Buffer.alloc(32),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const key = await db.transaction().execute((trx) => mintObjectKey(trx, blob.id, owner.id));
  await objectStore()!.put(objectKey(blob.id, "original"), wrap(bytes, key));
  if ("contentId" in on) {
    await db.insertInto("content_blobs").values({ content_id: on.contentId, blob_id: blob.id }).execute();
    await db.transaction().execute((trx) => ensureThreadWrap(trx, blob.id, on.threadId));
  }
  return blob.id;
}

async function said(me: Person, texts: [role: "person" | "offload", text: string][]): Promise<string[]> {
  const conversation = await db.insertInto("conversations").values({ account_id: me.id }).returning("id").executeTakeFirstOrThrow();
  const ids: string[] = [];
  for (const [role, text] of texts) {
    const message = await db
      .insertInto("messages")
      .values({ conversation_id: conversation.id, account_id: me.id, role, text, turn_id: uuidv7() })
      .returning("id")
      .executeTakeFirstOrThrow();
    ids.push(message.id);
  }
  return ids;
}

async function asked(me: Person): Promise<string> {
  const outcome = await requestCopy(me.id);
  if (!outcome.ok) throw new Error("refused");
  const made = await db.selectFrom("exports").select("id").where("account_id", "=", me.id).executeTakeFirstOrThrow();
  return made.id;
}

/** The archive as its owner downloads it, opened with an ordinary zip reader. */
async function unzip(accountId: string): Promise<Map<string, Buffer>> {
  const parts: Buffer[] = [];
  const copy = await openCopy(accountId);
  if (!copy) throw new Error("no copy");
  for await (const part of copy.parts) parts.push(part);
  const whole = Buffer.concat(parts);
  expect(whole.length).toBe(copy.byteSize);
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(whole, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const files = new Map<string, Buffer>();
      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (failed, stream) => {
          if (failed) return reject(failed);
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(files));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("a photo of the ferry timetable")]);
const VOICE = Buffer.from("a voice note about the ferry");

/** Ana, alone in one thread and sharing another with Sam, who also has a
 *  thread Ana is not in. */
async function world() {
  const ana = await person("Ana Duarte");
  const sam = await person("Sam Ibekwe");
  const [a, b] = [ana.id, sam.id].sort();
  await db.insertInto("connections").values({ account_a: a!, account_b: b! }).execute();

  const alone = await thread("Lisbon in October", ana);
  const shared = await thread("The flat", ana, sam);
  const theirs = await thread("Surprise party", sam);

  const ferry = await row(ana.id, alone, "Book the ferry <script>alert(1)</script>", { body: "Tuesday, early" });
  await row(ana.id, alone, "Old plan", { deleted_at: sql`now()`, purge_after: sql`now()` });
  await row(ana.id, alone, "Museum tickets", { archived_at: sql`now()` });
  const boiler = await row(sam.id, shared, "Call the boiler people");
  const orphan = await row(sam.id, shared, "Rent is due on the first");
  await db.updateTable("content").set({ account_id: sql`null` }).where("id", "=", orphan).execute();
  const hidden = await row(sam.id, theirs, "Cake for Ana");

  await db
    .insertInto("notes")
    .values([
      { account_id: ana.id, scope: "thread", subject_id: shared, kind: "going_on", text: "The lease ends in March", origin: "stated" },
      // 038. A memory: what offload knows about Ana across her threads.
      { account_id: ana.id, scope: "account", subject_id: ana.id, kind: "about", text: "Prefers morning flights", origin: "learned" },
      { account_id: sam.id, scope: "thread", subject_id: theirs, kind: "going_on", text: "Ana must not find out", origin: "stated" },
      // About Sam, kept under Sam's account: never Ana's to read.
      { account_id: sam.id, scope: "account", subject_id: sam.id, kind: "about", text: "Sam prefers trains", origin: "learned" },
    ])
    .execute();

  const [first] = await said(ana, [
    ["person", "ferry to the islands on Tuesday"],
    ["offload", "Filed under Lisbon in October."],
  ]);
  await said(sam, [["person", "order the cake"]]);

  const picture = await photo(ana, JPEG, { contentId: ferry, threadId: alone });
  const voice = await photo(ana, VOICE, { messageId: first! });
  const secret = await photo(sam, Buffer.from("the cake"), { contentId: hidden, threadId: theirs });

  return { ana, sam, alone, shared, theirs, boiler, orphan, picture, voice, secret };
}

describe("the archive", () => {
  it("holds every thread the person can read, and nothing of one they cannot", async () => {
    const w = await world();
    await buildCopy(await asked(w.ana));
    const files = await unzip(w.ana.id);
    const names = [...files.keys()].sort();

    // Ana's default thread, the one she is alone in, and the shared one.
    expect(names).toEqual(
      [
        "conversations.html",
        "data.json",
        `files/${w.picture}.jpg`,
        `files/${w.voice}.m4a`,
        "index.html",
        "notes.html",
        "people.html",
        "threads/1.html",
        "threads/2.html",
        "threads/3.html",
      ].sort(),
    );

    const everything = Buffer.concat([...files.values()]).toString("utf8");
    for (const absent of ["Surprise party", "Cake for Ana", "Ana must not find out", "order the cake", "the cake", "Old plan", "Sam prefers trains"]) {
      expect(everything).not.toContain(absent);
    }
    for (const present of [
      "Lisbon in October",
      "The flat",
      "Tuesday, early",
      "Call the boiler people",
      "The lease ends in March",
      "Prefers morning flights",
      "ferry to the islands on Tuesday",
      "Filed under Lisbon in October.",
      "Sam Ibekwe",
    ]) {
      expect(everything).toContain(present);
    }
  });

  it("gives each photo and voice note back as the file it was", async () => {
    const w = await world();
    await buildCopy(await asked(w.ana));
    const files = await unzip(w.ana.id);
    expect(files.get(`files/${w.picture}.jpg`)).toEqual(JPEG);
    expect(files.get(`files/${w.voice}.m4a`)).toEqual(VOICE);
    expect(files.has(`files/${w.secret}.jpg`)).toBe(false);
    const page = [...files.entries()].find(([name, bytes]) => name.startsWith("threads/") && bytes.includes("Book the ferry"))![1].toString();
    expect(page).toContain(`../files/${w.picture}.jpg`);
    expect(files.get("conversations.html")!.toString()).toContain(`files/${w.voice}.m4a`);
  });

  it("gives somebody else's photo as the picture the thread shows, never their file or its name", async () => {
    const w = await world();
    const original = Buffer.concat([JPEG, Buffer.from(" with where it was taken")]);
    const large = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("the large rendition")]);
    const theirs = await db
      .insertInto("blobs")
      .values({
        account_id: w.sam.id,
        client_key: uuidv7(),
        name: "Sam at 14 Rua Nova.heic",
        content_type: "image/heic",
        kind: "image",
        byte_size: original.length,
        width: 4,
        height: 3,
        sha256: Buffer.alloc(32),
        renditions_at: sql`now()`,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const key = await db.transaction().execute((trx) => mintObjectKey(trx, theirs.id, w.sam.id));
    await objectStore()!.put(objectKey(theirs.id, "original"), wrap(original, key));
    await objectStore()!.put(objectKey(theirs.id, "large"), wrap(large, key));
    await db.insertInto("content_blobs").values({ content_id: w.boiler, blob_id: theirs.id }).execute();
    await db.transaction().execute((trx) => ensureThreadWrap(trx, theirs.id, w.shared));

    await buildCopy(await asked(w.ana));
    const files = await unzip(w.ana.id);
    expect(files.get(`files/${theirs.id}.jpg`)).toEqual(large);
    expect(files.has(`files/${theirs.id}.heic`)).toBe(false);
    const everything = [...files.entries()].filter(([name]) => !name.startsWith("files/")).map(([, bytes]) => bytes.toString()).join("\n");
    expect(everything).not.toContain("Rua Nova");
    // Her own still comes back as the file it was, under its own name.
    expect(files.get(`files/${w.picture}.jpg`)).toEqual(JPEG);
    expect(everything).toContain("IMG_4821 at home.jpg");

    // Sam's own copy holds the file Sam put in.
    await buildCopy(await asked(w.sam));
    const sams = await unzip(w.sam.id);
    expect(sams.get(`files/${theirs.id}.heic`)).toEqual(original);
  });

  // 041. A PDF comes back as its clean copy, whoever put it in: the bytes
  // that were sent are served to nobody, the export included. The one
  // exception is the person's own PDF that could not be cleaned.
  it("gives every PDF as its clean copy, and only the person's own uncleanable one as the file they sent", async () => {
    const w = await world();
    const original = Buffer.from("%PDF-1.7 the original, with its author and its script");
    const clean = Buffer.from("%PDF-1.7 the clean copy");
    const pdfOf = async (owner: Person, cleaned: boolean) => {
      const blob = await db
        .insertInto("blobs")
        .values({
          account_id: owner.id,
          client_key: uuidv7(),
          name: "Boarding pass TAP.pdf",
          content_type: "application/pdf",
          kind: "pdf",
          pages: 1,
          byte_size: original.length,
          sha256: Buffer.alloc(32),
          renditions_at: cleaned ? sql`now()` : null,
          clean_at: cleaned ? sql`now()` : null,
          // What the worker writes when it cannot make a clean copy.
          unreadable_at: cleaned ? null : sql`now()`,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      const key = await db.transaction().execute((trx) => mintObjectKey(trx, blob.id, owner.id));
      await objectStore()!.put(objectKey(blob.id, "original"), wrap(original, key));
      if (cleaned) await objectStore()!.put(objectKey(blob.id, "clean"), wrap(clean, key));
      await db.insertInto("content_blobs").values({ content_id: w.boiler, blob_id: blob.id }).execute();
      await db.transaction().execute((trx) => ensureThreadWrap(trx, blob.id, w.shared));
      return blob.id;
    };
    const anasClean = await pdfOf(w.ana, true);
    const anasUnclean = await pdfOf(w.ana, false);
    const samsClean = await pdfOf(w.sam, true);
    const samsUnclean = await pdfOf(w.sam, false);

    await buildCopy(await asked(w.ana));
    const files = await unzip(w.ana.id);
    expect(files.get(`files/${anasClean}.pdf`)).toEqual(clean);
    expect(files.get(`files/${anasUnclean}.pdf`)).toEqual(original);
    expect(files.get(`files/${samsClean}.pdf`)).toEqual(clean);
    expect([...files.keys()].some((name) => name.includes(samsUnclean))).toBe(false);
    const page = [...files.entries()].find(([name]) => name.startsWith("threads/") && files.get(name)!.includes(anasClean))![1].toString();
    expect(page).toContain(`<a href="../files/${anasClean}.pdf">Boarding pass TAP.pdf</a>`);
    expect(page).not.toContain(`<img src="../files/${anasClean}.pdf"`);
  });

  it("leaves out somebody else's photo that has no rendition yet", async () => {
    const w = await world();
    const waiting = await photo(w.sam, JPEG, { contentId: w.boiler, threadId: w.shared });
    await buildCopy(await asked(w.ana));
    const files = await unzip(w.ana.id);
    expect([...files.keys()].some((name) => name.includes(waiting))).toBe(false);
    expect((await copyState(w.ana.id)).state).toBe("ready");
  });

  it("is plain pages: nothing runs, and what was typed is text", async () => {
    const w = await world();
    await buildCopy(await asked(w.ana));
    const files = await unzip(w.ana.id);
    for (const [name, bytes] of files) {
      if (!name.endsWith(".html")) continue;
      const page = bytes.toString();
      expect(page).not.toMatch(/<script/i);
      expect(page).not.toMatch(/\son\w+=/i);
      expect(page).not.toMatch(/[–—]/);
    }
    const page = [...files.values()].map(String).find((text) => text.includes("Book the ferry"))!;
    expect(page).toContain("Book the ferry &lt;script&gt;alert(1)&lt;/script&gt;");
    // The index is where the names are; a member's name is a number.
    const index = files.get("index.html")!.toString();
    expect(index).toContain("The flat");
    expect(index).toMatch(/href="threads\/\d\.html"/);
  });

  it("says who added a shared row, and says so when they are gone", async () => {
    const w = await world();
    await buildCopy(await asked(w.ana));
    const files = await unzip(w.ana.id);
    const data = JSON.parse(files.get("data.json")!.toString()) as {
      threads: { name: string; shared: boolean; rows: { id: string; title: string; author: string | null; archived: boolean }[] }[];
      conversations: { messages: { from: string; text: string }[] }[];
      notes: { text: string; how?: string }[];
      people: { name: string }[];
    };
    expect(data.threads.map((thread) => thread.name).sort()).toContain("The flat");
    expect(data.threads).toHaveLength(3);
    const flat = data.threads.find((thread) => thread.name === "The flat")!;
    expect(flat.shared).toBe(true);
    expect(flat.rows.find((entry) => entry.id === w.boiler)!.author).toBe("Sam Ibekwe");
    expect(flat.rows.find((entry) => entry.id === w.orphan)!.author).toBeNull();
    const lisbon = data.threads.find((thread) => thread.name === "Lisbon in October")!;
    expect(lisbon.rows.map((entry) => [entry.title, entry.archived])).toEqual(
      expect.arrayContaining([["Museum tickets", true]]),
    );
    expect(data.conversations).toHaveLength(1);
    expect(data.conversations[0]!.messages.map((message) => message.from)).toEqual(["you", "offload"]);
    expect(data.notes.map((note) => note.text)).toEqual(["Prefers morning flights"]);
    // 038. A memory says how offload came to know it, since the export is one
    // of the ways to see them until the Memories tab.
    expect(data.notes[0]!.how).toBe("offload learned");
    expect((data.notes[0] as { kind?: string }).kind).toBe("about");
    expect(data.people).toEqual([{ name: "Sam Ibekwe" }]);

    const page = [...files.values()].map(String).find((text) => text.includes("Rent is due on the first"))!;
    expect(page).toContain("Added by Sam Ibekwe");
    expect(page).toContain("Added by someone who has gone");
  });

  it("names no connection a block outlived, and no disabled account", async () => {
    const ana = await person("Ana Duarte");
    const sam = await person("Sam Ibekwe");
    const kim = await person("Kim Lee");
    const rui = await person("Rui Costa");
    for (const other of [sam, kim, rui]) {
      const [a, b] = [ana.id, other.id].sort();
      await db.insertInto("connections").values({ account_a: a!, account_b: b! }).execute();
    }
    // The pair row lingers for an instant when an accept races a block.
    await db.insertInto("blocks").values({ blocker_account_id: sam.id, blocked_account_id: ana.id }).execute();
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", kim.id).execute();
    await buildCopy(await asked(ana));
    const data = JSON.parse((await unzip(ana.id)).get("data.json")!.toString()) as { people: { name: string }[] };
    expect(data.people).toEqual([{ name: "Rui Costa" }]);
  });

  it("names the default thread as not in a thread, never by its stored name", async () => {
    const ana = await person("Ana Duarte");
    await row(ana.id, ana.defaultThreadId, "Water the plants");
    const stored = (await db.selectFrom("threads").select("name").where("id", "=", ana.defaultThreadId).executeTakeFirstOrThrow()).name;
    await buildCopy(await asked(ana));
    const files = await unzip(ana.id);
    const page = [...files.entries()].find(([name, bytes]) => name.startsWith("threads/") && bytes.includes("Water the plants"))![1].toString();
    for (const text of [files.get("index.html")!.toString(), page]) {
      expect(text).toContain("Not in a thread");
      expect(text).not.toContain(stored);
    }
  });

  it("keeps a repeating row repeating: the rule rides in data.json beside its date", async () => {
    // Sweep 2026-10-07, S3. Without it a weekly yoga class came back as one date.
    const ana = await person("Ana Duarte");
    const yoga = await row(ana.id, ana.defaultThreadId, "Yoga", {
      type: "event",
      occurs_at: sql`'2026-10-06T18:00:00Z'::timestamptz`,
      rrule: "FREQ=WEEKLY;BYDAY=TU",
    });
    const once = await row(ana.id, ana.defaultThreadId, "Dentist", { type: "event", occurs_at: sql`'2026-10-09T09:00:00Z'::timestamptz` });
    await db
      .insertInto("notes")
      .values({
        account_id: ana.id,
        scope: "thread",
        subject_id: ana.defaultThreadId,
        kind: "going_on",
        text: "Bins go out",
        origin: "stated",
        occurs_at: sql`'2026-10-08T07:00:00Z'::timestamptz`,
        rrule: "FREQ=WEEKLY;BYDAY=WE",
      })
      .execute();
    await buildCopy(await asked(ana));
    const files = await unzip(ana.id);
    const data = JSON.parse(files.get("data.json")!.toString()) as {
      threads: {
        rows: { id: string; occursAt: string | null; rrule?: string | null }[];
        notes: { text: string; occursAt?: string | null; rrule?: string | null }[];
      }[];
    };
    const rows = data.threads.flatMap((thread) => thread.rows);
    expect(rows.find((entry) => entry.id === yoga)).toMatchObject({ occursAt: "2026-10-06T18:00:00.000Z", rrule: "FREQ=WEEKLY;BYDAY=TU" });
    expect(rows.find((entry) => entry.id === once)!.rrule).toBeNull();
    const bins = data.threads.flatMap((thread) => thread.notes).find((note) => note.text === "Bins go out");
    expect(bins).toMatchObject({ occursAt: "2026-10-08T07:00:00.000Z", rrule: "FREQ=WEEKLY;BYDAY=WE" });
  });

  it("carries each reminder kind and the Remind me switch, the author's own and nobody else's", async () => {
    // Sweep 2026-10-17, S33. The privacy page says the copy holds everything.
    const ana = await person("Ana Duarte");
    const sam = await person("Sam Ibekwe");
    const shared = await thread("The flat", ana, sam);
    const soon = sql<Date>`now() + interval '10 days'`;
    const dentist = await row(ana.id, ana.defaultThreadId, "Dentist", { type: "event", occurs_at: soon });
    const quiet = await row(ana.id, ana.defaultThreadId, "Gym", { type: "event", occurs_at: soon });
    const theirs = await row(sam.id, shared, "Boiler service", { type: "event", occurs_at: soon });
    const note = await db
      .insertInto("notes")
      .values({ account_id: ana.id, scope: "thread", subject_id: ana.defaultThreadId, kind: "going_on", text: "Rent due", origin: "stated", due_at: soon })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("reminder_labels")
      .values([
        { account_id: ana.id, content_id: dentist, kind: "appointment", lead: "days" },
        { account_id: ana.id, content_id: quiet, kind: "meeting", lead: "none", stopped_at: sql`now()` },
        { account_id: ana.id, note_id: note.id, kind: "deadline", lead: "days", stopped_at: sql`now()` },
        { account_id: sam.id, content_id: theirs, kind: "appointment", lead: "days" },
      ] as never)
      .execute();

    await buildCopy(await asked(ana));
    const files = await unzip(ana.id);
    type Entry = { id?: string; text?: string; reminder?: { kind: string | null; remindMe: string | null } };
    const data = JSON.parse(files.get("data.json")!.toString()) as { threads: { rows: Entry[]; notes: Entry[] }[] };
    const rows = data.threads.flatMap((one) => one.rows);
    expect(rows.find((entry) => entry.id === dentist)?.reminder).toEqual({ kind: "appointment", remindMe: "on" });
    expect(rows.find((entry) => entry.id === quiet)?.reminder).toEqual({ kind: "meeting", remindMe: "off" });
    expect(rows.find((entry) => entry.id === theirs)?.reminder).toBeUndefined();
    const rent = data.threads.flatMap((one) => one.notes).find((entry) => entry.text === "Rent due");
    expect(rent?.reminder).toEqual({ kind: "deadline", remindMe: "off" });

    const pages = [...files.entries()].filter(([name]) => name.startsWith("threads/")).map(([, bytes]) => bytes.toString()).join("");
    expect(pages).toContain("Kind of date: appointment · Remind me on");
    expect(pages).toContain("Kind of date: meeting · Remind me off");
    expect(pages).toContain("Kind of date: deadline · Remind me off");
  });
});

describe("how the copy is kept", () => {
  it("is sealed in parts under its own key, and the row says what it holds", async () => {
    const w = await world();
    const id = await asked(w.ana);
    // Small parts, so the cut is exercised.
    await buildCopy(id, { partBytes: 512 });

    const made = await db.selectFrom("exports").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    expect(made.state).toBe("ready");
    expect(made.ready_at).not.toBeNull();
    expect(made.parts).toBeGreaterThan(1);
    expect([...made.thread_ids].sort()).toEqual([w.ana.defaultThreadId, w.alone, w.shared].sort());

    const store = objectStore() as unknown as { objects: Map<string, Buffer> };
    // The suite's store is memory, whatever the environment file carries.
    expect(store.objects).toBeInstanceOf(Map);
    const kept = [...store.objects.keys()].filter((key) => key.startsWith(`exports/${id}/`));
    expect(kept.sort()).toEqual(Array.from({ length: made.parts }, (_, part) => `exports/${id}/${part}`).sort());

    const key = unwrap(Buffer.from(made.wrapped_key), await db.transaction().execute((trx) => accountKey(trx, w.ana.id)));
    let total = 0;
    for (const name of kept) {
      const sealed = store.objects.get(name)!;
      // Nothing of a zip, a title or a photo in what storage holds.
      expect(sealed.includes(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
      expect(sealed.includes("The flat")).toBe(false);
      expect(sealed.includes("ferry timetable")).toBe(false);
      total += unwrap(sealed, key).length;
    }
    expect(total).toBe(Number(made.byte_size));
    expect((await unzip(w.ana.id)).has("data.json")).toBe(true);
  });

  it("tells Activity, and sends nothing", async () => {
    const w = await world();
    await buildCopy(await asked(w.ana));
    const entries = await db.selectFrom("activity").select(["kind", "title", "body", "sent", "reason"]).where("account_id", "=", w.ana.id).execute();
    expect(entries).toEqual([{ kind: "export", title: "Your copy is ready", body: null, sent: false, reason: "design" }]);
  });

  it("runs as the job, which carries an id and nothing else", async () => {
    const w = await world();
    const id = await asked(w.ana);
    const job = await db.selectFrom("jobs").select("payload").where("kind", "=", "export.build").executeTakeFirstOrThrow();
    expect(job.payload).toEqual({ exportId: id });
    await handlers["export.build"]!(job.payload as Record<string, unknown>, { mailer: new MemoryMailer() }, w.ana.id);
    expect((await db.selectFrom("exports").select("state").where("id", "=", id).executeTakeFirstOrThrow()).state).toBe("ready");
  });

  it("fails clean: no parts left, and the clock is given back", async () => {
    const w = await world();
    const id = await asked(w.ana);
    const store = objectStore()!;
    const put = store.put.bind(store);
    let puts = 0;
    store.put = async (key, bytes) => {
      puts += 1;
      if (puts === 2) throw new Error("storage said no");
      return put(key, bytes);
    };
    await buildCopy(id, { partBytes: 512 });
    const made = await db.selectFrom("exports").select(["state", "requested_at", "expires_at", "parts"]).where("id", "=", id).executeTakeFirstOrThrow();
    expect(made).toEqual({ state: "failed", requested_at: null, expires_at: null, parts: 0 });
    const kept = [...(store as unknown as { objects: Map<string, Buffer> }).objects.keys()].filter((key) => key.startsWith("exports/"));
    expect(kept).toEqual([]);
    expect(await db.selectFrom("activity").select("id").where("account_id", "=", w.ana.id).execute()).toEqual([]);
  });

  it("fails the copy, and nothing else, when a photo cannot be read from storage", async () => {
    const w = await world();
    const id = await asked(w.ana);
    const store = objectStore()!;
    const get = store.get.bind(store);
    store.get = async (key) => {
      if (key.startsWith(`blobs/${w.picture}/`)) throw new Error("storage said no");
      return get(key);
    };
    await buildCopy(id, { partBytes: 512 });
    const made = await db.selectFrom("exports").select(["state", "requested_at"]).where("id", "=", id).executeTakeFirstOrThrow();
    expect(made).toEqual({ state: "failed", requested_at: null });
    expect([...(store as unknown as { objects: Map<string, Buffer> }).objects.keys()].filter((key) => key.startsWith("exports/"))).toEqual([]);
  });

  it("stops at the size guard and fails clean", async () => {
    const w = await world();
    const id = await asked(w.ana);
    await buildCopy(id, { partBytes: 256, maxBytes: 600 });
    const made = await db.selectFrom("exports").select(["state", "parts", "requested_at"]).where("id", "=", id).executeTakeFirstOrThrow();
    expect(made.state).toBe("failed");
    expect(made.parts).toBe(0);
    // The one failure an account can cause keeps the clock, or it would be a
    // way to run builds without limit.
    expect(made.requested_at).not.toBeNull();
    expect((await copyState(w.ana.id)).state).toBe("waiting");
    expect((await requestCopy(w.ana.id)).ok).toBe(false);
    const store = objectStore() as unknown as { objects: Map<string, Buffer> };
    expect([...store.objects.keys()].filter((key) => key.startsWith("exports/"))).toEqual([]);
  });

  it("still says failed when the clean-up after a failure fails too", async () => {
    const w = await world();
    const id = await asked(w.ana);
    const store = objectStore()!;
    store.put = async () => {
      throw new Error("storage said no");
    };
    store.remove = async () => {
      throw new Error("storage said no again");
    };
    await buildCopy(id);
    expect((await db.selectFrom("exports").select("state").where("id", "=", id).executeTakeFirstOrThrow()).state).toBe("failed");
  });

  it("stops and leaves nothing when the row goes while it is being made", async () => {
    const w = await world();
    const id = await asked(w.ana);
    const store = objectStore()!;
    const put = store.put.bind(store);
    let puts = 0;
    store.put = async (key, bytes) => {
      await put(key, bytes);
      puts += 1;
      if (puts === 1) await db.deleteFrom("exports").where("id", "=", id).execute();
    };
    await buildCopy(id, { partBytes: 512 });
    const kept = [...(store as unknown as { objects: Map<string, Buffer> }).objects.keys()].filter((key) => key.startsWith("exports/"));
    expect(kept).toEqual([]);
    expect(await db.selectFrom("activity").select("id").execute()).toEqual([]);
  });

  it("builds nothing for a row that is not making", async () => {
    const w = await world();
    const id = await asked(w.ana);
    await db.updateTable("exports").set({ state: "gone" }).where("id", "=", id).execute();
    await buildCopy(id);
    expect((await db.selectFrom("exports").select("state").where("id", "=", id).executeTakeFirstOrThrow()).state).toBe("gone");
    expect(await openCopy(w.ana.id)).toBeNull();
  });
});

describe("052 AC-27 what a turn changed", () => {
  it("goes in the copy, on the message that changed it", async () => {
    const me = await person("Ana Duarte");
    const [dumpId] = await said(me, [["person", "got the milk"]]);
    const t = await thread("Groceries", me);
    const milk = await row(me.id, t, "Milk");
    await sql`
      insert into turn_changes (message_id, account_id, target_kind, target_id, tool, previous)
      values (${dumpId!}::uuid, ${me.id}::uuid, 'content', ${milk}::uuid, 'complete_content', '{"done_at": null}'::jsonb)`.execute(db);
    await buildCopy(await asked(me));
    const files = await unzip(me.id);
    const data = JSON.parse(files.get("data.json")!.toString()) as {
      conversations: { messages: { from: string; changed?: { target: string; tool: string; previous: unknown }[] }[] }[];
    };
    const mine = data.conversations[0]!.messages.find((m) => m.from === "you")!;
    expect(mine.changed).toEqual([{ target: milk, tool: "complete_content", previous: { done_at: null } }]);
  });
});
