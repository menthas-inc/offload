// 035 part B. Making a copy, and reading it back.
//
// Everything the account can read at this moment, through the same readable
// views the product reads through (OFF-3), so a thread the account is not in
// cannot reach the archive by any path. The rows are read in one snapshot; the
// photos and voice notes are opened one at a time as the zip reaches them, so
// memory is bounded by a part and not by the archive.
//
// The zip is cut into parts, each sealed under the copy's own key before it is
// put: storage holds ciphertext under an id and a number (OFF-2). Nothing here
// logs or stores a title or a file name outside the archive itself (OFF-1).

import { Readable } from "node:stream";
import { sql } from "kysely";
import { ZipFile } from "yazl";
import { db } from "../db.js";
import { unwrap, wrap } from "../crypto/keys.js";
import { accountKey, NoKey, objectKeyOf } from "../blobs/keys.js";
import { objectKey, objectStore, type Rendition } from "../blobs/store.js";
import { record } from "../notifications/activity.js";
import { remindersOf } from "../notifications/labels.js";
import { partKey, removeParts } from "./copy.js";
import { connectionsOf } from "../people/access.js";
import { shownThreadName } from "../threads/default.js";
import {
  conversationsPage,
  indexPage,
  notesPage,
  peoplePage,
  threadPage,
  type Copy,
  type CopyFile,
  type CopyNote,
  type CopyRow,
  type CopyThread,
} from "./pages.js";


/** 038. A memory's origin, as the person reads it. */
const HOW = { stated: "you asked", answered: "you answered", learned: "offload learned" } as const;

/** How offload came to know a memory, in the editor's words: 040's tab adds
 *  two ways, typed there and changed there. */
export function howOf(
  origin: keyof typeof HOW,
  attrs: unknown,
): "you asked" | "you answered" | "offload learned" | "you added" | "you changed" {
  const marks = (typeof attrs === "string" ? JSON.parse(attrs) : (attrs ?? {})) as Record<string, unknown>;
  if (marks.changed === "tab") return "you changed";
  if (marks.added === "tab") return "you added";
  return HOW[origin];
}

/** A part of the archive before sealing. Memory is a few of these at most. */
export const PART_BYTES = 32 * 1024 * 1024;
/** Far above the heaviest account. A guard against a runaway, not a limit
 *  anyone should meet. */
export const MAX_BYTES = 8 * 1024 * 1024 * 1024;

/** The row went, or stopped being made, while the build ran. */
class Stopped extends Error {}
/** The archive passed the size guard. The one failure an account can cause,
 *  so it keeps the clock: a build that could be run again at once, for
 *  nothing, is a way round one every seven days. */
class TooBig extends Error {}

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
};

interface Blob extends CopyFile {
  id: string;
  rendition: Rendition;
}

const iso = (at: Date | null): string | null => (at ? at.toISOString() : null);

