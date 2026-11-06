// The dump.
//
// A person types, presses send, and this is where it lands. Three routes: take
// a dump, read one message, and stream one message's answer as it arrives.
//
// The shape of the write is the whole point. The message is stored first and
// unconditionally, in the same transaction as the job that will answer it, so
// there is no window where a dump exists and nothing is coming for it, and none
// where a job references a message that is not committed. Everything after that
// can fail without losing what somebody handed us, which is the one promise
// this product cannot break.

import { answerMemory, restoreForgotten, undoAnswered } from "../memories/store.js";
import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { sql } from "kysely";
import type { App } from "../app.js";
import { currentAccountId } from "../auth/current-account.js";
import { timeZoneOf } from "../time-zone.js";
import { adoptZone } from "../accounts/zone.js";
import { STREAM_SESSION_MS, openEventStream, refuseOrigin } from "./event-stream.js";
import { db } from "../db.js";
import { labelsForTurns, undoTurnLabels, type LabelPickOnWire } from "../threads/labels.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { onAnswer } from "../dumps/answers.js";
import { emit } from "../analytics.js";
import { targetFor, undoWrite, type WriteAction } from "../connectors/write.js";
import { confirmedFor, undoToolWrites, waitingFor, writeThroughTool } from "../connectors/tool-calls.js";
import { waitingSharesFor } from "../threads/proposals.js";
import { connectionsOf } from "../people/access.js";

/** 019's calendar proposals and 022's share proposals, one map. A message
 *  carries at most one control; a share on a message that also proposed a
 *  calendar write is drawn, since it is the later of the two. */
type Waiting = { id: string; because: string; kind: "calendar" | "share"; action?: "create" | "edit" | "delete" };

async function anyWaitingFor(
  messageIds: string[],
): Promise<Map<string, Waiting>> {
  const found = new Map<string, Waiting>();
  for (const [id, waiting] of await waitingFor(messageIds)) found.set(id, { ...waiting, kind: "calendar" });
  for (const [id, waiting] of await waitingSharesFor(messageIds)) found.set(id, waiting);
  return found;
}
import {
  applyAnswer,
  closeOpenQuestions,
  closeQuestion,
  closeQuestionsOfTurn,
  landedIn,
  openQuestionIn,
  optionLabel,
  questionOnWire,
  questionsFor,
  restoreAnswers,
  openQuestionOn,
  optionValue,
  FIELDS,
  type Field,
  type QuestionOnWire,
} from "../questions.js";
import { foundFor } from "../search/found.js";
import { memberOf } from "../threads/access.js";
import { calendarSpan } from "../threads/dates.js";
import { MAX_PDFS, MAX_PHOTOS } from "../blobs/photos.js";
import { fileOnMessage, fileOnRow, fileToWire, type FileOnMessage } from "../blobs/wire.js";
import { actionsOf } from "./threads.js";
import { OverBudget, requireBudget } from "../budget.js";
import type { MailAttrs } from "../mail-in/attrs.js";

/** 020. A blob id that is not this account's, is already claimed, or is
 *  gone. One reason for all three, and the whole dump is refused. */
export class UnknownBlob extends Error {
  constructor() {
    super("unknown_blob");
  }
}

/** 021. The blobs are all the account's, but not a message's worth: two
 *  voice notes, or more photos than one message carries. Refused whole. */
export class BadBlobMix extends Error {
  constructor(readonly code: "one_voice_note" | "too_many_photos" | "too_many_pdfs") {
    super(code);
  }
}

/** Longer than anything the composer is designed for, and short enough that a
 *  paste cannot run up a bill. Refused before anything is written, and never
 *  silently truncated: quietly dropping half of what someone dumped is worse
 *  than telling them it was too long. */
const MAX_DUMP_CHARS = 10_000;

/** A dump joins the newest conversation if it is under this old, and starts a
 *  new one otherwise. Thirty minutes since 30 September 2026, the phones' rule
 *  for a conversation put away, so both surfaces agree: a burst of dumps
 *  around one task is one conversation, and the next subject starts fresh.
 *  It was six hours, a working session, which carried the last subject into
 *  the next one. */
const CONVERSATION_GAP = "30 minutes";

/** Then the client reconnects. Bounds the revocation gap above and keeps a
 *  proxy from closing the stream first and making it look like a failure. */
const STREAM_LIFETIME_MS = 300_000;

const dumpBody = z
  .object({
    /** Empty is allowed only alongside photos; the refinement below says so. */
    text: z.string(),
    /** The outbox idempotency key. A device that retried without hearing the
     *  response must not create the dump twice. */
    clientKey: z.string().max(200).optional(),
    /** 020. Photos uploaded ahead of this message, claimed by it here. Each
     *  must be this account's and unclaimed, or nothing is written. 021: one
     *  of them may be a voice note, so the cap is the photos plus one; the
     *  mix is checked against the rows themselves inside the transaction. */
    blobIds: z.array(z.string().uuid()).max(MAX_PHOTOS + 1).optional(),
    /** 020. They came through the share sheet. Recorded on the message as its
     *  source and on the event as a boolean, and used for nothing else. */
    viaShare: z.boolean().optional(),
    /** 022. Who an @ in the text picked. Kept only where the id is an
     *  accepted connection of the sender; the rest are dropped on receipt,
     *  words intact, so the share tool acts on an id the server vouched for. */
    mentions: z.array(z.object({ accountId: z.string().uuid(), name: z.string().min(1).max(80) })).max(10).optional(),
    /** 025. What a # in the composer picked on a thread: a label by id, or a
     *  name to make. Stored as sent and resolved only once the turn has filed,
     *  against the thread each row landed in; the words stay in the text. */
    labels: z
      .array(z.union([z.strictObject({ id: z.string().uuid() }), z.strictObject({ name: z.string().min(1).max(60) })]))
      .max(10)
      .optional(),
  /** The thread that was on screen when this was dumped.
   *
   *  **A default, not a destination.** Somebody typing into the composer while
   *  looking at a thread almost always means that thread, and saying so every
   *  time would be filing by another name. But "add X to Flat admin" from
   *  inside Lisbon trip means Flat admin, so this reaches the model as where
   *  they are rather than as where it must go, and the words win.
   *
   *  Distinct from the hard pin a quick add carries, which genuinely cannot go
   *  anywhere else because pressing + in a section is the choice.
   *
   *  **Checked for membership before it is written down.** It arrives from a
   *  client and a thread id from a client is never an access decision. */
    threadId: z.string().uuid().optional(),
  })
  .refine((body) => body.text.trim().length > 0 || (body.blobIds?.length ?? 0) > 0, {
    message: "A dump is words, photos, a voice note, or any of them together.",
  });

type MessageState = "queued" | "seen" | "answered" | "failed" | "partial" | "cancelled";

/** One list, used by every response that carries a state, so a value added to
 *  the CHECK constraint cannot reach one endpoint and not another. */
const messageState = z.enum(["queued", "seen", "answered", "failed", "partial", "cancelled"]);

/** The threads a turn actually wrote to.
 *
 *  From the `content` rows it produced, not from parsing the reply. offload
 *  naming a thread it did not write to is the failure 004 exists to prevent,
 *  so the composer's links come from the record of what happened rather than
 *  from the sentence describing it. If the two ever disagree, the links are
 *  right and the sentence is the bug.
 *
 *  037. Each with its icon and hue, read live, as the pill draws it. */
const touchedThreads = z.array(z.object({ id: z.string(), name: z.string(), icon: z.string(), hue: z.number() }));

const dumpResponse = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  state: messageState,
  /** The undo unit, returned at send time so the composer never has to ask for
   *  it later. Undo is offered eight seconds after the reply, and a round trip
   *  inside that window is a round trip that can miss it. */
  turnId: z.string(),
  /** 018. On an answer's response: the turn's second question, now open on
   *  the answering message, so it appears without a reload. */
  question: questionOnWire.nullable().optional(),
  /** 018. On an answer's response: the thread the answer changed, so the
   *  tap's own turn wears the Done mark and the pill at once rather than
   *  after a reload. Empty for the way out, which changed nothing. */
  threads: touchedThreads.optional(),
  /** On an answer's response: the tap changed the row, or put the event on a
   *  calendar. What draws Done when the row's thread has no pill to name. */
  filed: z.boolean().optional(),
  /** 019. On a calendar answer's response: the proposal the tap turned into,
   *  when the calendar needed the person's say-so, drawn on their own turn. */
  waiting: z
    .object({
      id: z.string(),
      because: z.string(),
      kind: z.enum(["calendar", "share"]),
      action: z.enum(["create", "edit", "delete"]).optional(),
    })
    .nullable()
    .optional(),
});

/** A calendar write this turn proposed and nobody has answered yet.
 *
 *  **The reply carries its own control**, which is the house rule: a sentence
 *  cannot be clicked, so offload saying it will add something once you confirm
 *  has to arrive next to the thing that confirms it. Null is the ordinary case;
 *  a write nobody else learns about just happens. */
const waitingOn = z
  .object({
    id: z.string(),
    because: z.string(),
    /** 019 a calendar write, 022 a share. The control's label and the line
     *  under it are the client's, by kind. */
    kind: z.enum(["calendar", "share"]),
    /** What a calendar proposal would do, so the control says it. */
    action: z.enum(["create", "edit", "delete"]).optional(),
  })
  .nullable()
  .optional();

/** The rows an answer showed, grouped as it read them.
 *
 *  One read was one result and one result is one card, so the grouping travels
 *  rather than being reconstructed on the client by guessing from threadId. */
const foundResults = z.array(
  z.object({
    threadId: z.string(),
    /** 028. Null for the default thread: the card says Not in a thread. */
    threadName: z.string().nullable(),
    threadIcon: z.string().nullable(),
    threadHue: z.number().nullable(),
    truncated: z.boolean(),
    rows: z.array(
      z.object({
        contentId: z.string(),
        threadId: z.string(),
        threadName: z.string().nullable(),
        threadIcon: z.string().nullable(),
        threadHue: z.number().nullable(),
        type: z.string(),
        title: z.string(),
        body: z.string().nullable(),
        done: z.boolean(),
        dueAt: z.string().nullable(),
        occursAt: z.string().nullable(),
        occursEndAt: z.string().nullable(),
        allDay: z.boolean(),
        rrule: z.string().nullable(),
        photo: fileOnRow.nullable(),
      })
    ),
  })
);

/** 017. What a cancel did. `stopped` false means the turn had already finished
 *  and nothing was stopped, and `state` is then the turn's real state rather
 *  than the one the press asked for. */
const cancelResponse = z.object({
  state: z.enum(["queued", "seen", "answered", "failed", "partial", "cancelled"]),
  stopped: z.boolean(),
});

/** 026. A forwarded email as the conversation draws it: its subject, and the
 *  note the person typed above the forwarded part. */
function mailOnWire(text: string | null, attrs: unknown): { subject: string; note: string } {
  const mail = (attrs as { mail?: { subject?: string; noteLength?: number } } | null)?.mail ?? {};
  return { subject: mail.subject ?? "", note: (text ?? "").slice(0, mail.noteLength ?? 0).trim() };
}

/** 020. A photo on a person's message, as the client draws it, or a PDF
 *  (041). */
const photoOnWire = fileOnMessage;
type PhotoOnWire = FileOnMessage;

/** 021. The voice note on a person's message, as the client draws it: the
 *  bars and the length at once, the transcript when it exists. `text` on the
 *  message stays the typed words; the two are drawn apart. */
const voiceOnWire = z.object({
  blobId: z.string(),
  durationMs: z.number(),
  waveform: z.array(z.number()),
  transcript: z.string().nullable(),
  transcribed: z.boolean(),
});
type VoiceOnWire = z.infer<typeof voiceOnWire>;

const messageResponse = z.object({
  id: z.string(),
  conversationId: z.string(),
  state: messageState,
  text: z.string().nullable(),
  /** 020. The photos the person's message carries. Always empty on a reply. */
  photos: z.array(photoOnWire),
  /** 021. The voice note it carries, or null. */
  voice: voiceOnWire.nullable(),
  reply: z.string().nullable(),
  threads: touchedThreads,
  /** 028. The turn filed something, including into the default thread, which
   *  has no pill: what draws Done. */
  filed: z.boolean(),
  /** Thread ids whose contents this turn changed, a superset of `threads`.
   *  A move's source is in here and not in `threads`: the screen has to reload
   *  it, and a pill saying the dump went there would be untrue. */
  changed: z.array(z.string()),
  /** 016. Where this turn got something from, for the chips under it. Empty on
   *  every turn that read nothing, which is nearly all of them. */
  sources: z.array(z.object({ domain: z.string(), url: z.string() })),
  /** 025. What the turn applied, in order, for the footer's marks. */
  labels: z.array(z.object({ id: z.string(), name: z.string(), colour: z.number() })),
  /** 017. What offload is doing, on a turn still in flight. Null on anything
   *  settled and on a step old enough to be a dead worker's. */
  step: z.string().nullable(),
  waiting: waitingOn,
  /** 018. The question offload asked back on this turn, while it is open. */
  question: questionOnWire.optional(),
  found: foundResults,
});

