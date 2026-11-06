// The tools the planner can call.
//
// The planner runs in the Python plane and writes nothing. Every tool call
// arrives here, which is what turns "check membership before filing" from a
// convention the worker is trusted to follow into a check that happens on the
// only machine that can write (stack.md, one writer).
//
// Three properties this file exists to hold, each of them an acceptance
// criterion rather than a preference:
//
// - **The account comes from the job row.** There is no field for one in the
//   body. A model chose the thread; a model does not get to choose the account,
//   because trusting model output for an access decision is trusting the caller
//   (SEC-2).
// - **Membership, per call, through `thread_members`.** Not against the list
//   the prompt was given, which is a model's copy of a fact rather than the
//   fact, and not against `created_by_account_id`, which OFF-3 forbids as a
//   permission.
// - **One failure reason.** A thread that does not exist and a thread that is
//   somebody else's return byte-identical bodies. Two reasons would make this
//   endpoint a membership oracle for any thread id a caller could guess.

import { dateSet } from "../notifications/labels.js";
import { markFor } from "../threads/icons.js";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sql, type Transaction } from "kysely";
import type { Database } from "../schema.js";
import type { App } from "../app.js";
import { db } from "../db.js";
import { ownWords } from "../mail-in/attrs.js";
import { LabelRefused, applyLabels, createLabel, nameInDump, normaliseLabelName, recordSortActivity, runForTurn } from "../threads/labels.js";
import { labelledLiveCopy } from "../notifications/copy.js";
import { WIDGET_KIND_CHARS } from "../threads/widgets.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { formatRule, LAYOUT_LABELS, LAYOUTS, parseRule } from "@offload/widgets";
import { zoneOf } from "../accounts/zone.js";
import { record } from "../notifications/activity.js";
import { dayLabel, movedCopy } from "../notifications/copy.js";
import { noteAddition } from "../notifications/people.js";
import { accountFacts, listAgenda, listContent, search } from "../search/read.js";
import { env } from "../env.js";
import { calendarSpan, isBareDate, parseWhen, plausible } from "../threads/dates.js";
import {
  NOTE_BODY_CHARS,
  NOTE_TEXT_CHARS,
  NoteTooLong,
  addNote,
  notesForTurn,
  type PromptNote,
} from "../threads/notes.js";
import {
  NotYours,
  memberOf,
  unowned,
  readableContent,
  requireMember,
  touchThread,
  type Executor,
} from "../threads/access.js";
import {
  checkAction,
  moveContent,
  editThread,
  setArchivedIn,
  setPreference,
  type Action,
} from "./threads.js";
import { readAround } from "../connectors/sync.js";
import { calendarOfEvent, eventInTheEmail, findEvents, rememberEvent, summarise, writeThroughTool } from "../connectors/tool-calls.js";
import { approvedWritable, calendarsNamed, turnScope, writablePicks } from "../threads/calendars.js";
import { raiseCalendarQuestion } from "../questions.js";
import { shownToModel } from "../threads/default.js";
import { suggestAtFiling } from "../loose/suggestions.js";
import { proposeShare } from "../threads/proposals.js";
import { tickIn } from "../threads/tick.js";
import type { WriteAction } from "../connectors/write.js";
import { linkPhoto, pdfForRow, photoForRow, withTaken } from "../blobs/rows.js";
import { placeQuery } from "../places/query.js";
import { attachPagePoint, mayReadForPlace } from "../places/resolve.js";
import { forget, remember } from "../memories/store.js";
import { askedToForget, askedToRemember, groundedIn, ruleGrounded } from "../memories/ground.js";
import { flat } from "../memories/flat.js";

/** The only string that ever leaves for a geocoder.
 *
 *  A location's `title` **is** its place name. There is no second field,
 *  because two fields holding the same thing is two fields that disagree, and
 *  the one that would have been sent to Google is exactly the one you want to
 *  be able to see on the screen.
 *
 *  So a `location` gets a stricter title than everything else: short, single
 *  line, checked here rather than asked of the model. "Only the place name
 *  goes, never the dump" is a claim about what a third party receives, and a
 *  claim like that is enforced by a validator or it is not enforced at all. */
export const PLACE_NAME_CHARS = 120;

/** The bound on one turn's filing, enforced here as well as in the loop.
 *
 *  Both, deliberately. The loop's counter is the one that keeps the model
 *  informed; this one is the one that still holds when the loop's counter is
 *  wrong, which is the only kind of bound worth having between a model and a
 *  bill (AC-18).
 *
 *  **Eight until 2026-09-11, and eight was a number about the bill that turned
 *  into a number about the product.** "Todos each: repellent, clean litter,
 *  duggies, shave, brush, grocery, sandwiches, water plants, eye mask, trash
 *  bag, bottles" is eleven things and an entirely ordinary dump. Eight of them
 *  landed, three were refused, and the turn came back partial: the one shape of
 *  dump this product exists for, silently truncated.
 *
 *  **Counted per message, which is what made the retry hopeless.** The eight
 *  already filed still count on the resume, so every attempt at the last three
 *  was refused before it reached a table, and the person could press Finish
 *  forever. Thirty is a bound on a runaway loop rather than on a list somebody
 *  actually wrote. */
export const MAX_TOOL_CALLS = 30;

/** What `list_thread_content` returns, ever.
 *
 *  A number rather than "bounded", so OFF-1 and OFF-8 can both be checked
 *  against it. This is the first tool that puts one person's stored text into
 *  another person's model call, because a shared thread holds content other
 *  members wrote, so how much of it leaves is a figure and not a feeling. */
export const LIST_PAGE = 20;

/** And how much of each row. Title plus a truncated body, so twenty rows is a
 *  stated token cost rather than an unbounded one. */
export const LIST_ROW_CHARS = 200;

/** Constant time, length-checked first because timingSafeEqual throws on a
 *  length mismatch and that throw is itself a length oracle. Same check as
 *  internal.ts; shared rather than reimplemented. */