/** Everything the account can read, in one snapshot. */
async function read(accountId: string): Promise<{ copy: Copy; blobs: Blob[] }> {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (trx) => {
      const me = await trx.selectFrom("accounts").select(["time_zone"]).where("id", "=", accountId).executeTakeFirstOrThrow();

      const threads = await trx
        .selectFrom("threads")
        .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
        .select(["threads.id", shownThreadName("threads.id", "threads.name", accountId).as("name")])
        .where("thread_members.account_id", "=", accountId)
        .where("thread_members.state", "=", "accepted")
        .where("threads.deleted_at", "is", null)
        .orderBy("threads.created_at")
        .orderBy("threads.id")
        .execute();
      const threadIds = threads.map((thread) => thread.id);

      const members =
        threadIds.length === 0
          ? []
          : await trx
              .selectFrom("thread_members")
              .innerJoin("accounts", "accounts.id", "thread_members.account_id")
              .select(["thread_members.thread_id", "accounts.display_name"])
              .where("thread_members.thread_id", "in", threadIds)
              .where("thread_members.state", "=", "accepted")
              .where("thread_members.account_id", "!=", accountId)
              .execute();

      const labels =
        threadIds.length === 0
          ? []
          : await trx
              .selectFrom("labels")
              .select(["id", "thread_id", "name"])
              .where("thread_id", "in", threadIds)
              .where("deleted_at", "is", null)
              .orderBy("created_at")
              .execute();
      const labelName = new Map(labels.map((label) => [label.id, label.name]));

      const rows = await trx
        .selectFrom("readable_content as c")
        .leftJoin("accounts", "accounts.id", "c.account_id")
        .select([
          "c.id",
          "c.thread_id",
          "c.account_id",
          "c.type",
          "c.title",
          "c.body",
          "c.url",
          "c.location",
          "c.done_at",
          "c.archived_at",
          "c.due_at",
          "c.occurs_at",
          "c.occurs_end_at",
          "c.rrule",
          "c.created_at",
          "accounts.display_name",
        ])
        .where("c.viewer_account_id", "=", accountId)
        .where("c.deleted_at", "is", null)
        .orderBy("c.created_at")
        .orderBy("c.id")
        .execute();
      const rowIds = rows.map((row) => row.id);

      const rowLabels =
        rowIds.length === 0
          ? []
          : await trx
              .selectFrom("content_labels")
              .select(["content_id", "label_id"])
              .where("content_id", "in", rowIds)
              .where("removed_at", "is", null)
              .execute();

      const threadNotes = await trx
        .selectFrom("readable_notes as n")
        .leftJoin("accounts", "accounts.id", "n.account_id")
        .select([
          "n.id",
          "n.subject_id",
          "n.account_id",
          "n.text",
          "n.body",
          "n.occurs_at",
          "n.due_at",
          "n.rrule",
          "n.created_at",
          "accounts.display_name",
        ])
        .where("n.viewer_account_id", "=", accountId)
        .where("n.deleted_at", "is", null)
        .where("n.superseded_at", "is", null)
        .orderBy("n.created_at")
        .execute();

      const ownNotes = await trx
        .selectFrom("notes")
        .select(["id", "scope", "text", "body", "created_at", "origin", "kind", "attrs"])
        // By subject for what is about the account, by keeper for what the
        // account keeps about the people it named, as the delete reads them.
        .where((eb) =>
          eb.or([
            eb.and([eb("scope", "=", "account"), eb("subject_id", "=", accountId)]),
            eb.and([eb("scope", "=", "person"), eb("account_id", "=", accountId)]),
          ]),
        )
        .where("deleted_at", "is", null)
        .where("superseded_at", "is", null)
        .orderBy("created_at")
        .execute();

      const conversations = await trx
        .selectFrom("conversations")
        .select(["id", "started_at"])
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        .orderBy("started_at")
        .orderBy("id")
        .execute();
      const messages = await trx
        .selectFrom("readable_messages as m")
        .select(["m.id", "m.conversation_id", "m.role", "m.text", "m.transcript", "m.created_at"])
        .where("m.viewer_account_id", "=", accountId)
        .where("m.deleted_at", "is", null)
        .orderBy("m.created_at")
        .orderBy("m.id")
        .execute();
      const messageIds = messages.map((message) => message.id);
      // 052. What a turn changed, on the account's own messages, while its
      // Undo still holds the values (OFF-1: theirs to take).
      const turnChanges =
        messageIds.length === 0
          ? []
          : await trx
              .selectFrom("turn_changes")
              .select(["message_id", "target_id", "tool", "previous"])
              .where("account_id", "=", accountId)
              .where("message_id", "in", messageIds)
              // Only what the person can still read: a row or a thread they
              // have left keeps its earlier words out of their copy.
              .where((eb) =>
                eb.or([
                  eb.and([
                    eb("target_kind", "=", "content"),
                    eb.exists(
                      eb.selectFrom("readable_content as c").select("c.id").whereRef("c.id", "=", "turn_changes.target_id").where("c.viewer_account_id", "=", accountId),
                    ),
                  ]),
                  eb.and([
                    eb("target_kind", "=", "thread"),
                    eb.exists(
                      eb
                        .selectFrom("thread_members as m")
                        .select("m.thread_id")
                        .whereRef("m.thread_id", "=", "turn_changes.target_id")
                        .where("m.account_id", "=", accountId)
                        .where("m.state", "=", "accepted"),
                    ),
                  ]),
                ]),
              )
              .orderBy("created_at")
              .execute();

      // Blobs by the two ways one is readable: on a readable row, or on the
      // account's own message. Never by the blob's own account column alone.
      // That column decides one thing: whose file it is.
      const onRows =
        rowIds.length === 0
          ? []
          : await trx
              .selectFrom("content_blobs")
              .innerJoin("blobs", "blobs.id", "content_blobs.blob_id")
              .select([
                "content_blobs.content_id",
                "blobs.id",
                "blobs.kind",
                "blobs.name",
                "blobs.content_type",
                "blobs.account_id",
                "blobs.renditions_at",
                "blobs.clean_at",
              ])
              .where("content_blobs.content_id", "in", rowIds)
              // A voice note is its dumper's alone, as the audio route has it;
              // only a photo or a PDF (041) is the thread's through a row.
              .where("blobs.kind", "in", ["image", "pdf"])
              .where("blobs.deleted_at", "is", null)
              // 041. The person's own PDF that could not be cleaned is still
              // theirs to take: it has no other copy.
              .where((eb) =>
                eb.or([
                  eb("blobs.unreadable_at", "is", null),
                  eb.and([eb("blobs.kind", "=", "pdf"), eb("blobs.account_id", "=", accountId)]),
                ]),
              )
              .orderBy("blobs.created_at")
              .execute();
      const onMessages =
        messageIds.length === 0
          ? []
          : await trx
              .selectFrom("blobs")
              .select(["message_id", "id", "kind", "name", "content_type", "account_id", "renditions_at", "clean_at"])
              .where("message_id", "in", messageIds)
              .where("deleted_at", "is", null)
              .where((eb) =>
                eb.or([eb("unreadable_at", "is", null), eb.and([eb("kind", "=", "pdf"), eb("account_id", "=", accountId)])]),
              )
              .orderBy("created_at")
              .execute();

      const people = await connectionsOf(accountId, trx);

      // S33. offload's kind of date and the Remind me switch, on the account's
      // own labels only: another author's never reaches this copy.
      const reminderLabels = await trx
        .selectFrom("reminder_labels")
        .select(["content_id", "note_id", "kind"])
        .where("account_id", "=", accountId)
        .execute();
      const labelledRows = reminderLabels.flatMap((label) => label.content_id ?? []);
      const labelledNotes = reminderLabels.flatMap((label) => label.note_id ?? []);
      const switches = new Map([
        ...(await remindersOf(trx, "content", labelledRows, accountId)),
        ...(await remindersOf(trx, "note", labelledNotes, accountId)),
      ]);
      const reminders = new Map(
        reminderLabels.map((label) => {
          const id = (label.content_id ?? label.note_id)!;
          return [id, { kind: label.kind, remindMe: switches.get(id) ?? null }] as const;
        }),
      );
      const reminderOf = (id: string) => (reminders.has(id) ? { reminder: reminders.get(id)! } : {});

      const blobs = new Map<string, Blob>();
      // The file as it was put in goes to the person who put it in and to
      // nobody else: it carries what the camera wrote and the name it had.
      // Anybody else in the thread gets the picture the thread shows them, our
      // own JPEG, or nothing while that has not been made.
      const fileOf = (blob: {
        id: string;
        kind: "image" | "audio" | "pdf";
        name: string | null;
        content_type: string;
        account_id: string | null;
        renditions_at: Date | null;
        clean_at: Date | null;
      }): Blob[] => {
        const known = blobs.get(blob.id);
        if (known) return [known];
        const own = blob.account_id === accountId;
        // 041. A PDF comes back as its clean copy, whoever put it in: the
        // bytes that were sent are served to nobody. The one exception is the
        // person's own PDF that could not be cleaned, which has no other copy.
        if (blob.kind === "pdf") {
          if (!blob.clean_at && !own) return [];
          const file: Blob = {
            id: blob.id,
            rendition: blob.clean_at ? "clean" : "original",
            path: `files/${blob.id}.pdf`,
            kind: "pdf",
            name: own ? blob.name : null,
          };
          blobs.set(blob.id, file);
          return [file];
        }
        if (!own && !(blob.kind === "image" && blob.renditions_at)) return [];
        const file: Blob = own
          ? { id: blob.id, rendition: "original", path: `files/${blob.id}.${EXTENSION[blob.content_type] ?? "bin"}`, kind: blob.kind, name: blob.name }
          : { id: blob.id, rendition: "large", path: `files/${blob.id}.jpg`, kind: blob.kind, name: null };
        blobs.set(blob.id, file);
        return [file];
      };
      const strip = ({ path, kind, name }: Blob): CopyFile => ({ path, kind, name });
      const group = <T, K>(list: T[], key: (one: T) => K): Map<K, T[]> => {
        const map = new Map<K, T[]>();
        for (const one of list) map.set(key(one), [...(map.get(key(one)) ?? []), one]);
        return map;
      };

      const membersOf = group(members, (member) => member.thread_id);
      const labelsOf = group(labels, (label) => label.thread_id);
      const rowsOf = group(rows, (row) => row.thread_id);
      const rowLabelsOf = group(rowLabels, (pair) => pair.content_id);
      const rowFilesOf = group(onRows, (blob) => blob.content_id);
      const notesOf = group(threadNotes, (note) => note.subject_id);
      const messagesOf = group(messages, (message) => message.conversation_id);
      const changedOf = group(turnChanges, (change) => change.message_id);
      const messageFilesOf = group(onMessages, (blob) => blob.message_id);
      // Gone when the column is empty; a name that was never set is not gone.
      const author = (row: { account_id: string | null; display_name: string | null }): string | null =>
        row.account_id === null ? null : (row.display_name ?? "Someone");

      const copy: Copy = {
        madeAt: new Date().toISOString(),
        timeZone: me.time_zone ?? "UTC",
        threads: threads.map((thread, index): CopyThread => {
          const others = membersOf.get(thread.id) ?? [];
          return {
            n: index + 1,
            id: thread.id,
            name: thread.name ?? "Not in a thread",
            shared: others.length > 0,
            members: others.map((member) => member.display_name ?? "Someone"),
            labels: (labelsOf.get(thread.id) ?? []).map((label) => label.name),
            notes: (notesOf.get(thread.id) ?? []).map((note): CopyNote => ({
              text: note.text,
              body: note.body,
              author: author(note),
              addedAt: note.created_at.toISOString(),
              occursAt: iso(note.occurs_at),
              dueAt: iso(note.due_at),
              rrule: note.rrule,
              ...reminderOf(note.id),
            })),
            rows: (rowsOf.get(thread.id) ?? []).map((row): CopyRow => ({
              id: row.id,
              type: row.type,
              title: row.title,
              body: row.body,
              url: row.url,
              location: row.location,
              done: row.done_at !== null,
              archived: row.archived_at !== null,
              dueAt: iso(row.due_at),
              occursAt: iso(row.occurs_at),
              occursEndAt: iso(row.occurs_end_at),
              rrule: row.rrule,
              addedAt: row.created_at.toISOString(),
              author: author(row),
              labels: (rowLabelsOf.get(row.id) ?? []).flatMap((pair) => labelName.get(pair.label_id) ?? []),
              files: (rowFilesOf.get(row.id) ?? []).flatMap(fileOf).map(strip),
              ...reminderOf(row.id),
            })),
          };
        }),
        conversations: conversations
          .map((conversation) => ({
            startedAt: conversation.started_at.toISOString(),
            messages: (messagesOf.get(conversation.id) ?? []).map((message) => ({
              from: message.role === "person" ? ("you" as const) : ("offload" as const),
              text: message.text,
              transcript: message.transcript,
              at: message.created_at.toISOString(),
              files: (messageFilesOf.get(message.id) ?? []).flatMap(fileOf).map(strip),
              ...(changedOf.has(message.id)
                ? { changed: changedOf.get(message.id)!.map((change) => ({ target: change.target_id, tool: change.tool, previous: change.previous })) }
                : {}),
            })),
          }))
          .filter((conversation) => conversation.messages.length > 0),
        notes: ownNotes.map((note) => ({
          text: note.text,
          body: note.body,
          author: null,
          addedAt: note.created_at.toISOString(),
          about: note.scope === "account" ? ("you" as const) : ("someone" as const),
          // 038. How offload came to know a memory, as the tab says it.
          ...(note.scope === "account" ? { how: howOf(note.origin, note.attrs), kind: note.kind } : {}),
          ...reminderOf(note.id),
        })),
        people: people.map((person) => ({ name: person.displayName ?? "Someone" })),
      };
      return { copy, blobs: [...blobs.values()] };
    });
}