/** One screenful. The composer is not a scrollback and the heavy case at 200
 *  messages is already more than it should draw at once. */
const TAIL = 50;

const currentConversation = z.object({
  conversationId: z.string().nullable(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["person", "offload"]),
      text: z.string().nullable(),
      /** 020. Empty on every reply. */
      photos: z.array(photoOnWire),
      /** 021. Null on every reply and on any message without one. */
      voice: voiceOnWire.nullable(),
      /** 026. A forwarded email's subject, which the conversation draws as its
       *  first line; null on everything else. */
      mail: z.object({ subject: z.string(), note: z.string() }).nullable(),
      state: messageState,
      /** What an Undo would reverse. The whole turn, not this row. */
      turnId: z.string(),
      /** When it was sent. The phones start a new conversation once one has
       *  been put away for thirty minutes, and after a cold start this is the
       *  only record of when it was last used. */
      createdAt: z.string(),
      waiting: waitingOn,
      question: questionOnWire.optional(),
      found: foundResults,
      /** Where this turn filed, and where a fact in it came from. Empty on an
       *  offload message and on any turn that read nothing. */
      threads: touchedThreads,
      /** 028. Filed something, loose or not: what draws Done. */
      filed: z.boolean(),
      sources: z.array(z.object({ domain: z.string(), url: z.string() })),
      /** 025. What the turn applied, in order, for the footer's marks. */
      labels: z.array(z.object({ id: z.string(), name: z.string(), colour: z.number() })),
    })
  ),
});

const undoResponse = z.object({ undone: z.boolean(), stayed: z.array(z.string()).optional() });
const notFinishable = z.object({ error: z.literal("not_finishable") });

/** 034. `scope` says whose cap it was. Optional, and both clients branch on
 *  the status alone, so a phone built before it reads the same refusal. */
export const dailyLimit = z.object({ error: z.literal("daily_limit"), scope: z.enum(["account", "platform"]).optional() });

const tooLong = z.object({
  error: z.literal("too_long"),
  maxChars: z.number(),
});
const notFound = z.object({ error: z.literal("not_found") });
const unauthenticated = z.object({ error: z.literal("unauthenticated") });
// 020. A 409 rather than a 400: a 400 schema on this route would also
// serialise Fastify's own validation errors, and they do not fit it. 021's
// two mix refusals ride the same status for the same reason.
const unknownBlob = z.object({ error: z.enum(["unknown_blob", "one_voice_note", "too_many_photos", "too_many_pdfs"]) });

/** 021. The voice note each message carries, with the transcript as the
 *  message holds it. One per message at most. */
export async function voiceForAll(
  messageIds: string[],
  accountId: string,
): Promise<Map<string, VoiceOnWire>> {
  const out = new Map<string, VoiceOnWire>();
  if (messageIds.length === 0) return out;
  const rows = await db
    .selectFrom("blobs")
    .innerJoin("messages", "messages.id", "blobs.message_id")
    .select([
      "blobs.id as id",
      "blobs.message_id as message_id",
      "blobs.duration_ms",
      "blobs.measured_ms",
      "blobs.waveform",
      "messages.transcript",
      "messages.transcribed_at",
    ])
    .where("blobs.message_id", "in", messageIds)
    .where("blobs.kind", "=", "audio")
    .where("messages.account_id", "=", accountId)
    .where("blobs.deleted_at", "is", null)
    .execute();
  for (const row of rows) {
    out.set(row.message_id!, {
      blobId: row.id,
      durationMs: row.measured_ms ?? row.duration_ms ?? 0,
      waveform: row.waveform ?? [],
      transcript: row.transcribed_at ? (row.transcript ?? "") : null,
      transcribed: row.transcribed_at !== null,
    });
  }
  return out;
}

/** 020. The photos a message carries, for the thumbnails beside it.
 *
 *  The name rides along because the reader here is always the dumper: a
 *  conversation is private, so every message this returns is theirs. `ready`
 *  is whether the renditions exist yet; until they do the client draws the
 *  glyph. Never the coordinate, never the device. */
export async function photosForAll(
  messageIds: string[],
  accountId: string,
): Promise<Map<string, PhotoOnWire[]>> {
  const out = new Map<string, PhotoOnWire[]>();
  if (messageIds.length === 0) return out;
  const rows = await db
    .selectFrom("blobs")
    .innerJoin("messages", "messages.id", "blobs.message_id")
    .select([
      "blobs.id as id",
      "blobs.message_id as message_id",
      "blobs.name",
      "blobs.kind",
      "blobs.width",
      "blobs.height",
      "blobs.pages",
      "blobs.renditions_at",
      "blobs.clean_at",
      "blobs.unreadable_at",
      "blobs.created_at",
    ])
    .where("blobs.message_id", "in", messageIds)
    // 041. Photos and PDFs; a voice note is drawn by its own player.
    .where("blobs.kind", "in", ["image", "pdf"])
    .where("messages.account_id", "=", accountId)
    .where("blobs.deleted_at", "is", null)
    .orderBy("blobs.created_at", "asc")
    .execute();
  // 044, 050. The actions a filed picture's or PDF's row carries, by blob, so
  // the conversation draws the same pills the row does. One bounded read for
  // every blob on the page, not a join on the hot path.
  const actions = await actionsForBlobs(
    rows.map((r) => r.id),
    messageIds,
    accountId,
  );
  for (const row of rows) {
    const list = out.get(row.message_id!) ?? [];
    const wire = { ...fileToWire(row), name: row.name };
    const carried = actions.get(row.id);
    list.push(carried ? { ...wire, actions: carried } : wire);
    out.set(row.message_id!, list);
  }
  return out;
}

/** 044, 050. The actions each blob's filed row carries, from its
 *  `attrs.actions`. Scoped to rows derived from the page's own messages, which
 *  are the account's, and per blob the earliest such row that has any, so the
 *  pick is the same on every read (a picture can be carried by its own row and
 *  a task beside it). */
async function actionsForBlobs(
  blobIds: string[],
  messageIds: string[],
  accountId: string,
): Promise<Map<string, NonNullable<ReturnType<typeof actionsOf>>>> {
  const map = new Map<string, NonNullable<ReturnType<typeof actionsOf>>>();
  if (blobIds.length === 0) return map;
  const rows = await db
    .selectFrom("content_blobs")
    .innerJoin("content", "content.id", "content_blobs.content_id")
    .select(["content_blobs.blob_id as blobId", "content.attrs as attrs"])
    .where("content_blobs.blob_id", "in", blobIds)
    .where("content.derived_from_message_id", "in", messageIds)
    // The account's own live rows, as the queries beside this one scope them
    // (OFF-3): a deleted row's actions are not offered under its picture.
    .where("content.account_id", "=", accountId)
    .where("content.deleted_at", "is", null)
    .orderBy("content.created_at", "asc")
    .orderBy("content.id", "asc")
    .execute();
  for (const row of rows) {
    if (map.has(row.blobId)) continue;
    const carried = actionsOf(row.attrs);
    if (carried) map.set(row.blobId, carried);
  }
  return map;
}

/** Where each of a page of messages filed, in one query.
 *
 *  The per-message `threadsFor` is right for a single turn and wrong for a page:
 *  fifty messages is fifty round trips on every open, which is the reasoning
 *  `foundFor` already carries. Only what landed, never `changed`: a pill saying
 *  a turn went somewhere it only moved something out of would be untrue. */
export async function threadsForAll(
  messageIds: string[],
  accountId: string,
): Promise<Map<string, TouchedThread[]>> {
  const out = new Map<string, TouchedThread[]>();
  if (messageIds.length === 0) return out;

  // **Both halves of `threadsFor`, not just the content one.** A turn that only
  // wrote a note reaches a thread through `message_threads`, and 014 made those
  // one concept; reading content alone would drop the pill on every note turn.
  const [filed, noted] = await Promise.all([
    db
      .selectFrom("content")
      .innerJoin("threads", "threads.id", "content.thread_id")
      .select([
        "content.derived_from_message_id as message_id",
        "threads.id as id",
        "threads.name as name",
        "threads.icon as icon",
        "threads.hue as hue",
      ])
      .where("content.derived_from_message_id", "in", messageIds)
      .where("content.account_id", "=", accountId)
      .where("content.deleted_at", "is", null)
      .where("threads.deleted_at", "is", null)
      .orderBy("content.created_at")
      .execute(),
    db
      .selectFrom("message_threads")
      .innerJoin("threads", "threads.id", "message_threads.thread_id")
      // Membership, not authorship, exactly as the single-message version has
      // it: a turn can act on a shared thread and the name is only shown to
      // somebody already in it.
      .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
      .select([
        "message_threads.message_id as message_id",
        "threads.id as id",
        "threads.name as name",
        "threads.icon as icon",
        "threads.hue as hue",
      ])
      .where("message_threads.message_id", "in", messageIds)
      .where("message_threads.landed", "=", true)
      .where("thread_members.account_id", "=", accountId)
      .where("threads.deleted_at", "is", null)
      .orderBy("message_threads.created_at")
      .execute(),
  ]);

  // 028. A turn that filed only loose keeps its key with no pill in it, which
  // is how the tail says it filed something.
  const account = await db.selectFrom("accounts").select("default_thread_id").where("id", "=", accountId).executeTakeFirst();
  for (const row of [...filed, ...noted]) {
    if (!row.message_id) continue;
    const list = out.get(row.message_id) ?? [];
    if (row.id !== account?.default_thread_id && !list.some((t) => t.id === row.id)) list.push({ id: row.id, name: row.name, icon: row.icon, hue: row.hue });
    out.set(row.message_id, list);
  }
  // A calendar write they agreed to is something the turn did, with no thread
  // to name: the key with no pill, as for a turn that filed only loose.
  for (const id of await confirmedFor(messageIds, accountId)) {
    if (!out.has(id)) out.set(id, []);
  }
  return out;
}

/** What each of a page of turns read, for the chip under it, in one query,
 *  for the same reason.
 *
 *  Scoped by account like everything else, and read at the turn rather than at
 *  the reply: an ordinary filing turn writes no reply and may still have read
 *  something. Ordered by when it was read, and uncapped: the chip's "and N
 *  more" is a claim about how many places were read, so the read sees all of
 *  them and the client decides how many to draw. One read for the single
 *  message and the page, so a turn finished twice counts the same after a
 *  reload. */
export async function sourcesForAll(
  turnIds: string[],
  accountId: string,
): Promise<Map<string, { domain: string; url: string }[]>> {
  const out = new Map<string, { domain: string; url: string }[]>();
  if (turnIds.length === 0) return out;

  const rows = await db
    .selectFrom("turn_sources")
    .select(["turn_id", "domain", "url"])
    .where("turn_id", "in", turnIds)
    .where("account_id", "=", accountId)
    .orderBy("created_at")
    .execute();

  for (const row of rows) {
    const list = out.get(row.turn_id) ?? [];
    list.push({ domain: row.domain, url: row.url });
    out.set(row.turn_id, list);
  }
  return out;
}

/** Where a turn's content is now, and every thread it changed.
 *
 *  Two lists because they answer different questions and one of them is a claim
 *  surface. `landed` is what the reply's pills may name and what earns the Done
 *  mark: the turn's content is in these threads. `changed` is every thread
 *  whose contents moved, which the screen needs in order to reload and which
 *  includes the thread a move took something *out of*.
 *
 *  The content join stays for messages written before `message_threads`
 *  existed. Their turns filed rather than edited, because filing was the only
 *  thing that left a record, so the older answer is still the right one for
 *  them.
 *
 *  From the rows, never from the reply. offload naming a thread it did not
 *  write to is the failure 004 exists to prevent, so the composer's links come
 *  from the record of what happened rather than from the sentence describing
 *  it. If the two ever disagree, the links are right and the sentence is a bug.
 */
export async function threadsFor(
  messageId: string,
  accountId: string,
): Promise<{ landed: TouchedThread[]; changed: string[]; filed: boolean }> {
  const [filed, noted] = await Promise.all([
    db
      .selectFrom("content")
      .innerJoin("threads", "threads.id", "content.thread_id")
      .select(["threads.id as id", "threads.name as name", "threads.icon as icon", "threads.hue as hue"])
      .where("content.derived_from_message_id", "=", messageId)
      .where("content.account_id", "=", accountId)
      .where("content.deleted_at", "is", null)
      .orderBy("content.created_at")
      .execute(),
    db
      .selectFrom("message_threads")
      .innerJoin("threads", "threads.id", "message_threads.thread_id")
      // Membership, not authorship: a turn can act on a shared thread's
      // contents, and the name is only shown to somebody already in it.
      .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
      .select(["threads.id as id", "threads.name as name", "threads.icon as icon", "threads.hue as hue", "message_threads.landed as landed"])
      .where("message_threads.message_id", "=", messageId)
      .where("thread_members.account_id", "=", accountId)
      .where("threads.deleted_at", "is", null)
      .orderBy("message_threads.created_at")
      .execute(),
  ]);

  const landed: TouchedThread[] = [];
  const changed = new Set<string>();
  const seen = new Set<string>();
  // 028. What landed in the default thread draws no pill: the footer's Done is
  // the whole of it. It still counts as changed, so My threads reloads.
  const account = await db.selectFrom("accounts").select("default_thread_id").where("id", "=", accountId).executeTakeFirst();

  let any = false;
  for (const row of [...filed.map((r) => ({ ...r, landed: true })), ...noted]) {
    changed.add(row.id);
    if (row.landed) any = true;
    if (!row.landed || seen.has(row.id) || row.id === account?.default_thread_id) continue;
    seen.add(row.id);
    landed.push({ id: row.id, name: row.name, icon: row.icon, hue: row.hue });
  }

  // `filed` is what draws Done: a turn that filed only loose has no pill and
  // still did something. So did one whose calendar write they agreed to: a
  // removal files no row, and without this the control went and nothing said
  // the thing had happened, on the press or after a reload.
  if (!any) any = (await confirmedFor([messageId], accountId)).has(messageId);
  return { landed, changed: [...changed], filed: any };
}