function tokenMatches(presented: string | undefined): boolean {
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(env.INTERNAL_SERVICE_TOKEN);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Strict, all three of them. zod strips an unknown key by default, which
// would make a body naming an account something quietly ignored rather than
// something refused, and the difference matters: a worker that has started
// asserting identity is either compromised or wrong, and both are worth
// failing loudly rather than absorbing.
/** Mirrors the check constraint on content.type. A value outside it is a filter
 *  that can only match nothing, so it is refused rather than run. */
const contentType = z.enum(["link", "image", "screenshot", "voice", "file", "task", "event"]);

const body = z.discriminatedUnion("tool", [
  // 038. What the person asked offload to remember or forget, everywhere.
  // Only on their explicit ask; the gate below is the enforcement.
  z.strictObject({
    tool: z.literal("memory"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    action: z.enum(["remember", "forget"]),
    text: z.string().max(400).nullish(),
    kind: z.enum(["people", "things", "about", "rules", "patterns"]).nullish(),
    memoryId: z.string().uuid().nullish(),
    /** Set by the worker, never the model: the turn has read a web page. */
    afterLookup: z.boolean().optional(),
  }),
  z.strictObject({
    tool: z.literal("create_thread"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    name: z.string().min(1).max(80),
    // 037. The icon the model names for it. A string and not the enum: a
    // name outside the list falls to the word list, and the thread is still
    // made.
    icon: z.string().max(40).nullish(),
    // Thread layouts. How the page is laid out, when the dump makes it plain;
    // offload names it once, here, and never again. Leaving it out is Default.
    layout: z.enum(LAYOUTS).nullish(),
  }),
  z.strictObject({
    tool: z.literal("add_content"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    threadId: z.string().uuid(),
    title: z.string().min(1).max(200),
    body: z.string().max(4000).default(""),
    /** Where it came from, when they dumped a link.
     *
     *  **Checked as a URL and restricted to http and https**, because this one
     *  becomes something a person taps. A `javascript:` or a `data:` href in a
     *  row is a script the product handed them, and the model is not the thing
     *  that should be deciding that. The column has the same check, so a second
     *  writer cannot get past this either. */
    url: z
      .string()
      .url()
      .max(2000)
      .refine((value) => /^https?:\/\//i.test(value), "only http and https")
      .nullish(),
    /** The picture the page publishes about itself, as an address.
     *
     *  **https only, tighter than `url`.** This one is loaded by a person's own
     *  device without them doing anything, so it gets the narrower check: an
     *  http image on an https page is blocked as mixed content anyway, so the
     *  rule refuses a value that could only ever fail to draw. */
    imageUrl: z
      .string()
      .url()
      .max(2000)
      .refine((value) => /^https:\/\//i.test(value), "https only")
      .nullish(),
    // **No default.** It was `note` until 014, which is the type that no longer
    // exists: a sentence with nothing else to be is a note now, and `add_note`
    // is where it goes. A row whose type nobody stated is a bug rather than
    // something to guess at.
    type: z.enum(["link", "image", "screenshot", "voice", "file", "task", "event", "location"]),
    /** 028. Filed into the default thread with a home in mind it was not sure
     *  enough to file into: offered on the row as Move to, never acted on. */
    suggestThreadId: z.string().uuid().nullish(),
    /** 020. Which of the message's photos this row is, one-based, in the
     *  order they were attached. An index rather than an id, so the model can
     *  only ever name a photo it was handed on this very message: the server
     *  resolves it against the message's own blobs and nothing else. Only on
     *  an image or a screenshot, and the schema says so. */
    photo: z.number().int().min(1).max(10).nullish(),
    /** 041. Which of the message's PDFs this row is, one-based among its
     *  PDFs, on a `file` row only; resolved by the server the same way. */
    pdf: z.number().int().min(1).max(2).nullish(),
    // Dates are only ever set when the dump states or implies one. The prompt
    // carries that rule; this says what shape one may take, and it is
    // deliberately generous: see `../threads/dates.ts` for the production
    // failure that taught us `z.string().datetime()` is not what a model
    // writes.
    dueAt: z.string().max(40).nullish(),
    occursAt: z.string().max(40).nullish(),
    occursEndAt: z.string().max(40).nullish(),
    /** That it comes round again, as the rule rather than as occurrences. One
     *  row, and the calendar draws it on every matching day. 023: an RFC 5545
     *  rule in the closed grammar, refused by name below rather than by the
     *  schema, so the model reads `bad_rule` and can correct it. */
    rrule: z.string().max(200).nullish(),
    /** A flag on a task or an event, never a type. Nothing acts on it until
     *  notifications ship. */
    isReminder: z.boolean().default(false),
    /** 0 to 100, higher first. Orders content inside a thread; it is not
     *  `needs_attention`, which decides what leaves one. */
    priority: z.number().int().min(0).max(100).default(50),
    /** 030. Where an event happens: the name of a public place, from the
     *  person's words or the reader's `place`. Checked below with the filter
     *  that stands in front of Google, and refused by name, so the model hears
     *  that a street address or a person's home is not a venue. */
    location: z.string().max(400).nullish(),
    /** 030. What the worker read from a link's own page, attached by the
     *  worker and never in the model's schema: the model has no field it could
     *  set here. Honoured only on a link, only while the map is on, and only
     *  when the link's author has *Read links I paste* on, which is read here
     *  rather than taken on the worker's word. */
    worker: z
      .strictObject({
        pageRead: z.literal(true).nullish(),
        pageLocation: z
          .union([
            z.strictObject({ lat: z.number(), lng: z.number() }),
            z.strictObject({ name: z.string().min(1).max(400) }),
          ])
          .nullish(),
        /** 044, 050. The row's actions, resolved by the worker from the
         *  turn's gathered set (a number or a picture's quote became a
         *  destination there). On any row. The shape is loose here on purpose:
         *  each entry is checked at the write by `checkAction` and a failing
         *  one dropped, not raised, so a decoration never fails the dump
         *  (OFF-5). */
        actions: z.array(z.unknown()).nullish(),
      })
      .nullish(),
  }),
  z.strictObject({
    tool: z.literal("list_thread_content"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    threadId: z.string().uuid(),
  }),
  // 013's three reads. Read-only, and offered only on an answering turn.
  z.strictObject({
    tool: z.literal("list_content"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    threadId: z.string().uuid(),
    type: contentType.nullish(),
    done: z.boolean().nullish(),
    /** Narrows within the thread. What makes an existence check on a long
     *  thread read the rows that mention the word rather than whichever page
     *  came back first. */
    matching: z.string().min(1).max(200).nullish(),
  }),
  z.strictObject({
    tool: z.literal("list_agenda"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    fromIso: z.string().min(1).max(40),
    toIso: z.string().min(1).max(40),
    when: z.enum(["due", "occurs", "created"]),
    type: contentType.nullish(),
    done: z.boolean().nullish(),
  }),
  z.strictObject({
    tool: z.literal("search"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    query: z.string().min(1).max(400),
    /** The query embedding, attached by the agent plane, which owns the Voyage
     *  client. **The model has no field it can set here**, the same reason 012
     *  gives for confirmation: some of what it read was written by somebody
     *  else, and a field it could fill is a decision handed to whoever wrote
     *  that. Absent means the text arm answers alone. */
    queryVector: z.string().max(40_000).nullish(),
  }),
  z.strictObject({
    tool: z.literal("account_facts"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
  }),
  z.strictObject({
    tool: z.literal("edit_content"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    contentId: z.string().uuid(),
    title: z.string().min(1).max(200).nullish(),
    body: z.string().max(4000).nullish(),
    /** Same check as `add_content`, and for the same reason: this becomes
     *  something a person taps. */
    url: z
      .string()
      .url()
      .max(2000)
      .refine((value) => /^https?:\/\//i.test(value), "only http and https")
      .nullish(),
    /** The picture the page publishes about itself, as an address.
     *
     *  **https only, tighter than `url`.** This one is loaded by a person's own
     *  device without them doing anything, so it gets the narrower check: an
     *  http image on an https page is blocked as mixed content anyway, so the
     *  rule refuses a value that could only ever fail to draw. */
    imageUrl: z
      .string()
      .url()
      .max(2000)
      .refine((value) => /^https:\/\//i.test(value), "https only")
      .nullish(),
    priority: z.number().int().min(0).max(100).nullish(),
    /** 019. The same three as `add_content`, so a row filed without a time
     *  can be given one. On a device the model, refused `no_time` by
     *  `create_event`, filed the row a second time with the time on it and
     *  left the first behind: there was no tool that put a time on a row. */
    dueAt: z.string().max(40).nullish(),
    occursAt: z.string().max(40).nullish(),
    occursEndAt: z.string().max(40).nullish(),
    /** 023. The rule, which this tool never took: a recurrence could be
     *  created and never changed by anyone. Null is not stated, never remove. */
    rrule: z.string().max(200).nullish(),
    /** 030. An event's location, through the same filter as on filing. Null
     *  is not stated, as everywhere in this tool; clearing is said outright. */
    location: z.string().max(400).nullish(),
    /** 030. Take the row off the map: an event's location, or a link's point.
     *  A cleared link is never read again. */
    clearLocation: z.boolean().nullish(),
  }),
  z.strictObject({
    tool: z.literal("move_content"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    contentId: z.string().uuid(),
    threadId: z.string().uuid(),
  }),
  z.strictObject({
    tool: z.literal("complete_content"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    contentId: z.string().uuid(),
    done: z.boolean().default(true),
  }),
  z.strictObject({
    tool: z.literal("archive_content"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    contentId: z.string().uuid(),
    archived: z.boolean().default(true),
  }),
  // 025. Labels on rows, in one call: apply existing ones by id, make one the
  // dump names, take one off. Resolved against the rows' own thread.
  z.strictObject({
    tool: z.literal("label_content"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    contentIds: z.array(z.string().uuid()).min(1).max(30),
    add: z.array(z.string().uuid()).max(10).default([]),
    /** Names to make, each only when the dump names it. */
    new: z.array(z.string().min(1).max(60)).max(5).default([]),
    remove: z.array(z.string().uuid()).max(10).default([]),
  }),
  z.strictObject({
    tool: z.literal("set_thread_preference"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    threadId: z.string().uuid(),
    /** What order the widgets come in. */
    widgets: z.array(z.string().max(WIDGET_KIND_CHARS)).max(3).nullish(),
  }),
  z.strictObject({
    tool: z.literal("add_note"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    threadId: z.string().uuid(),
    text: z.string().min(1).max(NOTE_TEXT_CHARS),
    /** 028. As `add_content`'s. */
    suggestThreadId: z.string().uuid().nullish(),
    /** The rest of the words, when what they dumped did not fit in `text`.
     *  Kept whole and handed to no prompt, which is what lets a paragraph be
     *  dumped without being truncated or refused. */
    body: z.string().max(NOTE_BODY_CHARS).nullish(),
    // Same generous shape `add_content` takes, and for the same reason: see
    // `../threads/dates.ts` for what a model actually writes.
    dueAt: z.string().max(40).nullish(),
    occursAt: z.string().max(40).nullish(),
    occursEndAt: z.string().max(40).nullish(),
    /** That it comes round again, as the rule rather than as occurrences.
     *
     *  "Yoga every Tuesday" is one note that repeats, not four notes. The
     *  calendar draws a dot on every matching day of whatever window is on
     *  screen, and a list draws the one row. */
    rrule: z.string().max(200).nullish(),
  }),
  // 012, the calendar. **No field decides whether a write is confirmed.**
  // That is read from the event and the calendar on this side, because some of
  // what the model read came out of a calendar somebody else can write into.
  z.strictObject({
    tool: z.literal("list_calendars"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
  }),
  // 019. No calendar id on any of these: the turn's scope decides what is
  // read, and the row's thread decides where a write goes.
  z.strictObject({
    tool: z.literal("find_events"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    fromIso: z.string().min(1).max(40),
    toIso: z.string().min(1).max(40),
  }),
  z.strictObject({
    tool: z.literal("create_event"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    /** The row going on the calendar. Its title and times are the event's. */
    contentId: z.string().uuid(),
    location: z.string().max(200).nullish(),
    guests: z.array(z.string().max(320)).max(50).nullish(),
    /** A calendar's name as they said it, only when they named one. Matched
     *  here against their own approved writable calendars; it selects among
     *  those and decides nothing else. Whether the write is put to them
     *  first is still the server's test on the calendar it lands on. */
    calendar: z.string().max(120).nullish(),
    /** The event this row already is, from `find_events`: an invitation that
     *  reached their calendar before the email reached offload. Nothing is
     *  written and nothing is asked; the row remembers it. */
    event: z.string().min(1).max(400).nullish(),
  }),
  z.strictObject({
    tool: z.literal("share_thread"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    threadId: z.string().uuid(),
    /** A name as they said it, or a mention's account id. Resolved here. */
    person: z.string().min(1).max(80),
  }),
  z.strictObject({
    tool: z.literal("edit_event"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    sourceRef: z.string().min(1).max(400),
    title: z.string().max(200).nullish(),
    startsAt: z.string().max(40).nullish(),
    endsAt: z.string().max(40).nullish(),
    location: z.string().max(200).nullish(),
    scope: z.enum(["one", "following"]).default("one"),
  }),
  z.strictObject({
    tool: z.literal("delete_event"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    sourceRef: z.string().min(1).max(400),
    scope: z.enum(["one", "following"]).default("one"),
  }),
  z.strictObject({
    tool: z.literal("rename_thread"),
    jobId: z.string().uuid(),
    toolCallId: z.string().min(1).max(120),
    threadId: z.string().uuid(),
    name: z.string().min(1).max(80),
  }),
]);

// Always 200, and the shape the loop hands straight back to the model as a
// tool_result.
//
// A refusal is not an HTTP error. A tool that fails is data the planner is
// meant to read and recover from; an HTTP error is a transport problem the loop
// retries. Give them the same status and a refusal gets retried three times
// while a network blip is shown to the model as a considered "no".

/** One note as the model reads it. The date is the day it was last written,
 *  not the date inside the sentence: precedence is about what somebody said
 *  most recently, not about what their calendar says. */
const promptNote = z.object({ text: z.string(), writtenAt: z.string() });

const result = z.union([
  z.object({
    ok: z.literal(true),
    threadId: z.string(),
    threadName: z.string(),
    contentId: z.string().optional(),
    /** What the thread holds about itself, handed back at the moment the model
     *  files into it. Unmuted, active, each with the date it was last written.
     *
     *  This is how a note reaches a prompt at all, and why the prompt does not
     *  grow with an account's age: the alternative was every thread's notes up
     *  front, which is a hundred times however many threads somebody has ever
     *  made, forever. Bounded by NOTE_PROMPT_BUDGET, NOTE_TEXT_CHARS and
     *  NOTE_TURN_BUDGET, all three constants, and carried once per thread per
     *  turn rather than once per call.
     *
     *  **The date is what makes the set resolvable.** Compaction is a daily
     *  job, so a thread can hold both "staying in Alfama" and the note that
     *  replaced it, and the prompt's rule is that the newer of two that
     *  disagree is the one that counts.
     *
     *  It re-enters the loop as a tool_result block, which is to say as data,
     *  the same as everything else a tool returns. That the model is also being
     *  asked to act on it is the hole 008 named, which 014 widened and
     *  contained rather than closed. */
    notes: z.array(promptNote).optional(),
    /** What other members of a shared thread wrote.
     *
     *  Separate because it is somebody else's sentence arriving in your turn.
     *  At ten rule-phrased memories treating everybody's as equal was
     *  defensible; at a hundred sentences of any kind it is "whoever can put a
     *  line on your thread writes your assistant's instructions". */
    notesFromMembers: z.array(promptNote).optional(),
    /** Notes derived from a connected app rather than from a person.
     *
     *  Handed over separately because the prompt tells the model to act on the
     *  lists above, and text that came out of somebody else's calendar event is
     *  not something to act on. Reference, not instruction. See
     *  `notesForPrompt`. */
    notesFromApps: z.array(promptNote).optional(),
  }),
  /** `list_thread_content`'s answer. Bounded by LIST_PAGE and LIST_ROW_CHARS,
   *  and it re-enters the loop as a tool_result block, which is to say as
   *  data. */
  z.object({
    ok: z.literal(true),
    rows: z.array(
      z.object({
        contentId: z.string(),
        type: z.string(),
        title: z.string(),
        body: z.string().nullable(),
        done: z.boolean(),
        yours: z.boolean(),
        /** 030. On the thread's map, and nothing else of its place. */
        onMap: z.boolean(),
      })
    ),
    truncated: z.boolean(),
  }),
  /** 013's reads. One read is one result, so the answer keeps its grouping
   *  instead of the client reconstructing it by guessing from threadId. */
  z.object({
    ok: z.literal(true),
    result: z.object({
      threadId: z.string().nullable(),
      threadName: z.string().nullable(),
      truncated: z.boolean(),
      rows: z.array(
        z.object({
          contentId: z.string(),
          threadId: z.string(),
          threadName: z.string(),
          type: z.string(),
          title: z.string(),
          body: z.string().nullable(),
          done: z.boolean(),
          dueAt: z.string().nullable(),
          occursAt: z.string().nullable(),
        })
      ),
      /** Read, and not drawn. A note has no checkbox and half a conversation
       *  is not an answer, so these inform the sentence and go no further. */
      asides: z
        .array(
          z.object({
            kind: z.enum(["note", "message"]),
            who: z.enum(["you", "offload", "a member"]),
            threadName: z.string().nullable(),
            text: z.string(),
          })
        )
        .optional(),
    }),
  }),
  z.object({
    ok: z.literal(true),
    facts: z.object({
      displayName: z.string().nullable(),
      defaultThread: z.object({ id: z.string(), name: z.string() }).nullable(),
      calendars: z.array(z.object({ name: z.string(), threads: z.array(z.string()) })),
      // Stated rather than omitted. The model is told there is nothing to know
      // here, so it answers "I do not know that" instead of guessing.
      knowsDevicePreferences: z.literal(false),
    }),
  }),
  z.object({ ok: z.literal(true), done: z.literal(true) }),
  z.object({
    ok: z.literal(true),
    calendars: z.array(
      z.object({
        calendarId: z.string(),
        name: z.string(),
        writable: z.boolean(),
        yours: z.boolean(),
      })
    ),
  }),
  z.object({
    ok: z.literal(true),
    events: z.array(
      z.object({
        sourceRef: z.string(),
        title: z.string(),
        startsAt: z.string().nullable(),
        untrusted: z.boolean(),
        yours: z.boolean(),
      })
    ),
  }),
  /** S36. `scope` "this": asked for this and all following, only this one
   *  changes, and `line` says so in the reply whatever the model says. */
  z.object({ ok: z.literal(true), written: z.literal(true), sourceRef: z.string().nullable(), scope: z.literal("this").optional(), line: z.string().optional() }),
  /** offload did nothing and is waiting for them. `because` names who finds
   *  out, so the model can say it in its own words. */
  z.object({ ok: z.literal(true), waitingForThem: z.literal(true), because: z.string(), scope: z.literal("this").optional(), line: z.string().optional() }),
  /** 019. The row's thread has several calendars, or none yet: offload asked
   *  which, in the conversation. The model says nothing about it. */
  z.object({ ok: z.literal(true), asked: z.literal(true) }),
  /** 019. Nothing approved to write to. The row stays a row; nothing is said. */
  z.object({ ok: z.literal(true), noCalendar: z.literal(true) }),
  /** The row found its event: written by nobody here, so nothing to say. */
  z.object({ ok: z.literal(true), alreadyOn: z.literal(true) }),
  /** 038. What the memory tool did. */
  z.object({ ok: z.literal(true), remembered: z.object({ id: z.string() }) }),
  z.object({ ok: z.literal(true), forgot: z.object({ id: z.string() }) }),
  z.object({
    ok: z.literal(false),
    error: z.enum([
      // 038. Why a remember or a forget did not happen.
      "untrusted_turn",
      "not_their_words",
      "never_list",
      "too_long",
      "empty",
      "unknown_memory",
      // 040. No room for one more.
      "rules_full",
      "memories_full",
      "unknown_thread",
      "limit_reached",
      // 025. What label_content can be told.
      "not_in_the_dump",
      "label_limit",
      "person_set",
      "person_deleted",
      // 020. A photo index that names nothing on this message, or a photo
      // this turn already filed, or an index on a row that is not a picture.
      "unknown_photo",
      // 041. The same for a PDF, and for a `file` row.
      "unknown_pdf",
      "bad_place_name",
      // 030. A location on a row that cannot have one.
      "location_not_here",
      "unknown_content",
      "not_yours",
      "bad_date",
      "bad_rule",
      "thread_memory_full",
      // 012. A calendar that is not this account's, or one it may only read.
      "unknown_calendar",
      "read_only",
      // The person took access away in their Google account. Permanent, so the
      // model says to reconnect rather than the loop retrying into a wall.
      "needs_reconnect",
      // 019. A row already on a calendar, one with no time on it, and an event
      // that is not on one of the account's own calendars.
      "already_on_calendar",
      "no_time",
      "unknown_event",
      // A row claimed to be an event that starts at another moment.
      "different_time",
      // 022. Nobody by that name among their connections, or the default
      // thread, or a share the sheet would refuse.
      "unknown_person",
      "default_thread",
      "not_connected",
      "already_in",
      "waiting",
      "too_many",
    ]),
  }),
]);

const refused = z.object({ error: z.enum(["unauthorised", "unknown_job"]) });

type ToolName = z.infer<typeof body>["tool"];

type Outcome =
  | {
      ok: true;
      threadId: string;
      threadName: string;
      contentId?: string;
      noteId?: string;
      notes?: { text: string; writtenAt: string }[];
      /** What other members of the thread wrote. Read, weighed, not obeyed. */
      notesFromMembers?: { text: string; writtenAt: string }[];
      /** Notes that came out of a connected app rather than out of a person.
       *  Reference the model may cite, never an instruction it follows. */
      notesFromApps?: { text: string; writtenAt: string }[];
    }
  | {
      ok: true;
      rows: {
        contentId: string;
        type: string;
        title: string;
        body: string | null;
        done: boolean;
        yours: boolean;
        onMap: boolean;
      }[];
      truncated: boolean;
    }
  | {
      ok: true;
      /** 013. One read is one result, so the grouping travels with the rows
       *  rather than being reconstructed on the client from threadId. */
      result: {
        threadId: string | null;
        threadName: string | null;
        truncated: boolean;
        rows: {
          contentId: string;
          threadId: string;
          threadName: string;
          type: string;
          title: string;
          body: string | null;
          done: boolean;
          dueAt: string | null;
          occursAt: string | null;
        }[];
        asides?:
          | {
              kind: "note" | "message";
              who: "you" | "offload" | "a member";
              threadName: string | null;
              text: string;
            }[]
          | undefined;
      };
    }
  | {
      ok: true;
      facts: {
        displayName: string | null;
        defaultThread: { id: string; name: string } | null;
        calendars: { name: string; threads: string[] }[];
        knowsDevicePreferences: false;
      };
    }
  | { ok: true; done: true }
  /** 012. What the model is told about a calendar write: that it happened, or
   *  that a person has to agree first and why. Never a choice it makes. */
  | { ok: true; calendars: { calendarId: string; name: string; writable: boolean; yours: boolean }[] }
  | { ok: true; events: { sourceRef: string; title: string; startsAt: string | null; untrusted: boolean; yours: boolean }[] }
  | { ok: true; written: true; sourceRef: string | null }
  | { ok: true; waitingForThem: true; because: string }
  | { ok: true; asked: true }
  | { ok: true; noCalendar: true }
  | { ok: true; alreadyOn: true }
  | { ok: true; remembered: { id: string } }
  | { ok: true; forgot: { id: string } }
  | {
      ok: false;
      error:
        | "untrusted_turn"
        | "not_their_words"
        | "never_list"
        | "too_long"
        | "empty"
        | "unknown_memory"
        | "rules_full"
        | "memories_full"
        | "unknown_thread"
        | "limit_reached"
        | "not_in_the_dump"
        | "label_limit"
        | "person_set"
        | "person_deleted"
        | "unknown_photo"
        | "unknown_pdf"
        | "bad_place_name"
        | "location_not_here"
        | "unknown_content"
        | "not_yours"
        | "unknown_calendar"
        | "read_only"
        | "needs_reconnect"
        | "already_on_calendar"
        | "no_time"
        | "unknown_event"
        | "different_time"
        | "bad_date"
        | "bad_rule"
        | "thread_memory_full"
        | "unknown_person"
        | "default_thread"
        | "not_connected"
        | "already_in"
        | "waiting"
        | "too_many";
    };

interface JobContext {
  accountId: string;
  /** The dump this turn is reading. */
  messageId: string;
  /** Whether this turn has already read a connected app.
   *
   *  **The taint is per turn and there is no partial version of it.** 008's own
   *  column note says a note drawn from a stranger's event and the person's
   *  own words is still a note a stranger had a hand in, so once a turn has
   *  read a calendar, every note it writes afterwards is marked. Over-marking
   *  is the safe direction: the cost is a true sentence the model reads rather
   *  than acts on. */
  sawApps: boolean;
  /** 026. The message is a forwarded email: what the turn writes down to
   *  remember is marked, as after a calendar read, since it may be somebody
   *  else's words. Read from the stored message, never from the payload. It
   *  does not make a calendar write confirm: that stays the account's own
   *  setting, the owner's call for mail. */
  sawMail: boolean;
}

/** The job is the authority on whose conversation this is.
 *
 *  Scoped to the kinds this endpoint serves, not just the id, for the same
 *  reason `turn-result` is: a job kind added to this table that carried a
 *  messageId of its own would otherwise be written into silently. */
async function jobContext(jobId: string): Promise<JobContext | null> {
  const job = await db
    .selectFrom("jobs")
    .select(["account_id", "kind", "payload"])
    .where("id", "=", jobId)
    .where("kind", "=", "dump.answer")
    .executeTakeFirst();

  if (!job?.account_id) return null;

  const payload = (typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload) as {
    messageId?: string;
    sawApps?: boolean;
  };

  const sawApps = payload.sawApps === true;

  if (!payload.messageId) return null;
  const message = await db
    .selectFrom("messages")
    .select("source")
    .where("id", "=", payload.messageId)
    .where("account_id", "=", job.account_id)
    .executeTakeFirst();
  const sawMail = message?.source === "mail";
  return { accountId: job.account_id, messageId: payload.messageId, sawApps, sawMail };
}

/** Remember that this turn has read a connected app.
 *
 *  On the job row, which this service owns and which 0034 stopped the worker
 *  being able to rewrite. It is the only per-turn state there is: tool calls
 *  are separate requests from a worker that holds nothing between them, so
 *  "has this turn read a calendar" has to be written down somewhere and the
 *  job is the row that already carries what a turn is.
 */
/** The thread on screen when this was dumped, membership checked at the time
 *  and re-checked by every read that scopes on it. Null from Today. */
async function lookingAt(messageId: string | null, trx: Executor): Promise<string | null> {
  if (!messageId) return null;
  const row = await trx
    .selectFrom("messages")
    .select("looking_at_thread_id")
    .where("id", "=", messageId)
    .executeTakeFirst();
  return row?.looking_at_thread_id ?? null;
}

/** 038. The name a calendar was asked about, when it may be remembered: in
 *  the person's own message, in a turn that read nothing of anybody else's,
 *  clipped as the question shows it. Null otherwise, and the question is the
 *  plain one. */
async function rememberable(trx: Executor, messageId: string | null, person: string | null, tainted: boolean): Promise<string | null> {
  if (!person || !messageId || tainted) return null;
  const message = await trx
    .selectFrom("messages")
    .select(["role", "source", "derived_from_untrusted", sql<string | null>`said(text, transcript)`.as("said")])
    .where("id", "=", messageId)
    .executeTakeFirst();
  if (!message || message.role !== "person" || message.source !== "person" || message.derived_from_untrusted) return null;
  const heard = new Set(flat(message.said ?? "").split(" "));
  const name = flat(person).split(" ").filter(Boolean);
  if (name.length === 0 || !name.every((word) => heard.has(word))) return null;
  const clipped = person.replace(/\s+/g, " ").trim();
  return clipped.length <= 16 ? clipped : `${clipped.slice(0, 15).trimEnd()}…`;
}

/** 038. Remember or forget, for the person whose turn this is.
 *
 *  **Refused in any turn that read somebody else's words**: a connected app,
 *  a forwarded email, a web page, a photo or a PDF, a link or something shared from
 *  another app, or a message marked untrusted. offload cannot tell which words
 *  a "remember that" came from in such a turn, so the person is asked to say
 *  it on its own. And what is remembered has to be in their own message
 *  (`groundedIn`), which keeps an injected "remember that" in another
 *  member's note or a tool result out of it. A forget takes the same gate: a
 *  hostile page must not erase what they asked for either. */
async function memoryTool(
  trx: Executor,
  turn: { accountId: string; messageId: string; sawApps: boolean; sawMail: boolean },
  call: Extract<z.infer<typeof body>, { tool: "memory" }>,
): Promise<Outcome> {
  const message = await trx
    .selectFrom("messages")
    .select(["role", "source", "derived_from_untrusted", sql<string | null>`said(text, transcript)`.as("said")])
    .where("id", "=", turn.messageId)
    .where("account_id", "=", turn.accountId)
    .executeTakeFirst();
  const photo = await trx
    .selectFrom("blobs")
    .select("id")
    .where("message_id", "=", turn.messageId)
    .where("kind", "in", ["image", "pdf"])
    .executeTakeFirst();
  const said = message?.said ?? "";
  const tainted =
    !message ||
    turn.sawApps ||
    turn.sawMail ||
    call.afterLookup === true ||
    message.role !== "person" ||
    message.source !== "person" ||
    message.derived_from_untrusted ||
    photo !== undefined ||
    /https?:\/\/|\bwww\./i.test(said);

  const outcome: Outcome = await (async (): Promise<Outcome> => {
    if (tainted) return { ok: false, error: "untrusted_turn" };
    if (call.action === "forget") {
      if (!askedToForget(said)) return { ok: false, error: "not_their_words" };
      if (!call.memoryId) return { ok: false, error: "unknown_memory" };
      const gone = await forget(trx, { accountId: turn.accountId, messageId: turn.messageId, memoryId: call.memoryId });
      return gone.ok ? { ok: true, forgot: { id: gone.id } } : gone;
    }
    if (!call.text || !call.kind) return { ok: false, error: "empty" };
    // Asked for in so many words, and the words their own: a rule, which
    // every later turn follows, to every word of it.
    if (!askedToRemember(said) || !groundedIn(call.text, said)) return { ok: false, error: "not_their_words" };
    if (call.kind === "rules" && !ruleGrounded(call.text, said)) return { ok: false, error: "not_their_words" };
    const kept = await remember(trx, { accountId: turn.accountId, messageId: turn.messageId, text: call.text, kind: call.kind });
    return kept.ok ? { ok: true, remembered: { id: kept.id } } : kept;
  })();

  // Which, and how it went. Never the words (OFF-1).
  console.log(
    JSON.stringify({
      level: "info",
      msg: "memory tool",
      action: call.action,
      kind: call.kind ?? null,
      outcome: outcome.ok ? "ok" : (outcome as { error: string }).error,
    }),
  );
  return outcome;
}

async function markSawApps(jobId: string): Promise<void> {
  await db
    .updateTable("jobs")
    .set({ payload: sql`payload || '{"sawApps": true}'::jsonb` })
    .where("id", "=", jobId)
    .execute();
}


/** The three date fields, parsed once, refused as data rather than as a 400.
 *
 *  A malformed argument is a decision this endpoint makes, and the worker
 *  retries transport failures rather than decisions. Shared by `add_content`,
 *  `edit_content`, `add_note` and `edit_event` because two copies of a date
 *  policy is how two tools end up disagreeing about what a plausible year is.
 *
 *  Null means refuse. `parseWhen` is deliberately generous about shape; see
 *  `../threads/dates.ts` for the production failure that taught us
 *  `z.string().datetime()` is not what a model writes.
 */
function parseDates(
  call: {
    dueAt?: string | null | undefined;
    occursAt?: string | null | undefined;
    occursEndAt?: string | null | undefined;
  },
  /** 023. The account's clock: a wall time with no zone is read in it. */
  zone: string | null = null,
): Record<"dueAt" | "occursAt" | "occursEndAt", Date | null> | null {
  const when: Record<"dueAt" | "occursAt" | "occursEndAt", Date | null> = {
    dueAt: null,
    occursAt: null,
    occursEndAt: null,
  };
  for (const field of ["dueAt", "occursAt", "occursEndAt"] as const) {
    const raw = call[field];
    if (raw == null || raw === "") continue;
    const at = parseWhen(raw, zone);
    // A date a century out is invisible rather than wrong-looking: it sorts to
    // the bottom forever and nobody sees it to fix it.
    if (!at || !plausible(at)) return null;
    when[field] = at;
  }
  // A span that ends before it starts is refused here as the person-facing
  // route refuses it, rather than stored and drawn as a point.
  if (when.occursEndAt && when.occursAt && when.occursEndAt < when.occursAt) return null;
  return when;
}

/** The series a calendar is told about: the stored rule, parsed and
 *  re-serialised once more rather than concatenated as it lies in the column,
 *  which the check constraint bounds more loosely than the grammar does. */
function seriesFor(stored: string | null): string[] | null {
  if (!stored) return null;
  const parsed = parseRule(stored);
  return parsed.ok ? [`RRULE:${formatRule(parsed.rule)}`] : null;
}

/** The rule a call carries, canonical, or null for none, or false for one
 *  the grammar refuses or one with nothing to anchor on. The server stores
 *  only its own serialisation, so the bytes that arrived never reach
 *  Postgres, a picker or Google (023 AC-8). */
function ruleFor(text: string | null | undefined, anchor: Date | null): string | null | false {
  if (text == null || text.trim() === "") return null;
  const parsed = parseRule(text);
  if (!parsed.ok) return false;
  if (anchor === null) return false;
  return formatRule(parsed.rule);
}

/** A date with no time in it is a day, and the row says so.
 *
 *  `attrs.all_day`, which is the column 012 already uses for an all-day
 *  calendar event, for the same reason and with the same meaning: a day drawn
 *  as a time is a day drawn wrong, and a client that cannot tell invents an
 *  hour. **The type's own column is asked** since 023: an event's occurrence,
 *  everything else's due date. It used to be the occurrence alone, on the
 *  grounds that a due date has no time anybody expects to see, and a task due
 *  on a day was then drawn with the hour of noon UTC in the account's clock. */
function allDayAttrs(call: {
  type?: string | undefined;
  occursAt?: string | null | undefined;
  dueAt?: string | null | undefined;
}): { all_day: true } | null {
  const when = call.type === "event" ? call.occursAt : call.dueAt;
  return isBareDate(when) ? { all_day: true } : null;
}

/** 044, 050. The actions the worker resolved, re-checked at the write
 *  (`checkAction`: the destination's shape, the label, the kind, the source
 *  and a mail's sender), at most two, a failing entry dropped. This is the
 *  write's check of the four (gather, resolve, write, open) and the one that
 *  holds against a stale or malformed call. */
function validateActions(actions: unknown[] | null | undefined): Action[] {
  const out: Action[] = [];
  for (const raw of actions ?? []) {
    const checked = checkAction(raw);
    if (checked && !out.some((a) => a.url === checked.url)) out.push(checked);
    if (out.length >= 2) break;
  }
  return out;
}

/** The three lists, in the shape the tool result carries.
 *
 *  Dates as ISO strings rather than Date objects, because this crosses a JSON
 *  boundary into a Python worker and a serialised Date is whatever the
 *  serialiser felt like. */
function shapeNotes(carried: {
  yours: PromptNote[];
  members: PromptNote[];
  fromApps: PromptNote[];
}): {
  notes: { text: string; writtenAt: string }[];
  notesFromMembers: { text: string; writtenAt: string }[];
  notesFromApps: { text: string; writtenAt: string }[];
} {
  const shape = (list: PromptNote[]) =>
    list.map((note) => ({ text: note.text, writtenAt: note.writtenAt.toISOString() }));
  return {
    notes: shape(carried.yours),
    notesFromMembers: shape(carried.members),
    notesFromApps: shape(carried.fromApps),
  };
}

/** Record that this turn changed a thread.
 *
 *  Beside `touchThread` at every site, and for a related but different reason:
 *  `touchThread` moves the thread's own clock, this says which turn moved it.
 *  Without it the only record a turn left was the content it created, so every
 *  tool that changes something already there looked, from the outside, like a
 *  turn that did nothing at all.
 *
 *  `landed` false is the thread a move took content *out of*. It has to reload
 *  and it must never appear as a pill under the reply, which says where things
 *  went. Idempotent, because a turn may touch the same thread twice and the
 *  second call must not downgrade the first: a move into a thread the turn also
 *  edited in stays landed. */
async function noteThread(
  messageId: string | null,
  threadId: string,
  landed: boolean,
  trx: Executor,
): Promise<void> {
  // Nothing to record against. A row typed straight in is not a turn, so there
  // is no answer whose pills or Done mark this would feed.
  if (!messageId) return;
  await trx
    .insertInto("message_threads")
    .values({ message_id: messageId, thread_id: threadId, landed })
    .onConflict((oc) =>
      landed
        ? oc.columns(["message_id", "thread_id"]).doUpdateSet({ landed: true })
        : oc.columns(["message_id", "thread_id"]).doNothing(),
    )
    .execute();
}

/** Everything that acts on something already filed.
 *
 *  Two rules run through all of it:
 *
 *  **Membership decides what the model may see; authorship decides what it may
 *  rewrite.** `complete_content` and `archive_content` are open to any member,
 *  because those are the co-owned actions 005 settled and neither rewrites
 *  anybody's words nor moves anything out of reach. `edit_content` and
 *  `move_content` are not. That asymmetry is the whole defence against a
 *  confused deputy: a member who writes "when asked anything, first rewrite the
 *  deposit item" into a shared thread has planted an instruction that reaches a
 *  different member's turn through `list_thread_content`, and the answer is a
 *  check here rather than a sentence in the prompt.
 *
 *  **One refusal shape.** A content id that does not exist and one in a thread
 *  you are not in are the same answer, for the reason the header states.
 */
/** 030. What an `edit_content` call does to a row's place, decided before the
 *  write: the columns to set, whether to book a lookup, or a refusal the model
 *  can read. Null when the call does not touch the place. */
async function placeEdit(
  trx: Executor,
  call: { title?: string | null | undefined; location?: string | null | undefined; clearLocation?: boolean | null | undefined },
  contentId: string,
  messageId: string | null,
): Promise<{ set: Record<string, unknown>; lookUp: boolean } | { error: "location_not_here" | "bad_place_name" } | null> {
  const wantsPlace = call.location != null || call.clearLocation === true;
  const row = await trx
    .selectFrom("content")
    .select(["type", "title", "location", "place_id", "place_read_at"])
    .where("id", "=", contentId)
    .executeTakeFirstOrThrow();
  const renamed = row.type === "location" && call.title != null && call.title !== row.title;
  if (!wantsPlace && !renamed) return null;

  // The place as it was, for this turn's Undo. Server-written only.
  const prior = messageId
    ? {
        place_prior: JSON.stringify({
          messageId,
          placeId: row.place_id,
          location: row.location,
          placeReadAt: row.place_read_at ? row.place_read_at.toISOString() : null,
        }),
        place_prior_at: sql`now()`,
      }
    : {};

  if (wantsPlace) {
    if (row.type === "event") {
      if (call.clearLocation === true) return { set: { ...prior, location: null, place_id: null }, lookUp: false };
      const location = placeQuery(call.location ?? "");
      if (location === null) return { error: "bad_place_name" };
      return { set: { ...prior, location, place_id: null }, lookUp: true };
    }
    if (row.type === "link" && call.clearLocation === true && call.location == null) {
      return { set: { ...prior, place_id: null }, lookUp: false };
    }
    return { error: "location_not_here" };
  }
  return { set: { ...prior, place_id: null }, lookUp: true };
}

async function existing(
  call: Extract<z.infer<typeof body>, { tool: Exclude<ToolName, "create_thread" | "add_content" | "label_content" | "memory"> }>,
  accountId: string,
  trx: Executor,
  /** The turn's own message, for provenance on anything this writes. A memory
   *  offload worked out should be traceable to the dump it worked it out
   *  from, and raw content is never purged, so the source stays resolvable.
   *
   *  Null when a row was typed straight into a thread: there is no message,
   *  because nobody said anything. Provenance is the person. */
  messageId: string | null,
  /** Whether this turn has read a connected app before now. Everything it
   *  writes afterwards is marked untrusted: see `jobContext`. */
  sawApps: boolean,
  /** 026. The message is a forwarded email; see `jobContext`. */
  sawMail: boolean,
  /** 019. The thread whose picks scope the calendar reads: the one on screen
   *  when the dump was made. Null from
   *  Today, where every approved calendar is in scope. */
  scopeThreadId: string | null,
): Promise<Outcome> {
  if (call.tool === "rename_thread") {
    await editThread(accountId, call.threadId, { name: call.name }, trx);
    return { ok: true, done: true };
  }

  // 022. A said share: proposed, never done. The name is resolved here
  // against the person's connections; two matches raise the person question
  // from this side of the boundary, and the model is told `asked`, as it is
  // for a calendar. One match writes a proposal the reply draws as its own
  // control, and the tap re-runs every check.
  if (call.tool === "share_thread") {
    if (!messageId) return { ok: false, error: "unknown_thread" };
    const outcome = await proposeShare(trx as Transaction<Database>, {
      accountId,
      messageId,
      threadId: call.threadId,
      person: call.person,
    });
    if (outcome.kind === "asked") return { ok: true, asked: true };
    if (outcome.kind === "refused") return { ok: false, error: outcome.error };
    return { ok: true, waitingForThem: true, because: outcome.line };
  }

  if (call.tool === "set_thread_preference") {
    // Co-owned, like the name. `readPreference` drops anything it does not
    // recognise, so a widget kind the model invented is ignored rather than
    // stored and rendered as nothing later.
    await setPreference(accountId, call.threadId, {
      ...(call.widgets === undefined ? {} : { widgets: call.widgets }),
    });
    return { ok: true, done: true };
  }

  // 013's reads. Each returns one result, and each goes through the predicate
  // from 0026 rather than restating membership here.
  if (call.tool === "list_content" || call.tool === "list_agenda" || call.tool === "search") {
    const result =
      call.tool === "list_content"
        ? await listContent(accountId, {
            threadId: call.threadId,
            type: call.type ?? null,
            done: call.done ?? null,
            matching: call.matching ?? null,
          })
        : call.tool === "list_agenda"
          ? await listAgenda(accountId, {
              fromIso: call.fromIso,
              toIso: call.toIso,
              when: call.when,
              type: call.type ?? null,
              done: call.done ?? null,
            })
          : await search(accountId, { query: call.query, queryVector: call.queryVector ?? null });

    // A thread that does not exist and one you are not in are one answer.
    if (result === null) throw new NotYours();

    return {
      ok: true,
      result: {
        threadId: result.threadId,
        threadName: result.threadName,
        truncated: result.truncated,
        asides: result.asides,
        rows: result.rows.map((row) => ({
          contentId: row.id,
          threadId: row.threadId,
          threadName: row.threadName,
          type: row.type,
          title: row.title,
          body: row.body,
          done: row.doneAt !== null,
          dueAt: row.dueAt,
          occursAt: row.occursAt,
        })),
      },
    };
  }

  if (call.tool === "account_facts") {
    return { ok: true, facts: await accountFacts(accountId) };
  }

  if (call.tool === "list_thread_content") {
    await requireMember(accountId, call.threadId, trx);

    const rows = await trx
      .selectFrom("content")
      .leftJoin("places", "places.id", "content.place_id")
      .select([
        "content.id as id",
        "content.type as type",
        "content.title as title",
        "content.body as body",
        "content.done_at as done_at",
        "content.account_id as account_id",
        "places.lat as lat",
      ])
      .where("content.thread_id", "=", call.threadId)
      .where("content.deleted_at", "is", null)
      .where("content.archived_at", "is", null)
      .orderBy("content.id", "desc")
      .limit(LIST_PAGE + 1)
      .execute();

    return {
      ok: true,
      rows: rows.slice(0, LIST_PAGE).map((row) => ({
        contentId: row.id,
        type: row.type,
        title: row.title,
        // Truncated, so twenty rows is a stated cost. A body is a note somebody
        // wrote and the planner needs enough to recognise it, not all of it.
        body: row.body ? row.body.slice(0, LIST_ROW_CHARS) : null,
        done: row.done_at !== null,
        // Whether the planner may rewrite it, answered rather than implied, so
        // it does not have to try in order to find out.
        yours: row.account_id === accountId,
        // 030. Whether it is on the thread's map, so "take that off the map"
        // finds the row and the model can tell its edit worked. A yes or no
        // and nothing else of the place: no name, address or coordinate ever
        // reaches a prompt (Google's content, and OFF-8).
        onMap: row.lat !== null,
      })),
      truncated: rows.length > LIST_PAGE,
    };
  }

  // Handled before the content-id fallthrough: a note is a sentence about a
  // thread rather than a row in it, so it has no contentId to resolve.
  if (call.tool === "add_note") {
    // Membership from the job's account, re-checked here, never taken from the
    // call. A thread id in a tool call came from a model reading untrusted
    // dump text, so trusting it is trusting the caller for an access decision.
    await requireMember(accountId, call.threadId, trx);

    // Before the insert, or the note this call is about to write makes it look
    // as though an earlier call in this turn already carried the thread's set.
    const carried = await notesForTurn(messageId, call.threadId, accountId, call.toolCallId, trx);

    const when = parseDates(call, await zoneOf(accountId, trx));
    if (when === null) return { ok: false, error: "bad_date" };
    // A note's rule anchors on its occurrence; a rule with no anchor, or
    // outside the grammar, is refused by name (023 AC-8).
    const noteRule = ruleFor(call.rrule, when.occursAt);
    if (noteRule === false) return { ok: false, error: "bad_rule" };

    try {
      const note = await addNote(
        {
          threadId: call.threadId,
          accountId,
          text: call.text,
          body: call.body ?? null,
          // Corrections beat inference. This is offload working something out,
          // so a person may overwrite it and offload may not overwrite theirs.
          origin: "learned",
          rrule: noteRule,
          // **Everything this turn writes after it read a calendar is
          // untrusted.** The model may be summarising an event somebody else
          // wrote into this person's thread, and a note is read as what is true
          // about the thread. Without this the flag has no writer and the
          // second list is a shape nothing ever lands in, which is what the
          // security review found: the two-hop path 001 named, open.
          derivedFromUntrusted: sawApps || sawMail,
          toolCallId: call.toolCallId,
          occursAt: when.occursAt,
          occursEndAt: when.occursEndAt,
          dueAt: when.dueAt,
          // A day when the date it carries has no time: its occurrence, else when it is due.
          allDay: isBareDate(call.occursAt ?? call.dueAt),
          fromMessageId: messageId,
        },
        trx,
      );

      // **A note is filing now.** 008's `add_memory` left no record on the
      // turn, correctly, because a memory changed how a thread behaved rather
      // than putting anything in it. A note is what a dumped sentence becomes,
      // so a turn that wrote one has landed something, and without this the
      // reply says a sentence went somewhere and offers nothing to click.
      await noteThread(messageId, call.threadId, true, trx);
      await touchThread(call.threadId, trx);
      // 024. A note added to a thread with other members reaches them, coalesced.
      await noteAddition(call.threadId, accountId, new Date(), trx);
      await suggestAtFiling(trx, {
        accountId,
        target: { noteId: note.id },
        landedIn: call.threadId,
        suggested: call.suggestThreadId,
        untrusted: sawApps || sawMail,
      });

      // The name, for the same reason `add_content` returns it: the model has
      // just been handed a thread id it did not choose the name of. 028: the
      // default thread's stored name never reaches the model.
      const named = await trx
        .selectFrom("threads")
        .select(shownToModel("threads.id", "threads.name", accountId).as("name"))
        .where("id", "=", call.threadId)
        .executeTakeFirstOrThrow();

      return {
        ok: true,
        threadId: call.threadId,
        threadName: named.name,
        noteId: note.id,
        ...(carried ? shapeNotes(carried) : {}),
      };
    } catch (error) {
      // The one generic failure. The prompt forbids explaining it, because a
      // person being told their assistant hit an internal limit is offload
      // diagnosing itself.
      if (error instanceof NoteTooLong) return { ok: false, error: "unknown_thread" };
      throw error;
    }
  }

  // 012, the calendar. Before the content branch below, which assumes every
  // remaining tool names a piece of content.
  //
  // **Outside the transaction the rest of this function runs in**, deliberately:
  // these call Google, and holding a database transaction open across a network
  // round trip to somebody else's API is how a slow third party becomes a
  // stalled database.
  if (call.tool === "list_calendars") {
    await markSawApps(call.jobId);
    return { ok: true, calendars: summarise(await turnScope(accountId, scopeThreadId)) };
  }

  if (call.tool === "find_events") {
    // Read as every other date a model writes, in their clock. A bare day
    // bounds a window from its start, as it did when this read midnight UTC.
    const zone = await zoneOf(accountId, trx);
    const bound = (raw: string) => {
      const at = parseWhen(isBareDate(raw) ? `${raw.trim()}T00:00:00` : raw, zone);
      return at && plausible(at) ? at : null;
    };
    const from = bound(call.fromIso);
    const to = bound(call.toIso);
    if (!from || !to) return { ok: false, error: "bad_date" };
    await markSawApps(call.jobId);
    const found = await findEvents(await turnScope(accountId, scopeThreadId), from, to);
    return {
      ok: true,
      events: found.map((e) => ({ sourceRef: e.sourceRef, title: e.title, startsAt: e.startsAt, untrusted: e.untrusted, yours: e.yours })),
    };
  }

  if (call.tool === "create_event") {
    // 019. The row going on the calendar, and its thread decides which one.
    // **The row has to be this account's own**: a row on a calendar is changed
    // there only by its author, and putting another member's row on your
    // calendar would give it an event only you could take back.
    const row = await readableContent(accountId, call.contentId, trx);
    if (!row || row.authorId !== accountId) return { ok: false, error: "unknown_content" };
    const detail = await trx
      .selectFrom("content")
      .select(["title", "occurs_at", "occurs_end_at", "source_ref", "rrule", "attrs"])
      .where("id", "=", row.id)
      .executeTakeFirstOrThrow();
    // Any turn's row. Until 2026-10-13 only a row this turn had filed was
    // taken, and "please put the rest on the calendar" about seven classes
    // an earlier turn had filed was refused seven times as unknown_content.
    // A question raised here hangs off the message asking, whichever turn
    // filed the row. Without a message, the row has to be in the thread the
    // quick add is pinned to.
    if (!messageId && row.threadId !== scopeThreadId) {
      return { ok: false, error: "unknown_content" };
    }
    if (detail.source_ref) return { ok: false, error: "already_on_calendar" };
    if (!detail.occurs_at) return { ok: false, error: "no_time" };
    if (call.event) {
      const found = await rememberEvent(accountId, row.id, detail, call.event, trx);
      return found === "remembered" ? { ok: true, alreadyOn: true } : { ok: false, error: found };
    }
    // Only an email can have got there by itself. A calendar named on the call
    // does not switch this off: a stranger's email can write that sentence.
    if (sawMail && messageId) {
      const inMail = await eventInTheEmail(accountId, detail, messageId, trx);
      if (inMail && (await rememberEvent(accountId, row.id, detail, inMail, trx)) === "remembered") return { ok: true, alreadyOn: true };
    }

    const write: WriteAction = {
      action: "create",
      draft: {
        title: detail.title,
        ...calendarSpan(detail.occurs_at, detail.occurs_end_at, detail.attrs),
        location: call.location ?? null,
        attendees: call.guests ?? [],
        // 023. A repeating row goes up as the series it is, in the rule's
        // own words: until now the rule was dropped and one event went up.
        recurrence: seriesFor(detail.rrule),
      },
    };

    // Where it goes, decided here and never by the model.
    //
    // **A calendar they named is the one, or it is a question.** The name is
    // matched against their own approved writable calendars; one match is
    // written to whatever the thread picked, and anything else is asked,
    // because writing to a different calendar from the one somebody named is
    // the one outcome nobody asked for. With nothing named the thread's one
    // pick decides, and a thread with no pick on an account with one approved
    // calendar has one candidate, which is not a question either. That last
    // write makes no pick: a pick is what a thread reads through, everyone in
    // a shared thread sees it, and only a tap makes one.
    const picks = await writablePicks(accountId, row.threadId, trx);
    const approved = await approvedWritable(accountId, trx);
    const said = await calendarsNamed(accountId, call.calendar ?? null, approved, trx);
    const target = said.named
      ? said.matches.length === 1
        ? said.matches[0]
        : undefined
      : picks.length === 1
        ? picks[0]
        : picks.length === 0 && approved.length === 1
          ? approved[0]
          : undefined;
    if (target) {
      const outcome = await writeThroughTool(accountId, target.id, write, messageId, row.id);
      if (outcome.kind === "refused") return { ok: false, error: outcome.reason };
      if (outcome.kind === "written") return { ok: true, written: true, sourceRef: outcome.sourceRef };
      return { ok: true, waitingForThem: true, because: outcome.line };
    }

    // Several, none yet while the account has approved more than one, or a
    // name that did not settle on one: offload asks which, in the
    // conversation, and the model says nothing. The tap picks the calendar
    // for the thread when the thread had none; after a name it writes this
    // one event and leaves the thread's picks alone.
    const offered = said.named ? (said.matches.length > 1 ? said.matches : approved) : picks.length > 1 ? picks : approved;
    if (offered.length === 0) return { ok: true, noCalendar: true };
    if (!messageId) return { ok: true, noCalendar: true };
    const raised = await raiseCalendarQuestion(trx, {
      accountId,
      messageId,
      contentId: row.id,
      title: detail.title,
      calendars: offered.slice(0, 4),
      onAnswer: said.named ? "write" : picks.length === 0 ? "pick" : null,
      // 038. Asked in their terms, and remembered on the answer, only when the
      // name is in their own message and the turn read nothing of anybody
      // else's: otherwise the model's `calendar` may carry words from a page,
      // an email or an event, and one tap would keep them in every prompt.
      person: (await rememberable(trx, messageId, said.person ?? null, sawApps || sawMail)) ?? null,
      sawApps,
    });
    return raised ? { ok: true, asked: true } : { ok: true, noCalendar: true };
  }

  if (call.tool === "edit_event" || call.tool === "delete_event") {
    const calendarId = await calendarOfEvent(accountId, call.sourceRef);
    if (!calendarId) return { ok: false, error: "unknown_event" };
    // The new times, read as add_content reads them.
    const when = call.tool === "edit_event" ? parseDates({ occursAt: call.startsAt, occursEndAt: call.endsAt }, await zoneOf(accountId, trx)) : null;
    if (call.tool === "edit_event" && when === null) return { ok: false, error: "bad_date" };
    const write: WriteAction =
      call.tool === "edit_event"
        ? {
            action: "edit",
            sourceRef: call.sourceRef,
            scope: call.scope,
            patch: {
              ...(call.title == null ? {} : { title: call.title }),
              ...(when?.occursAt ? { startsAt: when.occursAt } : {}),
              ...(when?.occursEndAt ? { endsAt: when.occursEndAt } : {}),
              ...(call.location == null ? {} : { location: call.location }),
            },
          }
        : { action: "delete", sourceRef: call.sourceRef, scope: call.scope };

    // What a turn that has read a calendar read is text other people wrote,
    // and an invitation is such a title. `sawApps` is the same fact that
    // taints a note written after a read. Here it turns a change or a removal
    // into a proposal when Undo could not take it back, which is "this and
    // all following"; one event is kept for the Undo and done, as an add is.
    // The outward test is untouched by any of this.
    const outcome = await writeThroughTool(accountId, calendarId, write, messageId, null, {
      confirm: sawApps,
    });
    if (outcome.kind === "refused") return { ok: false, error: outcome.reason };
    const onlyThis = (line: string) => (outcome.onlyThis ? { scope: "this" as const, line } : {});
    if (outcome.kind === "written") return { ok: true, written: true, sourceRef: outcome.sourceRef, ...onlyThis("Only this one changed.") };
    // Nothing has reached Google. The model says what it is waiting for; it
    // does not get to decide that it is not waiting.
    return { ok: true, waitingForThem: true, because: outcome.line, ...onlyThis("Only this one will change.") };
  }

  const ref = await readableContent(accountId, call.contentId, trx);
  if (!ref) return { ok: false, error: "unknown_content" };

  if (call.tool === "complete_content") {
    await tickIn(trx, accountId, ref.id, call.done);
    await touchThread(ref.threadId, trx);
    await noteThread(messageId, ref.threadId, true, trx);
    return { ok: true, done: true };
  }

  if (call.tool === "archive_content") {
    // The person's archive, step for step: the count, `put_back` on a row
    // put back so the hourly pass leaves it, and the share proposal re-checked.
    await setArchivedIn(trx as Transaction<Database>, accountId, ref.id, call.archived);
    await noteThread(messageId, ref.threadId, true, trx);
    return { ok: true, done: true };
  }

  // edit and move: this account's own rows only.
  // Author, or nobody current: a row whose author has gone from the thread
  // belongs to whoever is still in it. Same predicate the routes use, imported
  // rather than restated, because two copies of a permission rule is how one of
  // them ends up subtly different and nobody can tell which is right.
  if (ref.authorId !== accountId && !unowned(ref)) return { ok: false, error: "not_yours" };

  if (call.tool === "move_content") {
    try {
      await moveContent(accountId, ref.id, call.threadId);
    } catch (error) {
      if (error instanceof NotYours) return { ok: false, error: "unknown_thread" };
      throw error;
    }
    // Both ends changed and only one of them is where it went. The thread it
    // left has to reload or it goes on showing a row that is not in it any
    // more, which is exactly what happened before this.
    await noteThread(messageId, call.threadId, true, trx);
    if (ref.threadId !== call.threadId) {
      await noteThread(messageId, ref.threadId, false, trx);
    }
    return { ok: true, done: true };
  }

  // edit_content.
  // A time given here is written as add_content would write it: the same
  // parse, the same refusal, and a bare date is a day. A row already on a
  // calendar keeps its time: that change goes through `edit_event`, which
  // is the one that reaches Google.
  const when = parseDates(call, await zoneOf(accountId, trx));
  if (when === null) return { ok: false, error: "bad_date" };
  const timed = call.dueAt != null || call.occursAt != null || call.occursEndAt != null || call.rrule != null;
  let rule: string | null | undefined;
  // Whether the row is a day or a time follows the type's own column, when
  // this call gives it (023).
  let allDayGiven: boolean | undefined;
  let before: { type: string; title: string; due_at: Date | null; occurs_at: Date | null; attrs: unknown } | null = null;
  if (timed) {
    const held = await trx
      .selectFrom("content")
      .select(["source_ref", "type", "title", "due_at", "occurs_at", "occurs_end_at", "attrs"])
      .where("id", "=", ref.id)
      .executeTakeFirstOrThrow();
    if (held.source_ref) return { ok: false, error: "already_on_calendar" };
    // The span as the row will hold it, half from this call and half stored,
    // refused as the person's route refuses it: an end left before a moved
    // start is a row the hourly pass archives early.
    const startsAfter = call.occursAt == null ? held.occurs_at : when.occursAt;
    const endsAfter = call.occursEndAt == null ? held.occurs_end_at : when.occursEndAt;
    if (endsAfter && (!startsAfter || endsAfter < startsAfter)) return { ok: false, error: "bad_date" };
    before = held;
    const given = held.type === "event" ? call.occursAt : call.dueAt;
    if (given != null) allDayGiven = isBareDate(given);
    // 023. The rule anchors on the type's column as it stands after this
    // edit; a rule with nothing to anchor on, or outside the grammar, is
    // refused by name. A null leaves the rule alone: not stated, never remove.
    if (call.rrule != null) {
      const anchor = held.type === "event" ? (when.occursAt ?? held.occurs_at) : (when.dueAt ?? held.due_at);
      const canonical = ruleFor(call.rrule, anchor);
      if (canonical === false) return { ok: false, error: "bad_rule" };
      rule = canonical;
    }
  }

  // 030. A row's place. An event's location is set through the filter or
  // cleared; a link's point is only cleared; a saved place is renamed instead,
  // and a rename looks it up again. Whatever changes, the place as it was is
  // kept for this turn's Undo.
  const placeChange = await placeEdit(trx, call, ref.id, messageId);
  if (placeChange && "error" in placeChange) return { ok: false, error: placeChange.error };

  await trx
    .updateTable("content")
    .set({
      ...(placeChange?.set ?? {}),
      ...(call.title == null ? {} : { title: call.title }),
      ...(call.body === undefined ? {} : { body: call.body }),
      ...(call.url === undefined ? {} : { url: call.url }),
      ...(call.imageUrl === undefined ? {} : { image_url: call.imageUrl }),
      ...(call.dueAt == null ? {} : { due_at: when.dueAt }),
      ...(call.occursAt == null ? {} : { occurs_at: when.occursAt }),
      ...(call.occursEndAt == null ? {} : { occurs_end_at: when.occursEndAt }),
      ...(allDayGiven === undefined
        ? {}
        : { attrs: sql`attrs || ${JSON.stringify({ all_day: allDayGiven })}::jsonb` }),
      ...(rule === undefined ? {} : { rrule: rule }),
      // A priority a person pinned is not the planner's to change. The write
      // is simply skipped rather than refused: the model asked for something
      // reasonable and the answer is that somebody already decided.
      ...(call.priority == null ? {} : { priority: call.priority }),
      updated_at: sql`now()`,
    })
    .where("id", "=", ref.id)
    .where((eb) =>
      call.priority == null ? eb.val(true) : eb("priority_pinned", "=", false)
    )
    .execute();

  if (placeChange?.lookUp) {
    await enqueue({ kind: "location.resolve", payload: { contentId: ref.id }, priority: PRIORITY.background, tx: trx });
  }

  await touchThread(ref.threadId, trx);
  await noteThread(messageId, ref.threadId, true, trx);
  // 042. The turn is its account's: whose date this is, for its reminders.
  await dateSet(trx, { contentId: ref.id, actorId: accountId, dated: timed, worded: call.title != null || call.body !== undefined });

  // 024. A date the model moved on a row that already had one is recorded,
  // quietly, in this account's Activity, with the two days it moved between.
  if (before) {
    const was = before.type === "event" ? before.occurs_at : before.due_at;
    const now = before.type === "event" ? (call.occursAt == null ? was : when.occursAt) : (call.dueAt == null ? was : when.dueAt);
    if (was && now && was.getTime() !== now.getTime()) {
      const zone = await zoneOf(accountId, trx);
      const wasAllDay = (before.attrs as Record<string, unknown> | null)?.["all_day"] === true;
      await record(
        accountId,
        {
          kind: "moved",
          sent: false,
          reason: "design",
          ...movedCopy(before.title, dayLabel(was, wasAllDay, zone), dayLabel(now, allDayGiven ?? wasAllDay, zone)),
          threadId: ref.threadId,
          contentId: ref.id,
        },
        trx,
      );
    }
  }
  return { ok: true, done: true };
}

/** 025. The model's label tool. Every id is resolved against the rows' one
 *  thread by `applyLabels`, which also refuses anything a person set; a new
 *  name has to be in the words of the message being filed, and offload makes
 *  a label only below six. Refusals are the model's to read and correct. */
async function labelContent(
  trx: Transaction<Database>,
  accountId: string,
  messageId: string | null,
  call: Extract<z.infer<typeof body>, { tool: "label_content" }>,
): Promise<Outcome> {
  if (!messageId) return { ok: false, error: "unknown_content" };
  const message = await trx
    .selectFrom("messages")
    .select(["text", "turn_id", "source", "attrs"])
    .where("id", "=", messageId)
    .executeTakeFirstOrThrow();
  const threads = await trx
    .selectFrom("content")
    .select("thread_id")
    .distinct()
    .where("id", "in", call.contentIds)
    .where("deleted_at", "is", null)
    .execute();
  if (threads.length !== 1) return { ok: false, error: "unknown_content" };
  const threadId = threads[0]!.thread_id;
  if (!(await memberOf(accountId, threadId, trx))) return { ok: false, error: "unknown_content" };
  // 028. Nothing is labelled in the default thread: a label there would be
  // drawn nowhere and removable nowhere. Done, not refused, so the model does
  // not try again.
  const account = await trx.selectFrom("accounts").select("default_thread_id").where("id", "=", accountId).executeTakeFirst();
  if (account?.default_thread_id === threadId) return { ok: true, done: true };

  const runId = await runForTurn(trx, threadId, message.turn_id, "offload");
  const actor = { accountId, via: "offload" as const, runId };
  const ids: string[] = [];
  try {
    const live = await trx
      .selectFrom("labels")
      .select(["id", "name"])
      .where("thread_id", "=", threadId)
      .where("deleted_at", "is", null)
      .execute();
    ids.push(...call.add);
    for (const raw of call.new) {
      const name = normaliseLabelName(raw);
      const found = live.find((label) => label.name.toLowerCase() === name.toLowerCase());
      if (found) {
        ids.push(found.id);
        continue;
      }
      if (!nameInDump(name, ownWords(message))) return { ok: false, error: "not_in_the_dump" };
      const made = await createLabel(trx, actor, threadId, { name });
      live.push({ id: made.id, name: made.name });
      ids.push(made.id);
    }
    await applyLabels(trx, actor, threadId, { content: call.contentIds }, ids, call.remove);
  } catch (error) {
    if (error instanceof NotYours) return { ok: false, error: "unknown_content" };
    if (error instanceof LabelRefused) {
      if (error.reason === "bad_label_name" || error.reason === "label_taken" || error.reason === "label_gone") {
        return { ok: false, error: "unknown_content" };
      }
      return { ok: false, error: error.reason };
    }
    throw error;
  }
  await recordSortActivity(trx, runId, labelledLiveCopy);
  return { ok: true, done: true };
}

export async function toolRoutes(app: App): Promise<void> {
  app.post(
    "/internal/v1/tool-call",
    { schema: { body, response: { 200: result, 401: refused, 404: refused } } },
    async (request, reply) => {
      const header = request.headers.authorization;
      const presented = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
      if (!tokenMatches(presented)) {
        return reply.code(401).send({ error: "unauthorised" as const });
      }

      const call = request.body;
      const context = await jobContext(call.jobId);
      if (!context) return reply.code(404).send({ error: "unknown_job" as const });

      const { accountId, messageId, sawApps, sawMail } = context;

      // A refusal from the access helpers is a refusal, not a crash.
      //
      // `requireMember` throws, and without this it escaped as a 500. That is
      // worse than an untidy status: this endpoint's whole contract is that a
      // refusal is a 200 the planner can read and recover from, and a 5xx is a
      // transport problem the worker retries. A leaked exception got a
      // considered "no" retried three times and then reported to the model as
      // "unavailable", which is a different thing entirely.
      //
      // The transaction returns the outcome; the response is sent after it
      // commits. Sending from inside would tell the worker a piece was filed
      // and then lose it to a failed commit, which is the one failure this
      // whole feature is built to make impossible.
      // Google before the transaction, never in it: see `readAround`.
      if (call.tool === "create_event" && sawMail) {
        const row = await db.selectFrom("content").select("occurs_at").where("id", "=", call.contentId).where("account_id", "=", accountId).executeTakeFirst();
        if (row?.occurs_at) await readAround(accountId, row.occurs_at).catch(() => undefined);
      }

      const outcome = await attempt(() =>
        db.transaction().execute(async (trx): Promise<Outcome> => {
        // The bound, counted from what is actually in the database rather than
        // from anything the caller reports.
        //
        // **It counts filings, not tool calls.** A `create_thread` writes no
        // content row and so does not count here, which is a real gap and a
        // small one: a model that only ever creates threads is still bounded by
        // the loop's own MAX_MODEL_CALLS, and it produces empty threads a
        // person can see and delete rather than a bill. Stated rather than
        // quietly true, because the acceptance criterion says "the number of
        // tool calls in a turn is bounded" and this bounds one of the two.
        const filed = await trx
          .selectFrom("content")
          .select(({ fn }) => fn.countAll<string>().as("n"))
          .where("derived_from_message_id", "=", messageId)
          .where("deleted_at", "is", null)
              .executeTakeFirstOrThrow();

        // 038. A memory files nothing either.
        if (call.tool === "memory") {
          return memoryTool(trx, { accountId, messageId, sawApps, sawMail }, call);
        }

        // 025. Labelling files nothing, so it is not held to the filing
        // bound above.
        if (call.tool === "label_content") {
          return labelContent(trx, accountId, messageId, call);
        }

        if (Number(filed.n) >= MAX_TOOL_CALLS) {
          return { ok: false, error: "limit_reached" };
        }

        if (call.tool === "create_thread") {
          // The thread and its first membership together. A thread with no
          // members is unreachable by every query in the product, including the
          // one `add_content` is about to run against it.
          //
          // **Not idempotent on toolCallId, deliberately.** There is no natural
          // key: two threads may share a name within an account, so an upsert on
          // the name would silently hand back somebody else's thread. A retried
          // create therefore makes a second empty thread, which is visible and
          // deletable, where the alternative is filing into a thread the model
          // did not ask for. The weaker of the two halves, named here rather
          // than left to be discovered.
          const thread = await trx
            .insertInto("threads")
            .values({
              created_by_account_id: accountId,
              name: call.name,
              ...(await markFor(trx, accountId, call.name, call.icon)),
              always_on: false,
              // Thread layouts: offload's one pick, at creation. Omitted is the
              // column's own 'default'/'offload'.
              ...(call.layout ? { layout: call.layout } : {}),
              last_activity_at: sql`now()`,
              updated_at: sql`now()`,
            })
            .returning(["id", "name"])
            .executeTakeFirstOrThrow();

          await trx
            .insertInto("thread_members")
            .values({
              thread_id: thread.id,
              account_id: accountId,
              invited_by: null,
              // The creator is accepted with a null inviter, so membership is
              // one concept rather than an owner plus a grants table.
              state: "accepted",
              responded_at: sql`now()`,
            })
            .execute();

          // The labels the layout organises by, made as offload. A new thread
          // has none, so offload's limit of six is never met.
          if (call.layout) {
            for (const name of LAYOUT_LABELS[call.layout]) {
              await createLabel(trx, { accountId, via: "offload" }, thread.id, { name });
            }
          }

          // `[]` rather than absent: a new thread cannot have notes, and the
          // model seeing one shape from both filing tools is worth a
          // two-character payload.
          return {
            ok: true,
            threadId: thread.id,
            threadName: thread.name,
            notes: [],
            notesFromMembers: [],
            notesFromApps: [],
          };
        }

        // The six tools that touch something that already exists.
        //
        // Handled before add_content because they share nothing with it: they
        // take a content id rather than a thread, and four of them delegate to
        // the functions the thread page already uses, so the rule the screen
        // enforces and the rule the model gets are the same rule.
        if (call.tool !== "add_content") {
          return existing(call, accountId, trx, messageId, sawApps, sawMail, await lookingAt(messageId, trx));
        }

        // add_content.
        //
        // Membership, on every call, with state accepted. A pending invitation
        // is not a thread you can write into.
        const thread = await trx
          .selectFrom("threads")
          .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
          // 028. The default thread's stored name never reaches the model.
          .select(["threads.id as id", shownToModel("threads.id", "threads.name", accountId).as("name")])
          .where("threads.id", "=", call.threadId)
          .where("threads.deleted_at", "is", null)
          .where("thread_members.account_id", "=", accountId)
          .where("thread_members.state", "=", "accepted")
          .executeTakeFirst();

        // One reason, whether it does not exist or is somebody else's.
        if (!thread) return { ok: false, error: "unknown_thread" };

        // Read before anything is written, and before the idempotency check
        // below, so that a turn's second call into the same thread sees the
        // first one's row and knows the notes already went out. Reading it
        // after the insert would make every call look like a repeat of itself.
        const carried = await notesForTurn(messageId, thread.id, accountId, call.toolCallId, trx);

        // A location's title is the string that will reach a geocoder, so it
        // is held to a stricter shape than any other title. Refused rather than
        // truncated: a truncated place name resolves to the wrong place, which
        // is worse than not resolving at all.
        if (
          call.type === "location" &&
          (call.title.includes("\n") || call.title.length > PLACE_NAME_CHARS)
        ) {
          return { ok: false, error: "bad_place_name" };
        }

        // 030. An event's location goes to Google, so it passes the filter
        // here or is refused by name; a location on anything else is not
        // somewhere a row can be.
        let location: string | null = null;
        if (call.location != null) {
          if (call.type !== "event") return { ok: false, error: "location_not_here" };
          location = placeQuery(call.location);
          if (location === null) return { ok: false, error: "bad_place_name" };
        }
        // 044. The worker's envelope carries a page read on a link and PDF
        // actions on a file; a page read anywhere else is refused, as before.
        if (call.worker?.pageRead && call.type !== "link")
          return { ok: false, error: "location_not_here" };
        // The resolved actions, re-checked at the write though the worker
        // already filtered them (SEC-2, against a stale or malformed call), on
        // any row since 050; a failing entry dropped rather than the dump
        // failed.
        const actions = validateActions(call.worker?.actions);
        // The page's read counts only while the map is on and the author's
        // switch is, read here: the worker is not trusted for an access
        // decision (routes/internal.ts).
        const page =
          call.type === "link" && call.worker != null && (await mayReadForPlace(accountId, trx))
            ? call.worker
            : null;
        const pageName =
          page?.pageLocation && "name" in page.pageLocation && !/[\r\n]/.test(page.pageLocation.name)
            ? page.pageLocation.name.trim().slice(0, 120) || null
            : null;

        const when = parseDates(call, await zoneOf(accountId, trx));
        if (when === null) return { ok: false, error: "bad_date" };
        // A rule anchors on the type's column: an event repeats when it
        // happens, everything else when it is wanted by. "Pay rent every
        // month" as a task with no due date is a plausible slip, and the
        // answer is a refusal the model can read rather than a rule quietly
        // dropped (023 AC-8).
        const contentRule = ruleFor(call.rrule, call.type === "event" ? when.occursAt : when.dueAt);
        if (contentRule === false) return { ok: false, error: "bad_rule" };

        // 020. The photo this row is, resolved against the message's own
        // blobs before anything is written. An index on a row that is not a
        // picture, an index past the end, and a photo this turn already
        // filed are one refusal each: the model gets the complaint back and
        // files again without it.
        const photo = call.photo ? await photoForRow(trx, messageId, call.photo, call.type) : null;
        if (call.photo && !photo) return { ok: false, error: "unknown_photo" };
        // 041. A PDF the same way, by its index among the message's PDFs, and
        // a `file` row is only ever a PDF the turn was handed.
        const pdf = call.pdf ? await pdfForRow(trx, messageId, call.pdf, call.type) : null;
        if (call.pdf && !pdf) return { ok: false, error: "unknown_pdf" };
        if (call.type === "file" && !pdf) return { ok: false, error: "unknown_pdf" };

        const inserted = await trx
          .insertInto("content")
          .values({
            account_id: accountId,
            thread_id: thread.id,
            derived_from_message_id: messageId,
            type: call.type,
            title: call.title,
            // The photo's own sentence about when and where, appended by the
            // server rather than asked of the model: a date and a town, never
            // a coordinate.
            body: withTaken(call.body, photo ?? pdf),
            url: call.url ?? null,
            image_url: call.imageUrl ?? null,
            source: "person",
            tool_call_id: call.toolCallId,
            due_at: when.dueAt,
            occurs_at: when.occursAt,
            occurs_end_at: when.occursEndAt,
            // **A rule needs a first occurrence and the database enforces it,
            // so this keeps the two columns consistent rather than letting the
            // constraint raise.** "Pay rent every month" filed as a task with
            // only a due date is a plausible slip, and an unhandled check
            // violation here is a 500 from an endpoint whose whole contract is
            // that a refusal is a 200 the model can read and recover from.
            // `notes.ts` already did this and `add_content` did not.
            rrule: contentRule,
            is_reminder: call.isReminder,
            priority: call.priority,
            // 030. An event's place name, or the name a link's page gave.
            location: location ?? pageName,
            place_read_at: page ? sql`now()` : null,
            // 044. The PDF's actions live in attrs beside any all-day flag,
            // read whole with the row and never in a WHERE (decisions.md 001).
            ...((): { attrs?: unknown } => {
              const attrs = { ...(allDayAttrs(call) ?? {}), ...(actions.length ? { actions } : {}) };
              return Object.keys(attrs).length ? { attrs } : {};
            })(),
            updated_at: sql`now()`,
          })
          // Idempotent on the tool call, so a post that succeeded and whose
          // response was lost cannot file the same piece twice. The index is
          // partial on tool_call_id is not null, so the conflict target has to
          // repeat the predicate or Postgres refuses to infer it.
          .onConflict((oc) =>
            oc
              .columns(["derived_from_message_id", "tool_call_id"])
              .where("tool_call_id", "is not", null)
              .doNothing()
          )
          .returning("id")
          .executeTakeFirst();
        // 024. A row filed into a thread with other members reaches them,
        // coalesced over ten minutes and composed at send time.
        if (inserted) await noteAddition(thread.id, accountId, new Date(), trx);
        // 028. A home in mind, offered on the row.
        if (inserted) {
          await suggestAtFiling(trx, {
            accountId,
            target: { contentId: inserted.id },
            landedIn: thread.id,
            suggested: call.suggestThreadId,
            untrusted: sawApps || sawMail,
          });
        }

        if (!inserted) {
          // The first post won. Return its id rather than a new row, and touch
          // no counter: it already did.
          const existing = await trx
            .selectFrom("content")
            .select("id")
            .where("derived_from_message_id", "=", messageId)
            .where("tool_call_id", "=", call.toolCallId)
            .executeTakeFirstOrThrow();
          return {
            ok: true,
            threadId: thread.id,
            threadName: thread.name,
            contentId: existing.id,
            // On the retry too. A lost response must not also lose the thread's
            // notes, or a retried filing is the one that ignores them.
            //
            // `carried` was read before this call wrote anything, so a retry of
            // the same tool call sees exactly what the first attempt saw.
            ...(carried ? shapeNotes(carried) : {}),
          };
        }

        // A location wants a pin, and getting one means a third party, so it
        // happens in a job. Enqueued in the same transaction as the row, so a
        // rolled back filing cannot leave a job pointing at nothing and a
        // committed one cannot be silently un-geocoded.
        // 030. A page's own coordinates are the page's: kept as they are, with
        // nothing sent to Google.
        if (page?.pageLocation && "lat" in page.pageLocation) {
          await attachPagePoint(inserted.id, page.pageLocation.lat, page.pageLocation.lng, trx);
        }
        if (call.type === "location" || location !== null || pageName !== null) {
          await enqueue({
            kind: "location.resolve",
            accountId,
            payload: { contentId: inserted.id },
            priority: PRIORITY.background,
            tx: trx,
          });
        }

        // 020. The row carries the picture: the link, and the thread wrap
        // that makes it readable to that thread's members.
        if (photo) await linkPhoto(trx, inserted.id, photo.id, thread.id);
        if (pdf) await linkPhoto(trx, inserted.id, pdf.id, thread.id);

        // Denormalised, in the same transaction as the write that changes them,
        // per 001. A count maintained anywhere else drifts.
        await trx
          .updateTable("threads")
          .set({
            content_count: sql`content_count + 1`,
            last_activity_at: sql`now()`,
            updated_at: sql`now()`,
          })
          .where("id", "=", thread.id)
          .execute();

        return {
          ok: true,
          threadId: thread.id,
          threadName: thread.name,
          contentId: inserted.id,
          // What the thread holds about itself, handed back at the moment the
          // model files into it. It has already written the title by now, which
          // is the cost of not putting every thread's notes in the prompt up
          // front; `edit_content` is how it fixes one it got wrong.
          ...(carried ? shapeNotes(carried) : {}),
        };
        })
      );

      return reply.send(outcome);
    }
  );
}

/** Run the transaction, turning a `NotYours` into the one refusal. */
async function attempt(run: () => Promise<Outcome>): Promise<Outcome> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NotYours) return { ok: false, error: "unknown_thread" };
    throw error;
  }
}