/** The copy's own key, opened with the account's. */
async function copyKey(accountId: string, wrapped: Buffer): Promise<Buffer> {
  return unwrap(wrapped, await db.transaction().execute((trx) => accountKey(trx, accountId)));
}

/** One blob's bytes, or nothing when it has gone since the snapshot. */
async function open(blobId: string, rendition: Rendition): Promise<Buffer | null> {
  const sealed = await objectStore()!.get(objectKey(blobId, rendition));
  if (!sealed) return null;
  try {
    return unwrap(sealed, await db.transaction().execute((trx) => objectKeyOf(trx, blobId)));
  } catch (error) {
    if (error instanceof NoKey) return null;
    throw error;
  }
}

/** Drop a file that could not be read from every row that pointed at it, so
 *  the pages never link to a member that is not there. */
function forget(copy: Copy, missing: Set<string>): void {
  if (missing.size === 0) return;
  const keep = (file: CopyFile) => !missing.has(file.path);
  for (const thread of copy.threads) for (const row of thread.rows) row.files = row.files.filter(keep);
  for (const conversation of copy.conversations) for (const message of conversation.messages) message.files = message.files.filter(keep);
}

/** Make the copy for an `exports` row that is `making`. Never throws: a build
 *  that fails says so on the row and gives the clock back. */