/** The reply to a person's message, if it has been answered.
 *
 *  Matched on turn_id rather than by taking the newest offload message in the
 *  conversation: with two dumps in flight the newest is not necessarily the
 *  answer to this one, and showing somebody the wrong answer under their
 *  message is worse than showing none. */
async function replyFor(
  turnId: string,
  accountId: string,
): Promise<{ id: string; text: string | null } | null> {
  const row = await db
    .selectFrom("messages")
    // **The id as well as the text, and that is the whole of a real bug.**
    // A reply is found by turn, because the caller holds the id of the message
    // somebody sent and the reply is a different row. The rows an answer showed
    // are recorded against that reply, so resolving them for the id the caller
    // happens to hold asks about the question and never about the answer, and
    // comes back empty every time.
    //
    // It looked like the model summarising instead of listing: the sentence
    // arrived, the rows did not. Reloading fixed it, because the conversation
    // tail asks for every message in the page and the reply is one of them.
    .select(["id", "text"])
    .where("turn_id", "=", turnId)
    .where("role", "=", "offload")
    .where("account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  return row ?? null;
}

export interface TouchedThread {
  id: string;
  name: string;
  icon: string;
  hue: number;
}

export type StreamStep =
  /** `replyId` is the offload message, which is a different row from the one
   *  the caller is watching. The rows an answer showed are recorded against it,
   *  so anything resolving them needs this rather than the watched id. */
  | {
      do: "answered";
      reply: string | null;
      replyId: string | null;
      threads: TouchedThread[];
      changed: string[];
      /** 028. The turn filed something, loose or not: what draws Done. */
      filed: boolean;
      sources: { domain: string; url: string }[];
      /** 025. What the turn applied, for the footer's marks. */
      labels: { id: string; name: string; colour: number }[];
    }
  | {
      do: "partial";
      reply: string | null;
      replyId: string | null;
      threads: TouchedThread[];
      changed: string[];
      /** 028. The turn filed something, loose or not: what draws Done. */
      filed: boolean;
      sources: { domain: string; url: string }[];
      /** 025. What the turn applied, for the footer's marks. */
      labels: { id: string; name: string; colour: number }[];
    }
  | { do: "failed" }
  | { do: "close" }
  /** 017. One line of what offload is doing, on a turn still in flight. The
   *  stream stays open: this is not a settlement. 021: the transcript rides
   *  on both of the in-flight answers once it exists, so the bubble draws
   *  what offload heard ahead of the reply. */
  | { do: "step"; text: string; transcript: string | null }
  | { do: "wait"; transcript: string | null };

/** What an open stream should do right now.
 *
 *  Extracted from the stream itself so it can be tested: Better Auth signs its
 *  session cookie, so driving the endpoint from a test would mean replicating
 *  that signing, which is a test that breaks when the library changes rather
 *  than when the behaviour does. The authorization around this is covered by
 *  its own 401 and 404 cases; this is the part with the states in it.
 */
export async function streamStep(
  messageId: string,
  accountId: string,
): Promise<StreamStep> {
  const account = await db
    .selectFrom("accounts")
    .select("state")
    .where("id", "=", accountId)
    .executeTakeFirst();

  // Disabling an account has to reach an open stream. 002 enforces revocation
  // at Better Auth's refresh, which fires on a request, and a stream makes
  // none once it is open (AC-17).
  if (!account || account.state === "disabled") return { do: "close" };

  const current = await db
    .selectFrom("messages")
    .select(["state", "turn_id", "step", "step_at", "transcript", "transcribed_at"])
    .where("id", "=", messageId)
    .where("account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  if (!current) return { do: "close" };
  const transcript = current.transcribed_at ? (current.transcript ?? "") : null;
  if (current.state === "answered" || current.state === "partial") {
    const [reply, touched, read, labelled] = await Promise.all([
      replyFor(current.turn_id, accountId),
      threadsFor(messageId, accountId),
      sourcesForAll([current.turn_id], accountId),
      labelsForTurns([current.turn_id], accountId),
    ]);
    return {
      do: current.state === "answered" ? "answered" : "partial",
      reply: reply?.text ?? null,
      // The reply's own id, so the stream can resolve the rows it showed.
      replyId: reply?.id ?? null,
      threads: touched.landed,
      changed: touched.changed,
      filed: touched.filed,
      sources: read.get(current.turn_id) ?? [],
      // 025. The labels the turn applied, for the footer's marks.
      labels: labelled.get(current.turn_id) ?? [],
    };
  }
  if (current.state === "failed") return { do: "failed" };
  if (current.state === "cancelled") return { do: "close" };

  // **After the settlements, never before.** A worker can post its last step and
  // its result close enough together that one wake sees both, and a step drawn
  // in preference to the answer it preceded is a progress line that outlives the
  // thing it was describing.
  if (current.step && fresh(current.step_at)) {
    return { do: "step", text: current.step, transcript };
  }

  return { do: "wait", transcript };
}

/** Whether a step is recent enough to draw.
 *
 *  A worker that dies mid-turn leaves its last line behind, and the message
 *  stays `seen` until the job's own timeout reaps it. Without this, a client
 *  reconnecting to that turn would be told offload is still looking something
 *  up by a process that no longer exists. Two minutes is longer than any step
 *  and shorter than the reaper. */
const STEP_STALE_MS = 120_000;

function fresh(at: Date | null): boolean {
  return at !== null && Date.now() - at.getTime() < STEP_STALE_MS;
}

/** Take a dump: find or start its conversation, store it, and queue the answer.
 *
 *  Extracted from the route so it can be tested. Better Auth signs its session
 *  cookie, so driving the endpoint from a test would mean replicating that
 *  signing, and that is a test which breaks when the library changes rather than
 *  when this behaviour does. The route keeps the parts that are genuinely about
 *  the request: who is asking, and how long the body is.
 */
export async function takeDump(
  accountId: string,
  text: string,
  clientKey?: string,
  /** The thread on screen, unchecked as it arrived. */
  threadId?: string,
  /** 020. Photos to claim, and whether they came through the share sheet. */
  photos?: { blobIds: string[]; viaShare: boolean },
  /** The device's time zone from the request header, already checked. */
  timeZone: string | null = null,
  /** 022. Mentions as the client sent them, filtered here. */
  mentions: { accountId: string; name: string }[] = [],
  /** 025. A thread dump's # picks, kept for the turn to resolve. */
  labels: LabelPickOnWire[] = [],
  /** 026. A forwarded email: what the turn needs to know it is one, and the
   *  image candidates the look decides between. They stay unclaimed here;
   *  the look claims what it keeps. */
  mail?: { attrs: MailAttrs; candidates: string[] },
): Promise<{
  messageId: string;
  conversationId: string;
  state: MessageState;
  turnId: string;
}> {
  const turnId = randomUUID();
  const blobIds = [...new Set(photos?.blobIds ?? [])];

  // The day's budget, before a word is written: a dump is a model call, and
  // the cap is on starting the next one (security review 2026-09-22, M6).
  await requireBudget(accountId);

  // Membership, before the id is written into a job payload. A thread id from a
  // client is a claim, and this one ends up naming a thread in a model prompt.
  //
  // A stale id is dropped rather than refused. The screen can be looking at a
  // thread that was deleted or left a second ago, and the dump is the part that
  // matters: losing the default is losing a convenience, losing the dump is
  // losing what somebody wrote.
  const lookingAt =
    threadId && (await memberOf(accountId, threadId)) ? threadId : null;
  // 022. A mention is kept only where it names an accepted connection of the
  // sender, and the name it carries is the account's, read here: a client's
  // say-so is never an id the share tool acts on nor a name the prompt
  // repeats.
  const vouched = await (async () => {
    if (mentions.length === 0) return [];
    const known = new Map((await connectionsOf(accountId)).map((c) => [c.accountId, c.displayName ?? ""]));
    const seen = new Set<string>();
    return mentions
      .filter((m) => known.has(m.accountId) && !seen.has(m.accountId) && seen.add(m.accountId))
      .map((m) => ({ accountId: m.accountId, name: known.get(m.accountId) || m.name }));
  })();

  return db.transaction().execute(async (trx) => {
    // 020. Two attempts with one client key, in flight together, which is
    // what a device retrying because it never heard the response looks
    // like. Without this the second would miss the idempotent lookup below,
    // open a conversation of its own, block on the photos' row locks, and
    // find them claimed once the first committed: a 409 for asking twice.
    // The lock on the key serialises the two, so the second sees the
    // first's message and the first's conversation. Released with the
    // transaction.
    if (clientKey) {
      await sql`select pg_advisory_xact_lock(hashtext(${accountId}), hashtext(${clientKey}))`.execute(trx);
    }

    // The join and the insert in one statement each, inside one
    // transaction, so two dumps a millisecond apart cannot disagree about
    // whether they were within the window.
    //
    // 026, amended 2026-10-15. **An email joins nothing and nothing joins
    // it.** Each one is a conversation of its own, ended as it opens: two
    // forwarded minutes apart shared one, and the second turn filed the first
    // again from the history. Answer on Today is the one way back into it.
    const recent = mail
      ? undefined
      : await trx
          .selectFrom("conversations")
          .select("id")
          .where("account_id", "=", accountId)
          .where("deleted_at", "is", null)
          // Closing the composer ends the conversation, so the next dump starts a
          // new one however soon it arrives. Six hours of silence was the only
          // thing that used to end one, which meant somebody who deliberately put
          // a conversation away and began a new subject got answers about the old
          // one.
          .where("ended_at", "is", null)
          .where(
            sql<boolean>`last_message_at > now() - interval '${sql.raw(CONVERSATION_GAP)}'`,
          )
          .orderBy("last_message_at", "desc")
          .limit(1)
          .executeTakeFirst();

    const conversationId =
      recent?.id ??
      (
        await trx
          .insertInto("conversations")
          .values(mail ? { account_id: accountId, ended_at: sql`now()` } : { account_id: accountId })
          .returning("id")
          .executeTakeFirstOrThrow()
      ).id;

    // 018. A question closes with its conversation. A new conversation is the
    // old one ending, so anything still open there closes now, and its chips
    // are gone on the next load. An email's conversation ends nobody's.
    if (!recent && !mail) await closeOpenQuestions(trx, { accountId, exceptConversationId: conversationId });
    // And the one open in this conversation, if any, rides on the job so the
    // worker reads the message as a possible answer before anything else.
    // 026. Never for an email: somebody else's words are not the person's
    // answer, and the question stays open for them.
    const openQuestionId = mail ? null : await openQuestionIn(trx, conversationId);

    // onConflict, not just the check above.
    //
    // That check is a select followed by an insert, and the case it exists
    // for is a device retrying because it never heard the response, which
    // is exactly the case where two requests can be in flight together.
    // Both pass the select, the second hits the unique index, and a person
    // whose network hiccuped gets a 500 for asking twice. The index is the
    // real guarantee; the select just saves the round trip when the retry
    // is late rather than concurrent.
    // 020. A retry of a message that already claimed its photos finds them
    // claimed, so the idempotent path has to come before the claim check
    // rather than only in the insert's conflict clause. The lock at the top
    // is what makes this select see an attempt still in flight.
    if (clientKey && blobIds.length > 0) {
      const already = await trx
        .selectFrom("messages")
        .select(["id", "conversation_id", "state", "turn_id"])
        .where("account_id", "=", accountId)
        .where("client_key", "=", clientKey)
        .executeTakeFirst();
      if (already) {
        return {
          messageId: already.id,
          conversationId: already.conversation_id,
          state: already.state,
          turnId: already.turn_id,
        };
      }
    }

    // 020. Every photo must be this account's, unclaimed and live, or the
    // dump is refused whole: a message that claims a photo it cannot have is
    // worse than no message. Locked, so two dumps cannot claim one photo.
    let voice: { byte_size: number; duration_ms: number | null } | null = null;
    let onlyPdfs = false;
    if (blobIds.length > 0) {
      const mine = await trx
        .selectFrom("blobs")
        .select(["id", "kind", "byte_size", "duration_ms"])
        .where("id", "in", blobIds)
        .where("account_id", "=", accountId)
        .where("message_id", "is", null)
        .where("deleted_at", "is", null)
        .forUpdate()
        .execute();
      if (mine.length !== blobIds.length) throw new UnknownBlob();
      // 021. One voice note, at most ten photos, checked against the rows
      // rather than the ids, since an id says nothing about its kind. 041:
      // the ten are photos and PDFs together, at most two of them PDFs.
      const audio = mine.filter((row) => row.kind === "audio");
      if (audio.length > 1) throw new BadBlobMix("one_voice_note");
      if (mine.filter((row) => row.kind === "pdf").length > MAX_PDFS) throw new BadBlobMix("too_many_pdfs");
      if (mine.length - audio.length > MAX_PHOTOS) throw new BadBlobMix("too_many_photos");
      voice = audio[0] ?? null;
      onlyPdfs = mine.every((row) => row.kind === "pdf");
    }

    const inserted = await trx
      .insertInto("messages")
      .values({
        conversation_id: conversationId,
        account_id: accountId,
        role: "person",
        // 021. A message carrying a voice note is voice, whatever else it
        // carries. Otherwise a photo with no words is an image message, PDFs
        // alone with no words a file message (041), and words with or
        // without either are text; the blobs ride on the row either way.
        type: voice
          ? "voice"
          : (blobIds.length > 0 || (mail?.candidates.length ?? 0) > 0) && text.trim().length === 0
            ? onlyPdfs && blobIds.length > 0
              ? "file"
              : "image"
            : "text",
        turn_id: turnId,
        text: text.trim().length === 0 ? null : text,
        // seen, not queued: offload has it. queued is internal and never
        // reaches a client.
        state: "seen",
        client_key: clientKey ?? null,
        looking_at_thread_id: lookingAt,
        source: mail ? "mail" : photos?.viaShare ? "share" : "person",
        time_zone: timeZone,
        ...(vouched.length > 0 || (lookingAt && labels.length > 0) || mail
          ? {
              attrs: JSON.stringify({
                ...(mail ? { mail: mail.attrs } : {}),
                ...(vouched.length > 0 ? { mentions: vouched } : {}),
                // Only for a dump made on a thread: from Today nothing was
                // known to pick from, and the #words in the text stand in.
                ...(lookingAt && labels.length > 0 ? { labels } : {}),
              }),
            }
          : {}),
      })
      .onConflict((oc) =>
      // The index is partial, on client_key is not null, because most messages
      // have none. Postgres will only infer a partial index when the conflict
      // target repeats its predicate, so this is not decoration: without the
      // where clause it raises "no unique or exclusion constraint matching the
      // ON CONFLICT specification" on every insert.
      oc
        .columns(["account_id", "client_key"])
        .where("client_key", "is not", null)
        .doNothing()
    )
      .returning(["id", "state"])
      .executeTakeFirst();

    // 023. The first zone an account hears becomes its clock; a later one
    // never overwrites, and the strip is where a change is put to them.
    await adoptZone(accountId, timeZone, trx);

    if (!inserted) {
      // The other request won. Return its message rather than a new one,
      // and enqueue nothing: it already did.
      const existing = await trx
        .selectFrom("messages")
        .select(["id", "conversation_id", "state", "turn_id"])
        .where("account_id", "=", accountId)
        .where("client_key", "=", clientKey!)
        .executeTakeFirstOrThrow();
      return {
        messageId: existing.id,
        conversationId: existing.conversation_id,
        state: existing.state,
        // The winning request's turn, not the one this call generated and
        // threw away. Returning the local one would hand back an undo id that
        // matches nothing.
        turnId: existing.turn_id,
      };
    }

    const message = inserted;

    // The claim. Checked above, written here, one transaction.
    let photoBytes = 0;
    let photoCount = 0;
    let pdfs: { byte_size: number; pages: number | null }[] = [];
    if (blobIds.length > 0) {
      const claimed = await trx
        .updateTable("blobs")
        .set({ message_id: message.id })
        .where("id", "in", blobIds)
        .returning(["byte_size", "kind", "pages"])
        .execute();
      const images = claimed.filter((row) => row.kind === "image");
      photoCount = images.length;
      photoBytes = images.reduce((sum, row) => sum + row.byte_size, 0);
      pdfs = claimed.filter((row) => row.kind === "pdf");
    }

    await trx
      .updateTable("conversations")
      .set({ last_message_at: sql`now()` })
      .where("id", "=", conversationId)
      .execute();

    // Same transaction as the write that caused it. A job that references
    // an uncommitted message is a job that fails on a race nobody can
    // reproduce.
    //
    // Ids only in the payload. The text stays in its row: a payload is the
    // thing that ends up in a log line when somebody debugs the queue, and
    // OFF-1 says content does not go there.
    await enqueue({
      kind: "dump.answer",
      accountId,
      payload: {
        messageId: message.id,
        conversationId,
        turnId,
        ...(openQuestionId ? { openQuestionId } : {}),
        // 026. The worker files an email as a dump and never reads it as a
        // question to answer.
        ...(mail ? { mail: true } : {}),
        ...(mail && mail.candidates.length > 0 ? { mailLook: mail.candidates } : {}),
      },
      priority: PRIORITY.interactive,
      // One retry, then the person is told (AC-5). The column's default is
      // 5, which is right for email and wrong for somebody watching a
      // thinking indicator.
      maxAttempts: 2,
      tx: trx,
    });

    // The pseudonym, not the account id: an event never carries one
    // (OFF-1). Read inside the transaction and emitted inside it too, so a
    // dump that rolls back does not leave an event claiming it happened.
    const subject = await trx
      .selectFrom("accounts")
      .select("analytics_subject_id")
      .where("id", "=", accountId)
      .executeTakeFirst();

    await emit({
      name: "dump_sent",
      subjectId: subject?.analytics_subject_id ?? null,
      platform: "web",
      // Counts, sizes and booleans. Never a name, never a transcript (OFF-1).
      // The voice note's seconds are the device's own count here; the
      // provider's measurement lands on the ledger row, not on this event.
      properties: {
        photos: photoCount,
        photo_bytes: photoBytes,
        via_share: Boolean(photos?.viaShare),
        // 041. Counts, bytes and pages; never a name.
        ...(pdfs.length > 0
          ? {
              pdfs: pdfs.length,
              pdf_bytes: pdfs.reduce((sum, row) => sum + row.byte_size, 0),
              pdf_pages: pdfs.reduce((sum, row) => sum + (row.pages ?? 0), 0),
            }
          : {}),
        ...(mail ? { via_mail: true } : {}),
        ...(voice
          ? { voice: true, voice_seconds: Math.round((voice.duration_ms ?? 0) / 1000), voice_bytes: voice.byte_size }
          : {}),
      },
      tx: trx,
    });

    return { messageId: message.id, conversationId, state: message.state, turnId };
  });
}

export async function dumpRoutes(app: App): Promise<void> {
  app.post(
    "/v1/dumps",
    {
      schema: {
        body: dumpBody,
        // 400 is deliberately not in this map: a validation failure and an
        // unknown photo both answer 400, with different bodies, and a schema
        // for one turns the other into a 500 at serialisation.
        response: { 202: dumpResponse, 401: unauthenticated, 409: unknownBlob, 413: tooLong, 429: dailyLimit },
      },
    },
    async (request, reply) => {
      // **Timed in three parts, and the parts go back to the browser.** The
      // request measured 1.5 seconds from a laptop in Lisbon against 45ms of
      // server time, and nothing could say where the rest went. Server-Timing
      // puts the split on the response, Timing-Allow-Origin lets a page on
      // our own origin read it, and the log line keeps it with no content in
      // it. The origin is echoed only after CORS has already accepted it.
      const startedAt = performance.now();
      const marks: [string, number][] = [];
      const mark = (name: string): void => {
        const last = marks.length ? marks[marks.length - 1]![1] : 0;
        marks.push([name, performance.now() - startedAt - last]);
      };
      const timed = (): void => {
        const total = performance.now() - startedAt;
        reply.header(
          "Server-Timing",
          [...marks.map(([n, d]) => `${n};dur=${d.toFixed(1)}`), `total;dur=${total.toFixed(1)}`].join(", "),
        );
        if (request.headers.origin) reply.header("Timing-Allow-Origin", request.headers.origin);
        request.log.info(
          { timing: Object.fromEntries(marks.map(([n, d]) => [n, Math.round(d)])), totalMs: Math.round(total) },
          "dump timing",
        );
      };

      const accountId = await currentAccountId(request);
      mark("session");
      if (!accountId)
        return reply.code(401).send({ error: "unauthenticated" as const });

      const { text, clientKey, threadId, blobIds, viaShare, mentions, labels } = request.body;

      // Before the write, not after. AC-14.
      if (text.length > MAX_DUMP_CHARS) {
        return reply
          .code(413)
          .send({ error: "too_long" as const, maxChars: MAX_DUMP_CHARS });
      }

      // Idempotency first, so a retry never reaches the conversation logic and
      // cannot start a second conversation on the six-hour boundary.
      if (clientKey) {
        const existing = await db
          .selectFrom("messages")
          .select(["id", "conversation_id", "state", "turn_id"])
          .where("account_id", "=", accountId)
          .where("client_key", "=", clientKey)
          .executeTakeFirst();
        if (existing) {
          mark("idempotent");
          timed();
          return reply.code(202).send({
            messageId: existing.id,
            conversationId: existing.conversation_id,
            state: existing.state,
            turnId: existing.turn_id,
          });
        }
      }
      mark("idempotency");

      let result;
      try {
        result = await takeDump(
          accountId,
          text,
          clientKey,
          threadId,
          blobIds?.length ? { blobIds, viaShare: Boolean(viaShare) } : undefined,
          timeZoneOf(request),
          mentions ?? [],
          labels ?? [],
        );
      } catch (error) {
        if (error instanceof UnknownBlob) {
          timed();
          return reply.code(409).send({ error: "unknown_blob" as const });
        }
        if (error instanceof BadBlobMix) {
          timed();
          return reply.code(409).send({ error: error.code });
        }
        if (error instanceof OverBudget) {
          timed();
          return reply.code(429).send({ error: "daily_limit" as const, scope: error.scope });
        }
        throw error;
      }
      mark("dump");
      timed();

      return reply.code(202).send(result);
    },
  );

  app.get(
    "/v1/messages/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: messageResponse, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId)
        return reply.code(401).send({ error: "unauthenticated" as const });

      const message = await db
        .selectFrom("messages")
        .select(["id", "conversation_id", "state", "text", "turn_id", "step", "step_at"])
        .where("id", "=", request.params.id)
        // Scoped, so another account's id is not found rather than forbidden:
        // a 403 confirms the row exists.
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        .executeTakeFirst();

      if (!message)
        return reply.code(404).send({ error: "not_found" as const });

      const settled = message.state === "answered" || message.state === "partial";
      const touched = settled
        ? await threadsFor(message.id, accountId)
        : { landed: [], changed: [], filed: false };
      // One lookup for both the sentence and the id its rows hang off.
      const replyRow = settled ? await replyFor(message.turn_id, accountId) : null;

      return reply.send({
        id: message.id,
        conversationId: message.conversation_id,
        state: message.state,
        text: message.text,
        photos: (await photosForAll([message.id], accountId)).get(message.id) ?? [],
        voice: (await voiceForAll([message.id], accountId)).get(message.id) ?? null,
        reply: replyRow?.text ?? null,
        // Where it actually went, and everything it changed. Both empty until
        // the turn settles, which is the honest answer while it is running.
        threads: settled ? touched.landed : [],
        filed: settled ? touched.filed : false,
        changed: settled ? touched.changed : [],
        // Read at the turn rather than at the reply: a filing turn writes no
        // reply and may still have read something.
        sources: settled ? ((await sourcesForAll([message.turn_id], accountId)).get(message.turn_id) ?? []) : [],
        // 025. What the turn applied, once it has settled.
        labels: settled ? ((await labelsForTurns([message.turn_id], accountId)).get(message.turn_id) ?? []) : [],
        // 017. Null on anything settled, so a client polling after the answer
        // is never handed a progress line for work that is over. This is the
        // reconnect path: the stream is the fast one and this is the one that
        // survives a dropped socket.
        step: settled || !fresh(message.step_at) ? null : message.step,
        // The control arrives with the reply that mentions it, rather than on
        // the next reload. A reply saying offload is waiting, with nothing to
        // answer it, is the dead end this whole change is about.
        waiting: settled ? ((await anyWaitingFor([message.id])).get(message.id) ?? null) : null,
        // 018. Same reason, same place: the question arrives with the turn
        // that asked it, and survives a reload because it is read here too.
        question: settled ? ((await questionsFor(accountId, [message.id])).get(message.id) ?? null) : null,
        // The rows an answer showed, resolved now rather than stored. Empty for
        // a dump, which files rather than answers.
        // Against the reply, never against the message being asked about. The
        // question carries no rows; the answer does.
        found: replyRow ? ((await foundFor([replyRow.id], accountId)).get(replyRow.id) ?? []) : [],
      });
    },
  );

  // The tail of the current conversation.
  //
  // AC-1 promises that somebody who sends a dump and loses connectivity finds
  // it on next load. The row was always safe, but until this existed there was
  // no way to reach it: the only routes were send, fetch one message by an id
  // the browser had forgotten, and a stream. The impl-spec's volume section had
  // already designed this read and nothing had built it.
  //
  // A fixed tail rather than the whole thing, cursorless because the composer
  // shows one screen and the heavy case at 200 messages is already more than it
  // should render. Paging arrives with a conversation view that can scroll.
  app.get(
    "/v1/conversations/current",
    { schema: { response: { 200: currentConversation, 401: unauthenticated } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const conversation = await db
        .selectFrom("conversations")
        .select(["id"])
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        // The same predicate as the dump's own lookup, and for the same
        // reason: a conversation somebody closed must not come back on the
        // next load. Its messages are still there, they are just not the
        // current conversation any more.
        .where("ended_at", "is", null)
        .where(sql<boolean>`last_message_at > now() - interval '${sql.raw(CONVERSATION_GAP)}'`)
        .orderBy("last_message_at", "desc")
        .limit(1)
        .executeTakeFirst();

      if (!conversation) return reply.send({ conversationId: null, messages: [] });

      const rows = await db
        .selectFrom("messages")
        .select(["id", "role", "text", "state", "turn_id", "created_at", "source", "attrs"])
        .where("conversation_id", "=", conversation.id)
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        .orderBy("created_at", "desc")
        .limit(TAIL)
        .execute();

      // A proposal survives a reload, which is the point of reading it here as
      // well as returning it with the turn. Somebody who backgrounds the app
      // mid-confirmation comes back to the same question rather than to a reply
      // about a thing that never happened.
      const waiting = await anyWaitingFor(rows.map((row) => row.id));
      // 018. The open question, one query for the page, same shape.
      const questions = await questionsFor(accountId, rows.map((row) => row.id));
      // One query for the whole page, the same shape `waitingFor` takes. Per
      // message it is fifty queries on every open.
      const found = await foundFor(
        rows.map((row) => row.id),
        accountId,
      );

      // **The footer, which a reload used to empty.** Every settled turn lost
      // its Done mark, the thread it filed into and anything it read, because
      // the tail carried none of the three: they were resolved only on the
      // stream and on the single-message read. On a phone that is one cold start
      // away, and it is the third time this endpoint has dropped something the
      // rest of the API returns. `waiting` and `found` are the first two, and
      // the comment above them says the same sentence.
      const [landed, sources, photos, voices, labelled] = await Promise.all([
        threadsForAll(
          rows.map((row) => row.id),
          accountId,
        ),
        sourcesForAll(
          rows.map((row) => row.turn_id),
          accountId,
        ),
        photosForAll(
          rows.map((row) => row.id),
          accountId,
        ),
        voiceForAll(
          rows.map((row) => row.id),
          accountId,
        ),
        labelsForTurns(
          [...new Set(rows.map((row) => row.turn_id))],
          accountId,
        ),
      ]);

      // 036. A dump whose only photo its person has since deleted has nothing
      // left to draw, and the reply under it names what is gone: the whole
      // turn leaves the conversation rather than leaving an empty bubble. A
      // dump always arrives with words, a photo or a voice note, so a
      // person's message with none of the three is exactly that case.
      const emptied = new Set(
        rows
          .filter(
            (row) =>
              row.role === "person" &&
              row.source !== "mail" &&
              !row.text &&
              !photos.has(row.id) &&
              !voices.has(row.id),
          )
          .map((row) => row.turn_id),
      );

      return reply.send({
        conversationId: conversation.id,
        messages: rows.filter((row) => !emptied.has(row.turn_id)).reverse().map((row) => ({
          id: row.id,
          role: row.role,
          text: row.text,
          photos: photos.get(row.id) ?? [],
          voice: voices.get(row.id) ?? null,
          // The note they typed above the forwarded part, never the forwarded
          // header: the rows it filed hold the email.
          mail: row.source === "mail" ? mailOnWire(row.text, row.attrs) : null,
          state: row.state,
          turnId: row.turn_id,
          createdAt: new Date(row.created_at).toISOString(),
          waiting: waiting.get(row.id) ?? null,
          question: questions.get(row.id) ?? null,
          found: found.get(row.id) ?? [],
          // Where it went and where a fact came from, both from the record of
          // what was written rather than from anything the reply said.
          threads: landed.get(row.id) ?? [],
          // 028. Filed something, loose or not: what draws Done after a reload.
          filed: landed.has(row.id),
          sources: sources.get(row.turn_id) ?? [],
          // 025. On the person's message only, where the footer is drawn.
          labels: row.role === "person" ? (labelled.get(row.turn_id) ?? []) : [],
        })),
      });
    }
  );

  // Ending the current conversation, because somebody closed it.
  //
  // The composer's close is a statement, not a tidy-up: this subject is over.
  // Before this it cleared the screen and nothing else, so the next dump joined
  // the same conversation and offload answered it holding the previous one.
  //
  // **Ends whatever is current rather than an id the client names.** The client
  // knows the conversation it was showing, but by the time the request lands
  // that may not be the one a dump from another device just started, and ending
  // a conversation somebody is still typing into is worse than the bug. So the
  // server ends what its own lookup would have reused, which is exactly the
  // thing the close was about.
  //
  // Idempotent, and quiet about finding nothing: closing an empty composer, or
  // closing twice, is a normal thing to do and not a failure.
  app.post(
    "/v1/conversations/current/end",
    { schema: { response: { 200: z.object({ ended: z.boolean() }), 401: unauthenticated } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const ended = await db
        .updateTable("conversations")
        .set({ ended_at: sql`now()` })
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        .where("ended_at", "is", null)
        .where(sql<boolean>`last_message_at > now() - interval '${sql.raw(CONVERSATION_GAP)}'`)
        .executeTakeFirst();

      return reply.send({ ended: (ended.numUpdatedRows ?? 0n) > 0n });
    }
  );

  // The answer, pushed rather than polled.
  //
  // This reverses a recorded decision, that "the queue carries the response, so
  // there is no second channel... and no reconnection or resumption cases".
  // It is a second channel and it does have those cases. Logged in
  // decisions.md with its cost.
  //
  // **It is an optimisation over polling, not a replacement for it.** GET
  // /v1/messages/:id stays, and the client falls back to it whenever the stream
  // closes without an answer. That is what makes it safe to be an optimisation:
  // nothing is lost if the stream never connects at all.
  app.get(
    "/v1/messages/:id/stream",
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      if (refuseOrigin(request, reply)) return;
      const accountId = await currentAccountId(request);
      if (!accountId)
        return reply.code(401).send({ error: "unauthenticated" as const });

      const message = await db
        .selectFrom("messages")
        .select(["id", "state", "turn_id"])
        .where("id", "=", request.params.id)
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        .executeTakeFirst();

      if (!message)
        return reply.code(404).send({ error: "not_found" as const });

      let closed = false;
      // Set once the stream subscribes. A stream that goes away without
      // unsubscribing leaves a closure in a map for the life of the process,
      // which is the same leak as an EventSource nobody closes.
      let unsubscribe: (() => void) | null = null;
      const finish = (): void => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        clearInterval(timer);
        clearTimeout(lifetime);
        if (!reply.raw.writableEnded) reply.raw.end();
      };
      request.raw.on("close", finish);

      openEventStream(request, reply);

      // A socket that dies mid-write emits on the response. Unhandled, that is
      // an uncaught exception on a process serving everybody else.
      reply.raw.on("error", () => finish());

      /** Every write goes through here, and every write re-checks.
       *
       *  The check cannot be done once at the top of a tick: there are two
       *  awaits between there and the write, and a client that closes the tab
       *  during either one runs the close handler concurrently. The tick then
       *  resumes and writes to a response that has already ended, which throws
       *  from inside a `void tick()` and becomes an unhandled rejection. A
       *  person closing a tab mid-dump is the ordinary case, not an edge one. */
      const write = (chunk: string): void => {
        if (closed || reply.raw.writableEnded) return;
        try {
          reply.raw.write(chunk);
        } catch {
          finish();
        }
      };

      const send = (event: string, data: unknown): void => {
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      /** One look at the message, and at whether this person may still see it.
       *
       *  The session check runs on every tick and not only at connect. 002
       *  enforces revocation at Better Auth's refresh, which fires on a
       *  request, and an open stream makes none: without this, disabling an
       *  account would leave its stream delivering conversation updates for as
       *  long as it stayed open. The tick interval is therefore the exposure,
       *  and it is stated rather than discovered. */
      const tick = async (checkSession: boolean): Promise<void> => {
        if (closed) return;
        try {
          // The session only on the clock. The answer arrives by notification,
          // and re-checking a session every time one lands would be a Better
          // Auth call per answer for no gain.
          if (checkSession) {
            const stillAllowed = await currentAccountId(request);
            if (stillAllowed !== accountId) return finish();
          }

          const step = await streamStep(message.id, accountId);
          if (step.do === "answered" || step.do === "partial") {
            send("done", {
              state: step.do,
              reply: step.reply,
              threads: step.threads,
              changed: step.changed,
              // 028. What draws Done when nothing has a pill. `streamStep`
              // always worked it out and this dropped it, so a turn that
              // filed only where no thread is named wore no Done mark until
              // a reload, which reads the tail and gets it.
              filed: step.filed,
              sources: step.sources,
              // 025. The labels the turn applied, for the footer's marks.
              labels: step.labels,
              // 021. The transcript rides the settlement too, for a wake that
              // sees the write and the reply together.
              voice: (await voiceForAll([message.id], accountId)).get(message.id) ?? null,
              // 041. And the files, so a PDF learns it can be opened.
              photos: (await photosForAll([message.id], accountId)).get(message.id) ?? [],
              waiting: (await anyWaitingFor([message.id])).get(message.id) ?? null,
              // 018. The question, with the turn that asked it.
              question: (await questionsFor(accountId, [message.id])).get(message.id) ?? null,
              // Arrives with the reply that mentions it, rather than on the
              // next reload. Same reason the confirmation does.
              found: step.replyId
                ? ((await foundFor([step.replyId], accountId)).get(step.replyId) ?? [])
                : [],
            });
            return finish();
          }
          if (step.do === "failed") {
            send("failed", {
              state: "failed",
              // 021. Whether the words were written before the turn failed
              // decides which line the bubble draws.
              voice: (await voiceForAll([message.id], accountId)).get(message.id) ?? null,
            });
            return finish();
          }
          if (step.do === "close") return finish();

          // 021. The transcript, the moment it is written and on every wake
          // after, for the same reason the step repeats: the client draws it
          // rather than appending it, and a repeat is a no-op on screen.
          if (step.transcript !== null) send("transcript", { text: step.transcript });

          // 017. The one event that does not end the stream. Sent on every wake
          // that finds a step, which means the same line can be sent twice if
          // something else woke the loop; the client draws a step rather than
          // appending one, so a repeat is a no-op on screen and cheaper than
          // holding per-connection state to deduplicate it.
          if (step.do === "step") {
            send("step", { text: step.text });
            return;
          }

          // A comment frame, only on the clock. Its job is to keep an idle
          // proxy from dropping a stream that is legitimately waiting on a
          // model.
          if (checkSession) write(": keep-alive\n\n");
        } catch {
          // A failed tick is not worth killing the process over. The client
          // reconnects, or falls back to asking.
          finish();
        }
      };

      send("thinking", { state: message.state });

      // The clock, for the session check and the keep-alive only.
      const timer = setInterval(() => void tick(true), STREAM_SESSION_MS);

      // Bounded. The client reconnects, which re-runs the authorization above
      // and bounds how stale an open stream's view of a session can be.
      const lifetime = setTimeout(finish, STREAM_LIFETIME_MS);

      // Woken by the transaction that writes the reply, so the answer goes out
      // the instant it commits and nothing asks in the meantime.
      //
      // Subscribed before the first read, deliberately. The other order has a
      // gap: an answer committing between the read and the subscribe would
      // notify nobody, and the stream would then wait for a notification that
      // had already happened.
      unsubscribe = await onAnswer(message.id, () => void tick(false));

      // And then read once, in case it landed before any of this, which is
      // common on a fast model and on a reconnect.
      await tick(false);

      return;
    },
  );

  // Undo, and the one thing it must not leave behind.
  //
  // The unit is the whole turn: the person's message, every piece of content
  // derived from it, and offload's reply. The reply especially. A reply saying
  // "Added to Flat admin" that survives its own undo is a false statement
  // sitting permanently in history, which is exactly the pretence 004 exists to
  // retire, recreated by the mechanism meant to protect against it.
  //
  // **No server-side time window.** The eight seconds is the toast's lifetime
  // in the client. A window here would add a clock-skew failure mode to defend
  // against somebody deleting their own content, which is not a threat and is
  // arguably a feature. Written down because the acceptance criterion says
  // "available for eight seconds" and a reader would otherwise look for a check
  // that is deliberately absent.
  app.post(
    "/v1/turns/:turnId/undo",
    {
      schema: {
        params: z.object({ turnId: z.string().uuid() }),
        response: { 200: undoResponse, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId)
        return reply.code(401).send({ error: "unauthenticated" as const });

      const outcome = await undoTurn(accountId, request.params.turnId);

      if (!outcome) return reply.code(404).send({ error: "not_found" as const });
      return reply.send(outcome);
    },
  );

  // 017. Stop a turn that is taking too long.
  //
  // **Cancel stops work. It does not reverse it.** Everything filed before the
  // press stays filed, and Undo is the thing that takes it back: a cancel that
  // rolled back would make the control destructive, and the whole reason it
  // exists is that somebody wants their screen returned.
  //
  // **Idempotent, and a no-op once the turn has settled.** A press that races
  // the answer loses, because the work is already done and there is nothing left
  // to stop. The response says what state the turn is actually in, so a client
  // that cancelled and then reconnected is not told "stopped" about a turn that
  // finished.
  app.post(
    "/v1/turns/:turnId/cancel",
    {
      schema: {
        params: z.object({ turnId: z.string().uuid() }),
        response: { 200: cancelResponse, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId)
        return reply.code(401).send({ error: "unauthenticated" as const });

      const outcome = await cancelTurn(accountId, request.params.turnId);
      if (!outcome) return reply.code(404).send({ error: "not_found" as const });
      return reply.send(outcome);
    },
  );

  // 018. Answer a question offload asked back.
  //
  // **A tap runs no model.** The server fills the one field on the one row the
  // question was about, writes the person's words into the log as their own
  // turn, and settles. The escape closes the question and writes the words.
  // Only the country question runs anything afterwards: its answer re-runs
  // the answering turn, read-only, and the envelope says `seen` so the
  // composer waits for it exactly as it waits for a dump.
  app.post(
    "/v1/questions/:id/answer",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({ option: z.number().int().min(0).max(4) }),
        response: {
          200: dumpResponse,
          401: unauthenticated,
          404: notFound,
          // A country answer re-runs the turn, and the day is used.
          429: dailyLimit,
          // 019. A calendar answer's write did not go through. The question
          // is open again and the client draws the failure line with the
          // chips still there.
          502: z.object({ error: z.literal("did_not_go_through") }),
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const timeZone = timeZoneOf(request);
      let outcome;
      try {
        outcome = await answerQuestion(accountId, request.params.id, request.body.option, timeZone);
      } catch (error) {
        if (error instanceof OverBudget) return reply.code(429).send({ error: "daily_limit" as const, scope: error.scope });
        throw error;
      }
      if (!outcome) return reply.code(404).send({ error: "not_found" as const });
      if ("calendar" in outcome) {
        const answered = await answerCalendarQuestion(accountId, { ...outcome.calendar, timeZone });
        if (!answered) return reply.code(404).send({ error: "not_found" as const });
        if (answered.failed) return reply.code(502).send({ error: "did_not_go_through" as const });
        request.log.info({ field: "calendar", how: "tap", applied: answered.applied }, "question answered");
        return reply.send(answered.envelope);
      }
      request.log.info(
        { field: outcome.field, how: "tap", applied: outcome.applied, escape: outcome.escape },
        "question answered",
      );
      return reply.send(outcome.envelope);
    },
  );

  // 027, 2026-10-15. Answer on a Today card whose question only typing can
  // answer: a date, span or time with no values to offer. The conversation
  // that asked becomes the current one again, so the composer opens on it with
  // the question and its invitation, and the next dump is read against the
  // question first through 018's own path. Nothing new rides on the dump.
  //
  // **Whatever was live ends, as closing the composer ends it**, and its open
  // question closes with it, which is 018's rule for a new conversation.
  // `last_message_at` is what makes a conversation current, so it moves here
  // although no message was written; nothing else reads it.
  app.post(
    "/v1/questions/:id/resume",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ conversationId: z.string() }), 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const conversationId = await db.transaction().execute(async (trx) => {
        const asked = await trx
          .selectFrom("questions")
          .innerJoin("conversations", "conversations.id", "questions.conversation_id")
          .select("questions.conversation_id")
          .where("questions.id", "=", request.params.id)
          .where("questions.account_id", "=", accountId)
          .where("questions.state", "=", "open")
          // Only what typing answers; a question with values is tapped. An
          // email's is any field: its Activity row opens it here (026 AC-17).
          .where((eb) =>
            eb.or([
              eb("questions.field", "in", ["date", "span", "time"]),
              eb.exists(eb.selectFrom("messages as m").select("m.id").whereRef("m.id", "=", "questions.message_id").where("m.source", "=", "mail")),
            ]),
          )
          // The question's account is not held to its conversation's by the
          // schema, so the conversation is checked as the account's too.
          .where("conversations.account_id", "=", accountId)
          .where("conversations.deleted_at", "is", null)
          .executeTakeFirst();
        if (!asked) return null;
        await trx
          .updateTable("conversations")
          .set({ ended_at: sql`now()` })
          .where("account_id", "=", accountId)
          .where("id", "<>", asked.conversation_id)
          .where("deleted_at", "is", null)
          .where("ended_at", "is", null)
          .where(sql<boolean>`last_message_at > now() - interval '${sql.raw(CONVERSATION_GAP)}'`)
          .execute();
        await closeOpenQuestions(trx, { accountId, exceptConversationId: asked.conversation_id });
        await trx
          .updateTable("conversations")
          .set({ ended_at: null, last_message_at: sql`now()` })
          .where("id", "=", asked.conversation_id)
          .where("account_id", "=", accountId)
          .execute();
        return asked.conversation_id;
      });

      if (!conversationId) return reply.code(404).send({ error: "not_found" as const });
      return reply.send({ conversationId });
    },
  );

  // Finish a turn that stopped partway.
  //
  // A fresh job against the same message, not a fresh dump. The planner is
  // given what already landed and asked to do the rest, so the resume adds to
  // the turn rather than replacing it, and nothing already filed is touched.
  app.post(
    "/v1/dumps/:messageId/resume",
    {
      schema: {
        params: z.object({ messageId: z.string().uuid() }),
        response: { 200: dumpResponse, 401: unauthenticated, 404: notFound, 409: notFinishable, 429: dailyLimit },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId)
        return reply.code(401).send({ error: "unauthenticated" as const });

      // A resume is a model turn like a dump, so the day's cap holds it too.
      try {
        await requireBudget(accountId);
      } catch (error) {
        if (error instanceof OverBudget) return reply.code(429).send({ error: "daily_limit" as const, scope: error.scope });
        throw error;
      }

      const message = await db
        .selectFrom("messages")
        .select(["id", "conversation_id", "state", "turn_id"])
        .where("id", "=", request.params.messageId)
        .where("account_id", "=", accountId)
        .where("role", "=", "person")
        .where("deleted_at", "is", null)
        .executeTakeFirst();

      if (!message) return reply.code(404).send({ error: "not_found" as const });

      // Only a turn that stopped. Resuming an answered one would file a second
      // copy of everything, and resuming one still in flight would put two
      // planners on the same message.
      if (message.state !== "partial" && message.state !== "failed") {
        return reply.code(409).send({ error: "not_finishable" as const });
      }

      const state = await db.transaction().execute(async (trx) => {
        // Back to seen, so the composer's existing wait path applies unchanged
        // and turn-result's idempotency guard has something to match. Guarded
        // on the state, so of two resumes at once only one starts a planner.
        const moved = await trx
          .updateTable("messages")
          .set({ state: "seen" })
          .where("id", "=", message.id)
          .where("state", "in", ["partial", "failed"])
          .executeTakeFirst();
        if (Number(moved.numUpdatedRows) === 0) return null;

        // 021. The open question, as the original enqueue carried it: a
        // spoken answer whose transcription failed once is still read as an
        // answer on the retry.
        const openQuestionId = await openQuestionIn(trx, message.conversation_id);
        await enqueue({
          kind: "dump.answer",
          accountId,
          payload: {
            messageId: message.id,
            conversationId: message.conversation_id,
            turnId: message.turn_id,
            ...(openQuestionId ? { openQuestionId } : {}),
          },
          priority: PRIORITY.interactive,
          maxAttempts: 2,
          tx: trx,
        });

        return "seen" as const;
      });
      if (!state) return reply.code(409).send({ error: "not_finishable" as const });

      return reply.send({
        messageId: message.id,
        conversationId: message.conversation_id,
        state,
        turnId: message.turn_id,
      });
    },
  );
}

/** Stop a turn that is taking too long. 017.
 *
 *  Extracted from the route for the reason `undoTurn` is: Better Auth signs the
 *  session cookie, so driving the endpoint from a test would mean replicating
 *  that signing, which is a test that breaks when the library changes rather
 *  than when the product does.
 *
 *  Null when the turn is not this account's, which the route turns into a 404
 *  rather than a 403: a 403 confirms the row exists.
 */
export async function cancelTurn(
  accountId: string,
  turnId: string,
): Promise<{ state: MessageState; stopped: boolean } | null> {
  // The turn resolved to this account server-side (SEC-2). A turn id is a uuid
  // somebody could hold from elsewhere, and this is the only thing standing
  // between that and cancelling a stranger's work.
  const message = await db
    .selectFrom("messages")
    .select(["id", "state"])
    .where("turn_id", "=", turnId)
    .where("account_id", "=", accountId)
    .where("role", "=", "person")
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  if (!message) return null;

  // Already over. Say what it actually is rather than what was asked for, so a
  // client that cancelled and then reconnected is not told "stopped" about a
  // turn that finished.
  if (message.state !== "seen" && message.state !== "queued") {
    return { state: message.state, stopped: false };
  }

  await db.transaction().execute(async (trx) => {
    // The jobs still to do for this message. Matched on state rather than on an
    // id, because an answer turn can have queued a second job and stopping one
    // of two is not stopping.
    const jobs = await trx
      .updateTable("jobs")
      .set({ cancelled_at: new Date() })
      .where("kind", "in", ["dump.plan", "dump.answer"])
      .where("account_id", "=", accountId)
      .where("state", "in", ["queued", "running"])
      .where(sql<string>`payload ->> 'messageId'`, "=", message.id)
      .returning("id")
      .execute();

    // The step goes with it. A progress line surviving a cancel would be the
    // screen still saying offload is working on something nobody is working on.
    await trx
      .updateTable("messages")
      .set({ step: null, step_at: null })
      .where("id", "=", message.id)
      .execute();

    // **One notification per cancelled job, on the worker's own channel.**
    // Separate from `offload_answer` because the direction is opposite and the
    // listener is a different process: the client listens for answers, the
    // worker listens for this.
    for (const job of jobs) {
      await sql`select pg_notify(${"offload_cancel"}, ${job.id})`.execute(trx);
    }

    // **No job left to settle it, so the state is written here.** Otherwise the
    // worker posts `cancelled` and the turn settles through the one path every
    // other outcome takes. A job the worker reaped as dead never will, and the
    // message would read as thinking for good, with resume refusing it.
    if (jobs.length === 0) {
      const settled = await trx
        .updateTable("messages")
        .set({ state: "cancelled" })
        .where("id", "=", message.id)
        .where("state", "in", ["seen", "queued"])
        .executeTakeFirst();
      if (Number(settled.numUpdatedRows) > 0) {
        await sql`select pg_notify(${"offload_answer"}, ${message.id})`.execute(trx);
      }
    }
  });

  return { state: "cancelled", stopped: true };
}

/** Undo one turn: what they dumped, everything derived from it, and what
 *  offload said about it.
 *
 *  Exported for the same reason `takeDump` is. Better Auth signs its session
 *  cookie, so a test cannot reach a session-scoped route by pretending, and the
 *  properties worth asserting here are properties of the transaction. The route
 *  owns the session check; this owns the write.
 *
 *  Returns null when the turn is not this account's or does not exist, which
 *  are one answer for the same reason the tool endpoint has one refusal.
 */
export async function undoTurn(
  accountId: string,
  turnId: string,
  /** 026. Undo from a forwarded email's Activity row: the email is the dump
   *  and stays, and a row somebody changed after `since` is left as it is.
   *  `since` is Postgres's own text for the time: a Date holds milliseconds,
   *  so a row filed in the same millisecond as the bound would read as later. */
  opts: { keepMessageId?: string; since?: string } = {},
): Promise<{ undone: boolean; stayed?: string[] } | null> {
  // **Calendar rows are undone before the transaction, not inside it.**
  //
  // Every other row in a turn is undone by a local soft delete, which is why
  // this is one transaction. A calendar event is not: it already left, so
  // taking it back is a call to Google, and holding a transaction open across
  // a round trip to somebody else's API is how a slow third party becomes a
  // stalled database.
  //
  // Google first, and the local row only if that succeeded, so offload and the
  // calendar never disagree. A row whose event Google refuses to delete keeps
  // its `source_ref` and its row, and stays in both places, which is the honest
  // outcome: the update below deliberately excludes rows still carrying a
  // `source_ref`, so nothing here can leave a row deleted while the event is
  // still on somebody's calendar.
  await undoCalendarWrites(accountId, turnId, opts.since);

  return db.transaction().execute(async (trx) => {
    const owned = await trx
      .selectFrom("messages")
      .select(["id"])
      .where("turn_id", "=", turnId)
      .where("account_id", "=", accountId)
      .execute();

    if (owned.length === 0) return null;

    const live = await trx
      .selectFrom("messages")
      .select(["id"])
      .where("turn_id", "=", turnId)
      .where("account_id", "=", accountId)
      .where("deleted_at", "is", null)
      .execute();

    // Idempotent. The second press matches nothing and changes nothing.
    if (live.length === 0) return { undone: false };

    // One timestamp for the whole turn. Two now() calls in one transaction do
    // return the same value in Postgres, but relying on that is relying on a
    // detail rather than stating the requirement, which is that a turn purges
    // as a unit.
    const stamp = sql<Date>`now()`;
    const purge = sql<Date>`now() + interval '8 seconds'`;
    const since = sql<Date>`${opts.since}::timestamptz`;

    // **Calendar rows are excluded, and this is not a refinement.** 012 lets a
    // tool write an event into somebody's Google Calendar, and this update
    // filters on nothing but the message the row came from: not `type`, not
    // `source`. Left as it was, the ordinary Undo toast would soft-delete our
    // row and leave the event sitting in Google forever, which is exactly the
    // disagreement between offload and a calendar that 012 AC-17 forbids.
    //
    // Undoing a calendar write has to reach Google first and only then touch
    // the local row, because the effect already left. That is a different path
    // with a different failure mode, so it is not this one's to run.
    await trx
      .updateTable("content")
      .set({ deleted_at: stamp, purge_after: purge, updated_at: stamp })
      .where(
        "derived_from_message_id",
        "in",
        live.map((row) => row.id),
      )
      .where("account_id", "=", accountId)
      .where("deleted_at", "is", null)
      .where("source_ref", "is", null)
      .$if(opts.since !== undefined, (qb) => qb.where("updated_at", "<=", since))
      .execute();

    // 025. What the turn labelled, the person's # and the model's alike.
    await undoTurnLabels(trx, turnId);

    // Notes the turn wrote, on the same clock and by the same predicate.
    //
    // Without this, undoing a dump takes back what was filed and leaves the
    // standing rule offload derived from it, which then goes on steering every
    // later turn on that thread. Same argument as reversing offload's reply: a
    // turn that half survives its own undo is the pretence this feature exists
    // to retire, recreated by the mechanism meant to protect against it.
    await trx
      .updateTable("notes")
      .set({ deleted_at: stamp, purge_after: purge, updated_at: stamp })
      .where(
        "derived_from_message_id",
        "in",
        live.map((row) => row.id),
      )
      .where("account_id", "=", accountId)
      .where("deleted_at", "is", null)
      .$if(opts.since !== undefined, (qb) => qb.where("updated_at", "<=", since))
      .execute();

    // 038. A memory the turn asked for went with the notes above (it is one,
    // at account scope). One the turn forgot comes back, and its words may
    // teach again, as many as fit; the toast names the rest.
    const stayed = await restoreForgotten(
      trx,
      accountId,
      live.map((row) => row.id),
    );
    // And an answer to "which calendar is shared with" takes its memory back.
    await undoAnswered(
      trx,
      accountId,
      live.map((row) => row.id),
    );

    // 018. The asking turn's questions close with what they were about; an
    // answer's turn puts the previous value back and the question stays
    // answered. A turn is only ever one of the two.
    await closeQuestionsOfTurn(trx, accountId, turnId);
    await restoreAnswers(trx, accountId, turnId);

    // 030. A row whose place this turn changed gets the place back: the
    // location, the point and the page-read mark as they were, from the record
    // the edit kept. No lookup is booked; the old place is still there,
    // because the daily sweep keeps a place an Undo record points at.
    await trx
      .updateTable("content")
      .set({
        place_id: sql`(place_prior->>'placeId')::uuid`,
        location: sql`place_prior->>'location'`,
        place_read_at: sql`(place_prior->>'placeReadAt')::timestamptz`,
        place_prior: null,
        place_prior_at: null,
        updated_at: sql`now()`,
      })
      .where(sql<string>`place_prior->>'messageId'`, "in", owned.length > 0 ? owned.map((m) => m.id) : [""])
      .where("account_id", "=", accountId)
      .where("deleted_at", "is", null)
      .execute();

    await trx
      .updateTable("messages")
      .set({ deleted_at: stamp, purge_after: purge })
      .where("turn_id", "=", turnId)
      .where("account_id", "=", accountId)
      .where("deleted_at", "is", null)
      .$if(opts.keepMessageId !== undefined, (qb) => qb.where("id", "!=", opts.keepMessageId!))
      .execute();

    // 020. The photos go with the dump they arrived on, on the same clock.
    // The rows that carried them were soft-deleted above, so nothing in a
    // thread still links them; the purge destroys the objects after the
    // window, and until then the eight seconds can put everything back.
    // 026. A forwarded email's own pictures stay with it when its filing is undone.
    const dropped = live.map((row) => row.id).filter((id) => id !== opts.keepMessageId);
    if (dropped.length > 0) {
      await trx
        .updateTable("blobs")
        .set({ deleted_at: stamp, purge_after: purge })
        .where("message_id", "in", dropped)
        .where("deleted_at", "is", null)
        .execute();
    }

    // The conversation stays. A conversation with every message undone is an
    // empty conversation, not a deleted one.
    //
    // The hard delete is enqueued by the delete rather than left to a timer,
    // which is the difference between a purge that is late and a purge that
    // never happens because a scheduler stopped and nobody noticed. Ten seconds
    // out, two past the window, and the handler is idempotent so overlapping
    // enqueues cost nothing.
    await enqueue({
      kind: "content.purge",
      accountId,
      payload: {},
      priority: PRIORITY.background,
      runAfterSeconds: 10,
      tx: trx,
    });

    return stayed.length > 0 ? { undone: true, stayed } : { undone: true };
  });
}

/** Take back whatever this turn put on a calendar.
 *
 *  Best effort, and deliberately so: a failure here leaves both the event and
 *  its row exactly where they are, and the rest of the turn still undoes. The
 *  alternative is refusing to undo a dump because Google is down. */
async function undoCalendarWrites(accountId: string, turnId: string, since?: string): Promise<void> {
  // What the turn changed or removed first: an event it added and then moved
  // is moved back before the add is taken off.
  await undoToolWrites(accountId, turnId, since);

  // A row that found its event did not write it: the event was theirs before
  // this turn and stays. The row only forgets it, which lets the row go.
  await db
    .updateTable("content")
    .set({ source_ref: null, attrs: sql`attrs - 'calendar' - 'calendar_found'` })
    .where("account_id", "=", accountId)
    .where("derived_from_message_id", "in", (eb) => eb.selectFrom("messages").select("id").where("turn_id", "=", turnId))
    .where(sql<boolean>`attrs ? 'calendar_found'`)
    .where("deleted_at", "is", null)
    .$if(since !== undefined, (qb) => qb.where("updated_at", "<=", sql<Date>`${since}::timestamptz`))
    .execute();

  // Rows this turn filed and then put on a calendar, and rows a tapped answer
  // in this turn put on one: both remember their event in `source_ref`.
  const filed = await db
    .selectFrom("content")
    .innerJoin("messages", "messages.id", "content.derived_from_message_id")
    .select(["content.source_ref as sourceRef"])
    .where("messages.turn_id", "=", turnId)
    .where("content.account_id", "=", accountId)
    .where("content.deleted_at", "is", null)
    .where("content.source_ref", "is not", null)
    .$if(since !== undefined, (qb) => qb.where("content.updated_at", "<=", sql<Date>`${since}::timestamptz`))
    .execute();
  const answered = await db
    .selectFrom("questions")
    .innerJoin("content", "content.id", "questions.target_content_id")
    .select(["content.source_ref as sourceRef"])
    .where("questions.answer_turn_id", "=", turnId)
    .where("questions.account_id", "=", accountId)
    .where("questions.field", "=", "calendar")
    .where("content.source_ref", "is not", null)
    .execute();

  for (const row of [...filed, ...answered]) {
    if (!row.sourceRef) continue;
    // `source_ref` is `<calendar external id>:<event id>`, so the calendar it
    // belongs to is the prefix.
    const externalId = row.sourceRef.split(":")[0];
    if (!externalId) continue;

    const calendar = await db
      .selectFrom("connector_calendars as c")
      .innerJoin("connector_connections as n", "n.id", "c.connection_id")
      .select("c.id as id")
      .where("c.external_id", "=", externalId)
      .where("n.account_id", "=", accountId)
      .where("n.deleted_at", "is", null)
      .executeTakeFirst();
    if (!calendar) continue;

    const target = await targetFor(calendar.id, accountId);
    if (!target) continue;

    await undoWrite(target, row.sourceRef).catch(() => undefined);
  }
}

export const DUMP_LIMITS = { MAX_DUMP_CHARS, CONVERSATION_GAP } as const;

/** 018. Answer a question by option. Null when the question is not this
 *  account's, not open, or the option does not exist, which the client draws
 *  as the chips leaving without a failure line: there is nothing to retry. */
export async function answerQuestion(
  accountId: string,
  questionId: string,
  option: number,
  /** The device's time zone from the request header, already checked. */
  timeZone: string | null = null,
): Promise<{
  envelope: {
    messageId: string;
    conversationId: string;
    state: MessageState;
    turnId: string;
    question: QuestionOnWire | null;
    threads: TouchedThread[];
    filed: boolean;
  };
  field: string;
  applied: boolean;
  escape: boolean;
} | { calendar: { questionId: string; option: number; lookingAt: string | null } } | null> {
  return db.transaction().execute(async (trx) => {
    // Locked for the length of this transaction, which is ours, so two taps
    // from two devices queue here: the second reads the first's answered state
    // and leaves without writing a turn. Without the lock both passed the
    // check, both wrote the person's words, and only one applied.
    const question = await trx
      .selectFrom("questions")
      .select(["id", "conversation_id", "message_id", "field", "state"])
      .where("id", "=", questionId)
      .where("account_id", "=", accountId)
      .forUpdate()
      .executeTakeFirst();
    if (!question || question.state !== "open") return null;

    // Where the dump that led to the question was made from. A country re-run
    // reads it off the answering message, and the thread is the very fact the
    // question turned on, so the answer carries it as the dump did.
    const asked = await trx
      .selectFrom("messages")
      .select("looking_at_thread_id")
      .where("id", "=", question.message_id)
      .executeTakeFirst();

    const picked = await optionLabel(trx, accountId, question.id, option);
    if (!picked) return null;

    const turnId = randomUUID();
    const escape = picked.value === null;
    const country = question.field === "country" && !escape;
    // Only the country answer starts a model turn, so only it meets the cap.
    // Thrown inside the transaction, so the question stays open for tomorrow.
    if (country) await requireBudget(accountId, trx);
    // 019. A calendar answer reaches Google, which cannot happen inside this
    // transaction: it settles here and writes on its own path afterwards.
    if (question.field === "calendar" && !escape) {
      return { calendar: { questionId: question.id, option, lookingAt: asked?.looking_at_thread_id ?? null } };
    }

    // The person's own turn, in words, exactly as typing them would be.
    const message = await trx
      .insertInto("messages")
      .values({
        conversation_id: question.conversation_id,
        account_id: accountId,
        role: "person",
        type: "text",
        turn_id: turnId,
        text: picked.label,
        state: country ? "seen" : "answered",
        looking_at_thread_id: asked?.looking_at_thread_id ?? null,
        time_zone: timeZone,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await adoptZone(accountId, timeZone, trx);

    let applied = false;
    if (escape) {
      await closeQuestion(trx, question.id, accountId, message.id);
    } else {
      const value = optionAsValue(picked.field, picked.value!);
      const outcome = value
        ? await applyAnswer(trx, question.id, accountId, value, {
            answeredMessageId: message.id,
            answerTurnId: turnId,
            option,
          })
        : ({ applied: false, reason: "bad_value" } as const);
      applied = outcome.applied;
      // The row is gone or the field was set by hand since. The words are
      // written, the question is closed, nothing else changes.
      if (!applied) await closeQuestion(trx, question.id, accountId, message.id);
    }

    await trx
      .updateTable("conversations")
      .set({ last_message_at: sql`now()` })
      .where("id", "=", question.conversation_id)
      .execute();

    if (country && applied) {
      await enqueue({
        kind: "dump.answer",
        accountId,
        payload: {
          messageId: message.id,
          conversationId: question.conversation_id,
          turnId,
          questionId: question.id,
          country: picked.value,
        },
        priority: PRIORITY.interactive,
        maxAttempts: 2,
        tx: trx,
      });
    } else if (country) {
      await trx.updateTable("messages").set({ state: "answered" }).where("id", "=", message.id).execute();
    }

    return {
      envelope: {
        messageId: message.id,
        conversationId: question.conversation_id,
        state: country && applied ? ("seen" as const) : ("answered" as const),
        turnId,
        question: await openQuestionOn(trx, accountId, message.id),
        // The default thread draws no pill (028), so a loose row's answer
        // names nothing and `filed` draws its Done, as the calendar path does.
        threads: await trx
          .selectFrom("message_threads")
          .innerJoin("threads", "threads.id", "message_threads.thread_id")
          .select(["threads.id as id", "threads.name as name", "threads.icon as icon", "threads.hue as hue"])
          .where("message_threads.message_id", "=", message.id)
          .where("message_threads.landed", "=", true)
          .where((eb) =>
            eb.not(
              eb.exists(
                eb
                  .selectFrom("accounts")
                  .select("accounts.id")
                  .where("accounts.id", "=", accountId)
                  .whereRef("accounts.default_thread_id", "=", "threads.id"),
              ),
            ),
          )
          .execute(),
        filed: applied,
      },
      field: question.field,
      applied,
      escape,
    };
  });
}

/** 019. Answer a calendar question: settle first, write outside, remember
 *  after.
 *
 *  Settling first is what makes a second tap a 404 rather than a second event.
 *  The write reaches Google and so runs outside any transaction; a failure
 *  reopens the question, takes back the pick the tap made, and the client
 *  draws the failure line with the chips still there. The row remembers the
 *  event it became inside the write path itself. */
export async function answerCalendarQuestion(
  accountId: string,
  input: {
    questionId: string;
    option: number;
    lookingAt: string | null;
    /** 019. A typed answer: the dump is already the person's message, so no
     *  turn is written and the write is recorded against it. */
    typed?: { messageId: string; turnId: string };
    /** The device's time zone from the request header, already checked. */
    timeZone?: string | null;
  },
): Promise<{
  envelope: {
    messageId: string;
    conversationId: string;
    state: MessageState;
    turnId: string;
    question: QuestionOnWire | null;
    threads: TouchedThread[];
    waiting: Waiting | null;
  };
  applied: boolean;
  failed: boolean;
} | null> {
  const turnId = input.typed?.turnId ?? randomUUID();

  const settled = await db.transaction().execute(async (trx) => {
    const question = await trx
      .selectFrom("questions")
      .select(["id", "conversation_id", "message_id", "target_content_id", "previous_value", "state"])
      .where("id", "=", input.questionId)
      .where("account_id", "=", accountId)
      .forUpdate()
      .executeTakeFirst();
    if (!question || question.state !== "open") return null;

    const picked = await optionLabel(trx, accountId, question.id, input.option);
    if (!picked || picked.value === null) return null;
    const calendarId = picked.value;
    const picksOnAnswer = (question.previous_value as { picks?: boolean } | null)?.picks === true;
    // 2026-10-13. The other rows filed in the same turn that this tap is also
    // about: written after the first, each through the same test.
    const also = (question.previous_value as { also?: unknown } | null)?.also;
    const alsoIds = Array.isArray(also) ? also.filter((id): id is string => typeof id === "string") : [];
    // They named a calendar and the name did not settle on one: the tap is
    // about this event, so it needs no pick in the thread and makes none.
    const named = (question.previous_value as { named?: boolean } | null)?.named === true;
    // 038. They named the calendar by who it is shared with: the answer is
    // remembered, so the same name settles without asking next time.
    const person = (question.previous_value as { person?: unknown } | null)?.person;

    // Still theirs, approved, writable, and picked in the row's thread unless
    // the tap is the pick. A calendar un-approved since the question was asked
    // closes it with nothing written.
    const row = question.target_content_id
      ? await trx
          .selectFrom("content")
          .select(["id", "thread_id", "title", "occurs_at", "occurs_end_at", "source_ref", "attrs"])
          .where("id", "=", question.target_content_id)
          .where("deleted_at", "is", null)
          .forUpdate()
          .executeTakeFirst()
      : undefined;
    // Still in the thread. Somebody who left between the ask and the tap
    // would otherwise pick their calendar into a thread they are no longer
    // in, and nobody left could take it out.
    const stillMember = row ? await memberOf(accountId, row.thread_id, trx) : false;
    const siblings =
      row && alsoIds.length > 0
        ? await trx
            .selectFrom("content")
            .select(["id", "thread_id", "title", "occurs_at", "occurs_end_at", "source_ref", "attrs"])
            .where("id", "in", alsoIds)
            .where("thread_id", "=", row.thread_id)
            .where("account_id", "=", accountId)
            .where("deleted_at", "is", null)
            .where("source_ref", "is", null)
            .where("occurs_at", "is not", null)
            .execute()
        : [];
    const calendar = await trx
      .selectFrom("connector_calendars as c")
      .innerJoin("connector_connections as n", "n.id", "c.connection_id")
      .select(["c.id as id", "c.access_role as accessRole"])
      .where("c.id", "=", calendarId)
      .where("c.selected", "=", true)
      .where("n.account_id", "=", accountId)
      .where("n.deleted_at", "is", null)
        .executeTakeFirst();
    const stillPicked =
      row && calendar && !picksOnAnswer && !named
        ? await trx
            .selectFrom("thread_calendars")
            .select("calendar_id")
            .where("thread_id", "=", row.thread_id)
            .where("calendar_id", "=", calendarId)
            .where("account_id", "=", accountId)
            .executeTakeFirst()
        : { calendar_id: calendarId };
    const owned = await trx
      .selectFrom("connector_calendars as c")
      .innerJoin("connector_connections as n", "n.id", "c.connection_id")
      .select("c.access_role")
      .where("c.id", "=", calendarId)
      .where("n.account_id", "=", accountId)
      .executeTakeFirst();

    // The person's own turn, in words. A calendar somebody else owns has a
    // name somebody else wrote, so the message is marked and the tail the
    // prompts read never carries it as the person's words. A typed answer is
    // already a message of theirs, and their own words.
    const message = input.typed
      ? { id: input.typed.messageId }
      : await trx
          .insertInto("messages")
          .values({
            conversation_id: question.conversation_id,
            account_id: accountId,
            role: "person",
            type: "text",
            turn_id: turnId,
            text: picked.label,
            state: "answered",
            time_zone: input.timeZone ?? null,
            looking_at_thread_id: input.lookingAt,
            derived_from_untrusted: owned?.access_role !== "owner",
          })
          .returning("id")
          .executeTakeFirstOrThrow();
    await adoptZone(accountId, input.timeZone ?? null, trx);

    const writable = calendar && (calendar.accessRole === "owner" || calendar.accessRole === "writer");
    if (!row || !stillMember || !calendar || !writable || !stillPicked || row.source_ref || !row.occurs_at) {
      await closeQuestion(trx, question.id, accountId, message.id);
      return { question, message, turnId, row: null as null, siblings: [], calendarId, picksOnAnswer };
    }

    await trx
      .updateTable("questions")
      .set({
        state: "answered",
        settled_at: sql`now()`,
        answered_option: input.option,
        answered_message_id: message.id,
        answer_turn_id: turnId,
        previous_value: JSON.stringify({ picks: picksOnAnswer, named, calendar: calendarId, ...(alsoIds.length > 0 ? { also: alsoIds } : {}) }),
      })
      .where("id", "=", question.id)
      .execute();
    if (typeof person === "string" && person.trim()) {
      await answerMemory(trx, { accountId, name: person, calendarId, answeredIn: message.id });
    }
    if (picksOnAnswer) {
      await trx
        .insertInto("thread_calendars")
        .values({ thread_id: row.thread_id, calendar_id: calendarId, account_id: accountId })
        .onConflict((oc) => oc.columns(["thread_id", "calendar_id"]).doNothing())
        .execute();
    }
    await trx
      .updateTable("conversations")
      .set({ last_message_at: sql`now()` })
      .where("id", "=", question.conversation_id)
      .execute();

    return { question, message, turnId, row, siblings, calendarId, picksOnAnswer };
  });
  if (!settled) return null;

  // `wrote` is what draws Done on the tap: the event is on the calendar now.
  // The thread is named only when it has a pill, which the default one never
  // does (028), so a row filed from Today says Done and names nothing, as
  // the tail will after a reload.
  const envelopeFor = async (waiting: Waiting | null, wrote = false) =>
    db.transaction().execute(async (trx) => ({
      messageId: settled.message.id,
      conversationId: settled.question.conversation_id,
      state: "answered" as const,
      turnId: settled.turnId,
      question: await openQuestionOn(trx, accountId, settled.message.id),
      threads: await trx
        .selectFrom("message_threads")
        .innerJoin("threads", "threads.id", "message_threads.thread_id")
        .select(["threads.id as id", "threads.name as name", "threads.icon as icon", "threads.hue as hue"])
        .where("message_threads.message_id", "=", settled.message.id)
        .where("message_threads.landed", "=", true)
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("accounts")
                .select("accounts.id")
                .where("accounts.id", "=", accountId)
                .whereRef("accounts.default_thread_id", "=", "threads.id"),
            ),
          ),
        )
        .execute(),
      filed: wrote,
      waiting,
    }));

  if (!settled.row) return { envelope: await envelopeFor(null), applied: false, failed: false };
  const row = settled.row;

  const write: WriteAction = {
    action: "create",
    draft: {
      title: row.title,
      ...calendarSpan(row.occurs_at as Date, row.occurs_end_at, row.attrs),
      location: null,
      attendees: [],
    },
  };

  const reopen = async () => {
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("questions")
        .set({ state: "open", settled_at: null, answered_option: null, answered_message_id: null, answer_turn_id: null })
        .where("id", "=", settled.question.id)
        .execute();
      if (settled.picksOnAnswer) {
        await trx
          .deleteFrom("thread_calendars")
          .where("thread_id", "=", row.thread_id)
          .where("calendar_id", "=", settled.calendarId)
          .where("account_id", "=", accountId)
          .execute();
      }
      // The person's words came with the tap; a write that did not go
      // through takes them back too, so the chips stay on the asking turn.
      // Soft, as every message goes: the row was theirs. A typed answer is
      // the dump itself and stays.
      if (!input.typed) {
        await trx
          .updateTable("messages")
          .set({ deleted_at: sql`now()` })
          .where("id", "=", settled.message.id)
          .execute();
      }
    });
  };

  let outcome: Awaited<ReturnType<typeof writeThroughTool>>;
  try {
    outcome = await writeThroughTool(accountId, settled.calendarId, write, settled.message.id, row.id);
  } catch (error) {
    // The type only (OFF-1): enough to tell a sealed-token fault from Google
    // being down, and never the event's title.
    console.warn(
      JSON.stringify({
        at: "calendar.answer",
        outcome: "failed",
        error_type: error instanceof Error ? error.name : typeof error,
      })
    );
    await reopen();
    return { envelope: await envelopeFor(null), applied: false, failed: true };
  }
  if (outcome.kind === "refused") {
    console.warn(JSON.stringify({ at: "calendar.answer", outcome: "refused", reason: outcome.reason }));
    await reopen();
    return { envelope: await envelopeFor(null), applied: false, failed: true };
  }

  // 2026-10-13. The rest of the rows the question was about, each through the
  // same test as the first. One that is refused or fails is left as a row
  // with no event, as a model's own call would have left it; the first write
  // stands and the tap is not reopened for it.
  for (const sibling of settled.siblings) {
    const draft: WriteAction = {
      action: "create",
      draft: {
        title: sibling.title,
        ...calendarSpan(sibling.occurs_at as Date, sibling.occurs_end_at, sibling.attrs),
        location: null,
        attendees: [],
      },
    };
    try {
      const went = await writeThroughTool(accountId, settled.calendarId, draft, settled.message.id, sibling.id);
      if (went.kind === "refused") console.warn(JSON.stringify({ at: "calendar.answer", outcome: "refused", reason: went.reason, sibling: true }));
    } catch (error) {
      console.warn(JSON.stringify({ at: "calendar.answer", outcome: "failed", error_type: error instanceof Error ? error.name : typeof error, sibling: true }));
    }
  }

  if (outcome.kind === "written") {
    await db.transaction().execute(async (trx) => {
      await landedIn(trx, settled.message.id, row.thread_id);
    });
    return { envelope: await envelopeFor(null, true), applied: true, failed: false };
  }

  return {
    // 2026-10-13. Read back rather than built from the one outcome: the other
    // rows the tap was about are proposals on the same message, and the
    // control stands for all of them.
    envelope: await envelopeFor(
      (await anyWaitingFor([settled.message.id])).get(settled.message.id) ?? { id: outcome.pendingId, because: outcome.line, kind: "calendar" }
    ),
    applied: true,
    failed: false,
  };
}

/** An option's stored value in the field's wire form. */
function optionAsValue(field: string, value: string): Record<string, string> | null {
  // 022. One parser for every field, in `questions.ts`. This used to carry
  // its own switch over five of them, and a tapped thread chip fell through
  // to null, closed the question and moved nothing; the photos test never
  // saw it because it called `applyAnswer` with the value already parsed.
  return (FIELDS as readonly string[]).includes(field) ? optionValue(field as Field, value) : null;
}