export async function buildCopy(exportId: string, options: { partBytes?: number; maxBytes?: number } = {}): Promise<void> {
  const partBytes = options.partBytes ?? PART_BYTES;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const row = await db
    .selectFrom("exports")
    .select(["account_id", "wrapped_key"])
    .where("id", "=", exportId)
    .where("state", "=", "making")
    .executeTakeFirst();
  const store = objectStore();
  if (!row || !store) return;
  const accountId = row.account_id;

  let parts = 0;
  let bytes = 0;
  try {
    const key = await copyKey(accountId, Buffer.from(row.wrapped_key));
    const { copy, blobs } = await read(accountId);
    const missing = new Set<string>();

    const zip = new ZipFile();
    const output = zip.outputStream as unknown as Readable;
    zip.on("error", (error: Error) => output.destroy(error));
    // yazl listens for nothing on a lazy member's stream, so a read that
    // throws would be an unhandled error event and take the process with it.
    // Handed to the zip here, it ends the output and this build alone.
    const lazy = (path: string, make: () => AsyncGenerator<Buffer>, compress: boolean) =>
      zip.addReadStreamLazy(path, { compress }, (hand) => {
        const stream = Readable.from(make());
        stream.on("error", (error: Error) => zip.emit("error", error));
        hand(null, stream);
      });

    // The files first: the pages are written once it is known which of them
    // could still be read.
    for (const blob of blobs) {
      lazy(
        blob.path,
        async function* () {
          const plain = await open(blob.id, blob.rendition);
          if (plain) yield plain;
          else missing.add(blob.path);
        },
        false,
      );
    }
    const text = (path: string, make: () => string) =>
      lazy(
        path,
        async function* () {
          forget(copy, missing);
          yield Buffer.from(make(), "utf8");
        },
        true,
      );
    text("index.html", () => indexPage(copy));
    for (const thread of copy.threads) text(`threads/${thread.n}.html`, () => threadPage(thread, copy.timeZone));
    text("conversations.html", () => conversationsPage(copy));
    text("notes.html", () => notesPage(copy));
    text("people.html", () => peoplePage(copy));
    text("data.json", () => JSON.stringify(copy, null, 2));
    zip.end();

    const put = async (part: Buffer): Promise<void> => {
      await store.put(partKey(exportId, parts), wrap(part, key));
      parts += 1;
      bytes += part.length;
      if (bytes > maxBytes) throw new TooBig();
      const still = await db
        .updateTable("exports")
        .set({ parts })
        .where("id", "=", exportId)
        .where("state", "=", "making")
        .returning("id")
        .executeTakeFirst();
      if (!still) throw new Stopped();
    };

    let held: Buffer[] = [];
    let size = 0;
    for await (const chunk of output as AsyncIterable<Buffer>) {
      held.push(chunk);
      size += chunk.length;
      while (size >= partBytes) {
        const whole = Buffer.concat(held);
        await put(whole.subarray(0, partBytes));
        held = whole.length > partBytes ? [whole.subarray(partBytes)] : [];
        size = whole.length - partBytes;
      }
    }
    if (size > 0) await put(Buffer.concat(held));

    const done = await db.transaction().execute(async (trx) => {
      const ready = await trx
        .updateTable("exports")
        .set({
          state: "ready",
          ready_at: sql`now()`,
          parts,
          byte_size: bytes,
          thread_ids: sql`${sql.val(copy.threads.map((thread) => thread.id))}::uuid[]`,
        })
        .where("id", "=", exportId)
        .where("state", "=", "making")
        .returning("id")
        .executeTakeFirst();
      if (!ready) return false;
      // In Activity and nowhere else: no push for something the person is
      // watching happen.
      await record(accountId, { kind: "export", sent: false, reason: "design", title: "Your copy is ready", body: null }, trx);
      return true;
    });
    if (!done) throw new Stopped();
    console.log(
      JSON.stringify({
        level: "info",
        msg: "copy built",
        exportId,
        threads: copy.threads.length,
        files: blobs.length - missing.size,
        parts,
        bytes,
      }),
    );
  } catch (error) {
    // One past the count: a part may have been put and not yet counted. A
    // removal that fails too must not keep the row from saying what happened;
    // whatever ends the row next books the parts again.
    await removeParts(exportId, parts).catch(() => undefined);
    if (error instanceof Stopped) return;
    // The name of the error and nothing it might quote.
    console.error(JSON.stringify({ level: "error", msg: "copy failed", exportId, error: error instanceof Error ? error.name : "unknown" }));
    await db
      .updateTable("exports")
      .set({
        state: "failed",
        parts: 0,
        byte_size: 0,
        ...(error instanceof TooBig ? {} : { requested_at: null, expires_at: null }),
      })
      .where("id", "=", exportId)
      .where("state", "=", "making")
      .execute();
  }
}

/** The owner's copy, part by part, opened. Null unless there is one that is
 *  ready and inside its seven days. */
export async function openCopy(accountId: string): Promise<{ byteSize: number; parts: AsyncGenerator<Buffer> } | null> {
  const row = await db
    .selectFrom("exports")
    .select(["id", "parts", "byte_size", "wrapped_key"])
    .where("account_id", "=", accountId)
    .where("state", "=", "ready")
    .where(sql<boolean>`expires_at > now()`)
    .executeTakeFirst();
  const store = objectStore();
  if (!row || !store) return null;
  const key = await copyKey(accountId, Buffer.from(row.wrapped_key));
  async function* parts(): AsyncGenerator<Buffer> {
    for (let part = 0; part < row!.parts; part += 1) {
      const sealed = await store!.get(partKey(row!.id, part));
      if (!sealed) throw new Error("copy part missing");
      yield unwrap(sealed, key);
    }
  }
  return { byteSize: Number(row.byte_size), parts: parts() };
}
