// Threads, and what is in them.
//
// Four reads and six writes. The reads are the ones with a performance
// contract: the thread bundle is a fixed number of queries whatever the thread
// holds, because the alternative shape, one query per thing the screen draws,
// grows with a thread's shape rather than with its size and is the one that
// gets slow invisibly.
//
// Every route here resolves authorization through `../threads/access.js` and
// none of them touches `thread_members` directly. Every refusal is the same
// refusal, for the reason stated there.

import { dateSet, remindersOf, remindersOfRow, setReminders } from "../notifications/labels.js";
import { z } from "zod";
import { fileOnRow, fileToWire, type FileOnRow } from "../blobs/wire.js";
import { sql, type Transaction } from "kysely";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { App } from "../app.js";
import { currentAccountId } from "../auth/current-account.js";
import { DEFAULT_THREAD_ICON, formatRule, isThreadIcon, LAYOUT_LABELS, LAYOUTS, labelsToDrop, labelsToMake, parseRule, pickThreadIcon, utcDay, type Layout } from "@offload/widgets";
import { zoneOf } from "../accounts/zone.js";
import { Refused } from "../threads/refusals.js";
import { threadLine } from "../threads/line.js";
import { db } from "../db.js";
import type { Database } from "../schema.js";
import { dropThreadWrapIfUnused, ensureThreadWrap, passThreadKeyOn } from "../blobs/keys.js";
import {
  restoreFilesOfRow,
  restoreFilesOfThread,
  restoreSourceOfRow,
  restoreSourcesOfThread,
  takeFilesOfRow,
  takeFilesOfThread,
  takeSourceOfRow,
  takeSourcesOfThread,
} from "../threads/takes.js";
import { initialsOf } from "../accounts/initials.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import {
  NOTE_BODY_CHARS,
  NOTE_TEXT_CHARS,
  NoteTooLong,
  addNote,
  deleteNote,
  editNote,
  reprioritiseNote,
  foldedNotes,
  noteCounts,
  readableNotes,
  requireReadableNote,
  restoreNote,
  setMuted,
  type Note,
} from "../threads/notes.js";
import { WIDGET_KIND_CHARS, readPreference, type ThreadPreference } from "../threads/widgets.js";
import { calendarCounts, dropPicksOf, setPick, threadEvents, viewerCalendars } from "../threads/calendars.js";
import { hasPoint, threadPoints } from "../places/points.js";
import { emit } from "../analytics.js";
import { isBareDate, parseWhen, plausible } from "../threads/dates.js";
import { invitationsFor } from "../threads/sharing.js";
import {
  NotYours,
  memberOf,
  requireAuthor,
  requireMember,
  requireReadable,
  touchThread,
  unowned,
} from "../threads/access.js";
import { OverBudget } from "../budget.js";
import { purgeAbout } from "../notifications/activity.js";
import { destroyCopiesHolding } from "../exports/copy.js";
import { LABEL_LIMIT, LabelRefused, carriesAny, contentLabelsFor, createLabel, deleteLabel, labelsOfThread, restoreLabel, setRowLabels, unlabelledCount, withContentLabels, withNoteLabels, type Actor } from "../threads/labels.js";
import { noteAddition } from "../notifications/people.js";
import { looseSummary } from "../loose/read.js";
import { shownThreadName } from "../threads/default.js";
import { markFor, shownThreadHue, shownThreadIcon } from "../threads/icons.js";
import { holdFloor } from "../loose/suggestions.js";

/** 022. The account's default thread cannot be shared or deleted. */
async function isDefaultThreadOf(accountId: string, threadId: string): Promise<boolean> {
  const account = await db.selectFrom("accounts").select("default_thread_id").where("id", "=", accountId).executeTakeFirst();
  return account?.default_thread_id === threadId;
}

/** One screenful. 001's heavy case is 500 rows in one thread and the page draws
 *  a dozen, so fetching them all to show twelve is the thing this prevents. */
const PAGE = 30;

/** Past this, a thread is "older" on My threads. Derived from activity rather
 *  than stored, because it is a function of time rather than a property of the
 *  thread, which is 001's own reasoning for not storing it. */
const STALE_DAYS = 30;

/** Wraps a handler so a `NotYours` becomes the one refusal rather than a 500.
 *  Written once so no endpoint can forget, and so no endpoint can accidentally
 *  distinguish its refusals from any other's. */
function guard<T>(
  reply: FastifyReply,
  run: () => Promise<T>,
): Promise<T | FastifyReply> {
  return run().catch((error: unknown) => {
    if (error instanceof NotYours) {
      return reply.code(404).send({ error: "not_found" as const });
    }
    // 023. A field that cannot be written as sent: the request was theirs
    // to make, so it is not a 404, and the client puts the screen back with
    // one clause. A row on a calendar is a conflict with where its time lives.
    if (error instanceof Refused) {
      return reply.code(error.code === "on_calendar" ? 409 : 400).send({ error: error.code });
    }
    if (error instanceof OverBudget) {
      return reply.code(429).send({ error: "daily_limit" as const, scope: error.scope });
    }
    throw error;
  });
}

const notFound = z.object({ error: z.literal("not_found") });
const refused = z.object({ error: z.enum(["bad_date", "bad_rule", "on_calendar"]) });
const unauthenticated = z.object({ error: z.literal("unauthenticated") });

const memberSchema = z.object({
  accountId: z.string(),
  displayName: z.string(),
  initials: z.string(),
  isYou: z.boolean(),
});

/** 022. A person as the sharing surfaces draw them: no `isYou`, and the name
 *  may be null, which every surface draws as "Someone". */
const memberFace = z.object({
  accountId: z.string(),
  displayName: z.string().nullable(),
  initials: z.string(),
});

/** 037. A thread's name and look, as Edit thread writes and returns them. */
const threadMark = z.object({
  name: z.string(),
  icon: z.string(),
  hue: z.number(),
  iconSetBy: z.enum(["offload", "person"]),
});

const threadRow = z.object({
  id: z.string(),
  name: z.string(),
  /** Always `lasso` since 037. A phone build from before it draws this field
   *  straight from the list and has no glyph for the seventy, so the thread's
   *  own icon travels beside it. To go once no such build is in use. */
  icon: z.string(),
  /** 037. The thread's icon and its hue, one of the ten label hues. */
  threadIcon: z.string(),
  threadHue: z.number(),
  count: z.number(),
  meta: z.string(),
  /** The account's default thread, which cannot be deleted: everything with no
   *  obvious home lands there, so an account without one has nowhere to put
   *  anything. The list carries it so the row can say why rather than offering
   *  a control the server will refuse. */
  isDefault: z.boolean(),
  /** 2026-10-07. Everybody else in it, by name: a shared thread's row offers
   *  Leave and names who it stays with. Empty on a thread of your own. */
  others: z.array(z.string()),
});

const threadList = z.object({
  groups: z.array(
    z.object({
      // 028. Two groups: Always on is retired, and the one thread that was
      // ever in it, the default, is drawn as `loose` instead.
      key: z.enum(["now", "older"]),
      threads: z.array(threadRow),
    })
  ),
  /** 022. Waiting shares, one strip each at the top of the list. Read here
   *  rather than on their own route so an open of My threads is one call. */
  /** 028. What is not in a thread: null when nothing is, which is when the
   *  group is not drawn. */
  loose: z.lazy(() => looseSummarySchema).nullable(),
  invitations: z.array(
    z.object({
      memberId: z.string(),
      threadId: z.string(),
      threadName: z.string(),
      from: memberFace,
      preview: z.object({ count: z.number(), titles: z.array(z.string()) }),
      members: z.array(z.string()),
    })
  ),
});

/** How many folded notes come back in one page. History is browsed, not
 *  worked with, so this is small on purpose. */
const FOLDED_PAGE = 20;

export const noteSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** What was dumped when it did not fit in 200 characters. Never in a prompt,
   *  and never shown on a row: the row shows `text` and opening it shows this. */
  body: z.string().nullable(),
  /** `learned` is offload's, and the screen marks it. It also means offload
   *  wrote the text over somebody's longer words, which is the same claim: this
   *  sentence is offload's. */
  origin: z.enum(["stated", "learned"]),
  /** Null once the author deleted their account: the note stays in the shared
   *  thread it belongs to and the name comes off it. */
  authorId: z.string().nullable(),
  /** False once the author left or deleted their account, at which point every
   *  member may delete it. */
  authorIsMember: z.boolean(),
  /** 042. The author's Remind me, null to anybody else. */
  reminders: z.enum(["on", "off"]).nullable().default(null),
  muted: z.boolean(),
  occursAt: z.coerce.date().nullable(),
  occursEndAt: z.coerce.date().nullable(),
  dueAt: z.coerce.date().nullable(),
  placeId: z.string().nullable(),
  /** Where it sits in the section, 0 to 100 and higher first. A person moves
   *  it by dragging the row; nothing else writes it. */
  priority: z.number(),
  /** When it was last written. What decides which notes reach a prompt when a
   *  thread holds more than the budget, and what the row shows. */
  writtenAt: z.coerce.date(),
  /** 028. When it was put down, which an edit does not move: the loose list's
   *  order and its meta line. */
  createdAt: z.coerce.date(),
  /** The date carries no time, so nothing may draw one. */
  allDay: z.boolean(),
  /** That it comes round again, as a rule rather than as occurrences. The
   *  calendar expands it over whatever window is on screen. */
  rrule: z.string().nullable(),
  /** Set aside by the daily job. Only ever present on the folded list. */
  supersededAt: z.coerce.date().nullable(),
  /** 025. The note's live labels, in the thread's label order. */
  labels: z.array(z.string()),
});

const threadBundle = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  hue: z.number(),
  /** 037. Whose pick the icon and hue are: Edit thread previews a rename's
   *  pick only while it is still offload's. */
  iconSetBy: z.enum(["offload", "person"]),
  alwaysOn: z.boolean(),
  /** `unlabelled` is 025's No label count: live, unarchived rows carrying no
   *  label. */
  counts: z.object({ active: z.number(), archived: z.number(), unlabelled: z.number() }),
  members: z.array(memberSchema),
  /** 025. The thread's labels in the order they were made, each with how many
   *  live rows and notes carry it. At most ten. */
  labels: z.array(z.object({ id: z.string(), name: z.string(), colour: z.number(), count: z.number() })),
  /** What this thread holds about itself. Active only: what the daily job
   *  folded is its own paginated read, because that list has no ceiling. */
  notes: z.array(noteSchema),
  /** Active and folded. The second is what the section's folded-history control
   *  counts, and a thread with none of them says nothing. */
  noteCounts: z.object({ active: z.number(), folded: z.number() }),
  /** 2026-09-29. The line My threads draws under the name, for the web's head. */
  line: z.string(),
  /** How this thread wants to look. Absent fields mean derived from content. */
  preference: z.object({
    widgets: z.array(z.string()).optional(),
    hideDone: z.boolean().optional(),
  }),
  /** Always null. offload does not summarise a thread yet and nothing writes a
   *  standing summary, so the field is here in the shape the client already
   *  renders an empty state from. When something writes one, no client changes. */
  /** Null until something writes summaries, which nothing does. Nullable
   *  string rather than `null` so the client's branch is real code that is
   *  typechecked and tested rather than a branch nobody can reach. */
  standing: z.string().nullable(),
  /** 019. The viewer's picks and approved count, and whether anybody has
   *  picked here, which earns the rail. Null when the account has no calendar
   *  connection at all, which is what hides the glyph. */
  calendars: z
    .object({ picked: z.number(), total: z.number(), anyPicked: z.boolean() })
    .nullable(),
  /** 022. False on the account's default thread, where the Share control is
   *  not drawn: every dump with no obvious home lands there, so sharing it
   *  would share whatever arrives next. The server refuses it too. */
  shareable: z.boolean(),
  /** 028. The caller's own default thread, which no client draws as a thread:
   *  they open Not in a thread in its place. Still served, because search and
   *  answering read it. */
  isDefault: z.boolean(),
  /** 030. Something in it is on the map, so the switch is drawn. Computed by
   *  the server so the three surfaces agree; false while the map is off. */
  hasPoint: z.boolean(),
  /** Thread layouts (2026-10-19). The layout, whose pick it is, the one
   *  suggestion the line draws (null unless it should), and the heads-up
   *  another member sees once after somebody else switched. */
  layout: z.enum(LAYOUTS),
  layoutSetBy: z.enum(["offload", "person"]),
  layoutSuggestion: z.enum(["todo", "events", "gallery", "project", "timeline"]).nullable(),
  layoutChange: z
    .object({
      by: z.object({ accountId: z.string(), displayName: z.string() }),
      layout: z.enum(LAYOUTS),
      at: z.string(),
    })
    .nullable(),
});

export const contentRow = z.object({
  id: z.string(),
  /** 025. The row's live labels, in the thread's label order. */
  labels: z.array(z.string()),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  url: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** 020. The picture a photo row carries, as the id the client builds a
   *  rendition URL from. `ready` is whether the renditions exist yet. Null on
   *  everything that is not a photo. */
  photo: fileOnRow.nullable(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
  /** What 006 extracts, and what 007's widgets are derived from. All of it may
   *  be null or empty, which is what a thread of plain notes looks like. */
  doneAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  occursAt: z.string().nullable(),
  /** The other end of a span, so a thing that covers three days is drawn on
   *  three days. Written since 0011 and read by nothing until 015. */
  occursEndAt: z.string().nullable(),
  /** That it comes round again, as a rule the calendar expands. Distinct from
   *  `seriesRef`, which is occurrences a calendar already sent. */
  rrule: z.string().nullable(),
  isReminder: z.boolean(),
  /** 042. The author's Remind me: on while offload will remind them, off once
   *  they stopped it, null otherwise and null to anybody else. */
  reminders: z.enum(["on", "off"]).nullable(),
  /** 023. Written to a calendar, so its time is Google's: the sheet offers no
   *  When on it and the route refuses a date or a rule, as the tool layer
   *  already did. */
  onCalendar: z.boolean(),
  priority: z.number(),
  priorityPinned: z.boolean(),
  /** The repeating series this occurrence belongs to, or null for a one off.
   *
   *  Derived from `attrs`, which is never sent whole, exactly as `place` is
   *  built rather than the raw key being handed over. A list collapses a series
   *  to one entry and counts the rest; a calendar draws every occurrence, which
   *  is why the field says which series rather than how to draw it. */
  seriesRef: z.string().nullable(),
  /** The date carries no time, so nothing may draw one. A day drawn as a time
   *  is a day drawn wrong: "Sunday brunch" filed as a bare date read
   *  "Saturday, 8:00 PM" to somebody in New York. */
  allDay: z.boolean(),
  /** 044. Up to two links a PDF carried, offered beside it. Derived from
   *  `attrs`, which is never sent whole; null for a row with none. */
  actions: z
    .array(z.object({ label: z.string(), url: z.string() }))
    .max(2)
    .nullable(),
  place: z
    .object({
      id: z.string(),
      lat: z.number().nullable(),
      lng: z.number().nullable(),
      approximate: z.boolean(),
    })
    .nullable(),
  /** 030. An event's location, in offload's own words. */
  location: z.string().nullable(),
  author: z.object({
    /** Null once they deleted their account. Their content stays in the
     *  threads they shared; the name comes off it. */
    accountId: z.string().nullable(),
    displayName: z.string(),
    isYou: z.boolean(),
  }),
  /** Computed by the same predicate the endpoints enforce, so the client cannot
   *  draw a control the server will refuse or hide one it would allow. */
  canDelete: z.boolean(),
  canMove: z.boolean(),
  /** Typed straight into the thread and not read by offload yet. The row is
   *  already saved and already usable; this only says a tidier version may
   *  arrive. Null the rest of the time, which is almost always. */
  filingAt: z.string().nullable(),
});

// 028. Loose content on the wire: the thread page's own row or note, so both
// clients reuse their rows and sheets, plus at most one suggestion.
export const suggestionSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string(),
    kind: z.literal("move"),
    thread: z.object({ id: z.string(), name: z.string(), icon: z.string(), hue: z.number() }),
    /** Up to two of the thread's other members, then how many more: who will
     *  see it, before the tap. Empty on a thread nobody else is in. */
    faces: z.array(z.object({ accountId: z.string(), initials: z.string(), displayName: z.string() })),
    more: z.number(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("create"),
    proposal: z.object({ id: z.string(), name: z.string(), count: z.number() }),
  }),
]);

export const looseEntrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("content"), row: contentRow, suggestion: suggestionSchema.nullable() }),
  z.object({ kind: z.literal("note"), note: noteSchema, suggestion: suggestionSchema.nullable() }),
]);

const chipCounts = z.object({
  todo: z.number().optional(),
  link: z.number().optional(),
  photo: z.number().optional(),
  note: z.number().optional(),
  event: z.number().optional(),
  place: z.number().optional(),
  voice: z.number().optional(),
  file: z.number().optional(),
});

export const looseSummarySchema = z.object({
  count: z.number(),
  byType: chipCounts,
  rows: z.array(looseEntrySchema),
});

export const loosePageSchema = z.object({
  rows: z.array(looseEntrySchema),
  nextCursor: z.string().nullable(),
  count: z.number(),
  byType: chipCounts,
  /** The default thread's archived rows, for the list's foot row. */
  archived: z.number(),
});

const contentPage = z.object({
  /** `ticked` only when the label's list asked, with `ticksFor`. */
  rows: z.array(contentRow.extend({ ticked: z.boolean().optional() })),
  nextCursor: z.string().nullable(),
});

const contentDetail = contentRow.extend({
  threadId: z.string(),
  threadName: z.string().nullable(),
  threadIcon: z.string().nullable(),
  threadHue: z.number().nullable(),
  from: z
    .object({ messageId: z.string(), text: z.string().nullable(), at: z.string() })
    .nullable(),
});

/** Members of one thread, with the viewer marked. */
async function membersOf(threadId: string, viewerId: string) {
  const rows = await db
    .selectFrom("thread_members")
    .innerJoin("accounts", "accounts.id", "thread_members.account_id")
    .select(["accounts.id as id", "accounts.display_name as displayName"])
    .where("thread_members.thread_id", "=", threadId)
    .where("thread_members.state", "=", "accepted")
    .where("accounts.deleted_at", "is", null)
    .execute();

  return rows.map((row) => {
    const name = row.displayName ?? "Someone";
    return {
      accountId: row.id,
      displayName: name,
      initials: initialsOf(name),
      isYou: row.id === viewerId,
    };
  });
}

/** The row shape both the page and the detail return, so the two cannot drift. */
export interface RawRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  image_url: string | null;
  created_at: Date;
  archived_at: Date | null;
  /** Null once the author deleted their account. OFF-3 keeps their content in
   *  the threads they shared, so the row outlives them and loses the name. */
  account_id: string | null;
  authorName: string | null;
  /** Whether the author is still in this thread. False once they deleted their
   *  account or left, at which point the row is everyone's. */
  authorIsMember: boolean;
  done_at: Date | null;
  /** Typed straight in and queued for offload to read. Null once it has. */
  filing_at: Date | null;
  due_at: Date | null;
  occurs_at: Date | null;
  /** The other end of a span. **Written since 0011 and read by nothing until
   *  015**, which is why a two day event drew as a point on the rail: the
   *  column was on the row, off the select, and absent from every shape above
   *  it. */
  occurs_end_at: Date | null;
  rrule: string | null;
  source_ref: string | null;
  is_reminder: boolean;
  priority: number;
  priority_pinned: boolean;
  place_id: string | null;
  /** Whatever the source put on the row. Only `series_ref` is read here, and
   *  only to say whether an occurrence belongs to something that repeats.
   *
   *  `unknown` because that is what Kysely gives a jsonb column, and narrowing
   *  it at the boundary would be claiming a shape nothing validates. */
  attrs: unknown;
  /** 030. An event's location; a link's is a lookup key and never sent. */
  location: string | null;
  placeLat: number | null;
  placeLng: number | null;
  placeApproximate: boolean | null;
}

/** Which repeating series an occurrence belongs to, or null.
 *
 *  `series_ref` is Google's id for the whole series, written by the calendar
 *  sync onto every occurrence it produces. Empty string is treated as absent:
 *  a row whose series is the empty string belongs to nothing, and grouping by
 *  it would collect every such row into one imaginary series. */
/** A date with no time in it. Derived from `attrs`, which is never sent whole,
 *  exactly as `seriesRef` and `placeId` are. */
function allDayOf(attrs: unknown): boolean {
  if (typeof attrs !== "object" || attrs === null) return false;
  return (attrs as Record<string, unknown>)["all_day"] === true;
}

function seriesRefOf(attrs: unknown): string | null {
  if (typeof attrs !== "object" || attrs === null) return null;
  const ref = (attrs as Record<string, unknown>)["series_ref"];
  return typeof ref === "string" && ref.length > 0 ? ref : null;
}

/** 044. The links a PDF carried, up to two, from `attrs.actions`. Derived
 *  rather than sending `attrs` whole, as `seriesRef` and `allDay` are; null
 *  when the row has none, so an older client sees nothing new. */
export function actionsOf(attrs: unknown): { label: string; url: string }[] | null {
  if (typeof attrs !== "object" || attrs === null) return null;
  const raw = (attrs as Record<string, unknown>)["actions"];
  if (!Array.isArray(raw)) return null;
  const out: { label: string; url: string }[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const label = (item as Record<string, unknown>)["label"];
    const url = (item as Record<string, unknown>)["url"];
    if (typeof label === "string" && typeof url === "string") out.push({ label, url });
    if (out.length >= 2) break;
  }
  return out.length ? out : null;
}

export function toRow(row: RawRow, viewerId: string) {
  // A departed author is nobody, so `mine` is false and the two controls that
  // belong to an author are off for everyone. That is OFF-3 working rather
  // than a gap: nobody may delete what they did not write, and the person who
  // did is gone. Archive is the co-owned action and still applies, so a thread
  // can be cleared without destroying what somebody left in it.
  const mine = row.account_id !== null && row.account_id === viewerId;
  // Author, or nobody current. OFF-3 gives delete to the author so a shared
  // thread cannot become a place where somebody else destroys what you put in;
  // once the author is gone there is nothing left to protect and the rule only
  // produces leftovers no member can clear.
  const ownerless = row.account_id === null || !row.authorIsMember;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    // Where it came from, when it came from a page. The clients turn this into
    // the thing that opens; until 0041 it lived in `body` by convention and was
    // missing from two thirds of the link rows in production.
    url: row.url,
    // An address, never bytes. The client loads it from the site, which is the
    // thing the privacy policy says out loud (section 5, looking things up).
    imageUrl: row.image_url,
    // 020. Filled in by `withPhotos` after the page is read, one query for
    // the page rather than a join on every select that shapes a row.
    photo: null as FileOnRow | null,
    createdAt: row.created_at.toISOString(),
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
    doneAt: row.done_at ? row.done_at.toISOString() : null,
    dueAt: row.due_at ? row.due_at.toISOString() : null,
    occursAt: row.occurs_at ? row.occurs_at.toISOString() : null,
    occursEndAt: row.occurs_end_at ? row.occurs_end_at.toISOString() : null,
    rrule: row.rrule,
    onCalendar: row.source_ref !== null,
    isReminder: row.is_reminder,
    // 042. Filled in by `withPhotos`, with the labels.
    reminders: null as "on" | "off" | null,
    priority: row.priority,
    priorityPinned: row.priority_pinned,
    // Derived rather than sending `attrs` whole, exactly as `placeId` is: the
    // client needs to know an occurrence repeats and has no business with the
    // rest of what a calendar sync wrote.
    seriesRef: seriesRefOf(row.attrs),
    allDay: allDayOf(row.attrs),
    // 044. Up to two links the PDF carried, offered beside it. A tap shows the
    // host and opens in the platform browser; the client computes the host from
    // the url, and offload opens nothing.
    actions: actionsOf(row.attrs),
    // 030. Where it is and whether it is an area, and nothing Google named:
    // its name and address are neither kept nor sent. The coordinates are null
    // once they age past thirty days, until a map asks for them again.
    place: row.place_id
      ? {
          id: row.place_id,
          lat: row.placeLat,
          lng: row.placeLng,
          approximate: row.placeApproximate === true,
        }
      : null,
    // An event's own words for where it is. A link's location is the name its
    // page gave, a lookup key, and is not shown.
    location: row.type === "event" ? row.location : null,
    author: {
      accountId: row.account_id,
      displayName: row.authorName ?? "Someone",
      isYou: mine,
    },
    // Both actions change who can see something, so both are the author's,
    // or everybody's once the author is gone.
    canDelete: mine || ownerless,
    canMove: mine || ownerless,
    filingAt: row.filing_at ? row.filing_at.toISOString() : null,
  };
}

// ============================================================== the writes
//
// Exported and session-free, with the routes below as thin wrappers. Better
// Auth signs its session cookie, so a test cannot reach a session-scoped route
// by pretending, and the interesting behaviour here is the transaction: which
// counts move, what `previous` actually holds, what a second call does. Same
// shape as `takeDump` and `undoTurn` in dumps.ts.

/** What an edit returns and what Undo sends back: the nine fields as they
 *  were, so one request restores all of them (023 AC-25). */
export interface ContentSnapshot {
  title: string;
  body: string | null;
  dueAt: string | null;
  occursAt: string | null;
  occursEndAt: string | null;
  allDay: boolean;
  rrule: string | null;
  isReminder: boolean;
  /** 025. The row's labels before the write, in the thread's label order. */
  labels: string[];
  /** 042. The author's Remind me before the write; null for anybody else. */
  reminders: "on" | "off" | null;
}

/** The nine fields a sheet may write. Absent leaves a field alone and null
 *  clears it, which is the one distinction the tool layer cannot make. */
export interface ContentPatch {
  title?: string | undefined;
  body?: string | null | undefined;
  /** `YYYY-MM-DD` for a day, an ISO instant for a time, a wall time read in
   *  the account's zone. Null clears. */
  dueAt?: string | null | undefined;
  /** Null clears the occurrence, its end and the rule with it. */
  occursAt?: string | null | undefined;
  occursEndAt?: string | null | undefined;
  /** Says which the value is when it could be read either way; true with an
   *  instant, or false with a bare day, is refused. */
  allDay?: boolean | undefined;
  /** The grammar's own string; stored canonical; null clears. */
  rrule?: string | null | undefined;
  /** The flag. No screen draws a way to turn it on: the sheet's switch is
   *  drawn only while it is on, so the only true that arrives is Undo putting
   *  back what offload decided. */
  isReminder?: boolean | undefined;
  /** 025. The row's labels as a full set; absent leaves them alone. */
  labels?: string[] | undefined;
  /** 042. The author's Remind me. Off stops every reminder for good and
   *  turns `isReminder` off with it; on is the switch or Undo putting it
   *  back. Anybody else is refused as for a row that does not exist. */
  reminders?: "on" | "off" | null | undefined;
}

/** Edit. Co-owned: anybody in the thread may fix a title offload got wrong,
 *  which is most of what the page is for, and since 023 may set, move or
 *  clear its date the same way. Clear is an edit, not a delete. A row on a
 *  calendar keeps its time, which is Google's: `on_calendar`. */
export async function editContent(
  accountId: string,
  contentId: string,
  patch: ContentPatch,
): Promise<ContentSnapshot> {
  return db.transaction().execute(async (trx) => {
    // Inside the transaction, so a member taken out between the check and the
    // write cannot land one: 022 made removal an ordinary action.
    const ref = await requireReadable(accountId, contentId, trx);
    const before = await trx
      .selectFrom("content")
      .select(["title", "body", "type", "due_at", "occurs_at", "occurs_end_at", "rrule", "is_reminder", "attrs", "source_ref", "account_id"])
      .where("id", "=", ref.id)
      .executeTakeFirstOrThrow();
    const wasAllDay = allDayOf(before.attrs);
    // The snapshot is what Undo sends back whole, so it has to be a body this
    // route accepts: a day is carried as a day, not as the noon instant it is
    // stored at, or the all-day check below refuses its own row.
    const carry = (held: Date | null): string | null =>
      held ? (wasAllDay ? utcDay(held) : held.toISOString()) : null;
    const snapshot: ContentSnapshot = {
      title: before.title,
      body: before.body,
      dueAt: carry(before.due_at),
      occursAt: carry(before.occurs_at),
      occursEndAt: carry(before.occurs_end_at),
      allDay: wasAllDay,
      rrule: before.rrule,
      isReminder: before.is_reminder,
      labels: (await contentLabelsFor([ref.id], trx)).get(ref.id) ?? [],
      reminders: before.account_id === accountId ? await remindersOfRow(trx, accountId, ref.id, before.is_reminder) : null,
    };
    // 042. Asking to be reminded is the author's: anybody may turn it off,
    // only they may turn it on, which is what Undo of their stop does.
    if (patch.isReminder === true && !before.is_reminder && before.account_id !== accountId) throw new NotYours();
    if (patch.reminders !== undefined && patch.reminders !== null) {
      if (!(await setReminders(trx, { accountId, of: "content", id: ref.id, on: patch.reminders === "on" }))) throw new NotYours();
    }

    const set: Record<string, unknown> = {
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.body === undefined ? {} : { body: patch.body }),
      ...(patch.isReminder === undefined ? {} : { is_reminder: patch.isReminder }),
      // 042. A stop is the author's way out of every reminder, the asked one too.
      ...(patch.reminders === "off" && patch.isReminder === undefined ? { is_reminder: false } : {}),
      updated_at: sql`now()`,
    };

    const zone = await zoneOf(accountId, trx);
    const read = (value: string | null | undefined, held: Date | null): Date | null => {
      if (value === undefined) return held;
      if (value === null) return null;
      const at = parseWhen(value, zone);
      if (!at || !plausible(at)) throw new Refused("bad_date");
      return at;
    };
    const dueAt = read(patch.dueAt, before.due_at);
    const occursAt = read(patch.occursAt, before.occurs_at);
    // Clearing the occurrence clears its end: an end with no start is a span
    // from nowhere.
    const occursEndAt = patch.occursAt === null ? null : read(patch.occursEndAt, before.occurs_end_at);
    if (occursEndAt && !occursAt) throw new Refused("bad_date");
    if (occursEndAt && occursAt && occursEndAt < occursAt) throw new Refused("bad_date");

    // Whether the row is a day or a time: said outright, else read off the
    // value the type's column was given, else left as it was.
    const given = before.type === "event" ? patch.occursAt : patch.dueAt;
    let allDay = wasAllDay;
    if (patch.allDay !== undefined) {
      if (given && patch.allDay !== isBareDate(given)) throw new Refused("bad_date");
      allDay = patch.allDay;
    } else if (given) {
      allDay = isBareDate(given);
    }

    // A rule anchors on the type's column as it stands after this edit.
    // Clearing the anchor clears the rule; a rule given with nothing to
    // anchor on, or outside the grammar, is refused by name.
    const anchor = before.type === "event" ? occursAt : dueAt;
    let rule = before.rrule;
    if (patch.rrule !== undefined) {
      if (patch.rrule === null) rule = null;
      else {
        const parsed = parseRule(patch.rrule);
        if (!parsed.ok || anchor === null) throw new Refused("bad_rule");
        rule = formatRule(parsed.rule);
      }
    }
    if (anchor === null) rule = null;

    // A date change is a value that differs from what the row holds, not a
    // field that was merely sent: Undo sends every field back, and a title
    // put back on a calendar-backed row is not a date change.
    const same = (a: Date | null, b: Date | null): boolean => (a?.getTime() ?? null) === (b?.getTime() ?? null);
    const dated =
      !same(dueAt, before.due_at) ||
      !same(occursAt, before.occurs_at) ||
      !same(occursEndAt, before.occurs_end_at) ||
      allDay !== wasAllDay ||
      rule !== before.rrule;
    if (dated && before.source_ref) throw new Refused("on_calendar");

    if (dated) {
      Object.assign(set, {
        due_at: dueAt,
        occurs_at: occursAt,
        occurs_end_at: occursEndAt,
        rrule: rule,
        attrs: sql`attrs || ${JSON.stringify({ all_day: allDay })}::jsonb`,
      });
    }

    // 025. Labels only, and the row itself is not rewritten: `updated_at` is
    // what the nightly sort and the embedder read as the row having changed,
    // and a label is not a word of it.
    const onlyLabels = Object.keys(patch).every((key) => key === "labels" || (patch as Record<string, unknown>)[key] === undefined);
    // 042. A switch flipped alone is not an edit of the row's words or date.
    const onlySwitch = Object.keys(patch).every(
      (key) => key === "reminders" || key === "isReminder" || (patch as Record<string, unknown>)[key] === undefined,
    );
    if (patch.labels !== undefined) {
      await setRowLabels(trx, { accountId, via: "person" }, { kind: "content", id: ref.id, threadId: ref.threadId }, patch.labels);
    }
    if (onlySwitch) {
      // 042. A switch flipped alone is not an edit: the flag, and nothing
      // that says the row or its thread changed.
      if (set["is_reminder"] !== undefined) {
        await trx.updateTable("content").set({ is_reminder: set["is_reminder"] as boolean }).where("id", "=", ref.id).execute();
      }
    } else if (!onlyLabels) {
      await trx.updateTable("content").set(set).where("id", "=", ref.id).execute();
      await touchThread(ref.threadId, trx);
      // 042. Whose date and whose words these are, for the reminders they make.
      const worded = (patch.title !== undefined && patch.title !== before.title) || (patch.body !== undefined && patch.body !== before.body);
      await dateSet(trx, { contentId: ref.id, actorId: accountId, dated, worded });
    }
    return snapshot;
  });
}

/** Archive and restore, the co-owned soft action.
 *
 *  Restore clears a pending destruction as well as an archive, so one control
 *  brings back an archived row and an undone delete alike, and the count it
 *  decremented comes back with it.
 *
 *  **`content_count` is what is live in the thread**, since 2026-09-16: rows
 *  neither archived nor deleted. Archiving left it alone until then, on the
 *  grounds that the row was still there, and My threads said 9 about a thread
 *  whose own page said 7 next to an "2 archived" row. The product owner's rule
 *  is that archived rows do not count towards a total, and this is the total
 *  the thread row shows. So archive decrements, and restore puts back exactly
 *  one, whether the row was archived, deleted or both. */
export async function setArchived(
  accountId: string,
  contentId: string,
  archived: boolean,
  // 2026-10-17. A person putting a row back keeps it out of the hourly pass
  // over what has passed; offload's own Undo of a calendar removal does not.
  options: { byPerson?: boolean } = {},
): Promise<void> {
  await db.transaction().execute((trx) => setArchivedIn(trx, accountId, contentId, archived, options));
}

/** The archive itself, inside a transaction the caller owns. The model's
 *  archive tool runs it inside the turn's, so both paths take the same steps. */
export async function setArchivedIn(
  trx: Transaction<Database>,
  accountId: string,
  contentId: string,
  archived: boolean,
  { byPerson = true }: { byPerson?: boolean } = {},
): Promise<void> {
  // Restore is the Undo for delete as well as for archive, so it has to be able
  // to find a row inside its eight second window. Archive must not: archiving
  // something already on its way out is meaningless.
  const ref = await requireReadable(accountId, contentId, trx, !archived);
  const before = await trx
    .selectFrom("content")
    .select(["deleted_at", "archived_at", "derived_from_message_id"])
    .where("id", "=", ref.id)
    .executeTakeFirstOrThrow();

  // Undoing a delete is the author's, like the delete was. Un-archiving is
  // co-owned, and this route serves both, so the row says which it is: a
  // deleted row put back by somebody who did not write it is somebody
  // else's contribution restored against its author's decision, the
  // inverse of OFF-3 (security review 2026-09-22, M1).
  if (!archived && before.deleted_at !== null && ref.authorId !== accountId && !unowned(ref)) {
    throw new NotYours();
  }
  // Counted iff live. Both transitions read this once so a second archive of
  // an archived row, or a restore of one already back, moves nothing.
  const wasLive = before.deleted_at === null && before.archived_at === null;

  await trx
    .updateTable("content")
    .set({
      archived_at: archived ? sql`now()` : null,
      ...(archived ? {} : { deleted_at: null, purge_after: null }),
      // 2026-10-17. Put back by a person, so the hourly pass over what has
      // passed leaves it where they put it.
      ...(!archived && byPerson && before.archived_at !== null ? { attrs: sql`coalesce(attrs, '{}'::jsonb) || '{"put_back": true}'::jsonb` } : {}),
      updated_at: sql`now()`,
    })
    .where("id", "=", ref.id)
    .execute();
  // 036. What the delete took comes back with the row: its files, and the
  // message it came from with that message's own files and reply.
  if (!archived && before.deleted_at !== null) {
    await restoreFilesOfRow(trx, ref.id, before.deleted_at);
    await restoreSourceOfRow(trx, before.derived_from_message_id);
  }

  // Restoring puts the count back. Without this an undo restores the row and
  // leaves the header saying one fewer, which is AC-8 broken by the undo path
  // rather than by the delete.
  if (archived && wasLive) {
    await trx
      .updateTable("threads")
      .set({ content_count: sql`greatest(content_count - 1, 0)` })
      .where("id", "=", ref.threadId)
      .execute();
  } else if (!archived && !wasLive) {
    await trx
      .updateTable("threads")
      .set({ content_count: sql`content_count + 1` })
      .where("id", "=", ref.threadId)
      .execute();
  }

  await touchThread(ref.threadId, trx);
  await holdFloor(trx, { contentId: ref.id });
}

/** Move. The author's, like delete, because both change who can see something. */
export async function moveContent(
  accountId: string,
  contentId: string,
  destination: string,
): Promise<{ threadId: string }> {
  return db.transaction().execute((trx) => moveContentIn(trx, accountId, contentId, destination));
}

/** The move itself, inside a transaction the caller owns. 018's thread answer
 *  runs it inside the answer's own transaction, and Undo runs it back. */
export async function moveContentIn(
  trx: Transaction<Database>,
  accountId: string,
  contentId: string,
  destination: string,
): Promise<{ threadId: string }> {
  const ref = await requireAuthor(accountId, contentId, trx);
  await requireMember(accountId, destination, trx);

  if (destination === ref.threadId) return { threadId: ref.threadId };

  const moved = await trx
    .updateTable("content")
    .set({ thread_id: destination, updated_at: sql`now()` })
    .where("id", "=", ref.id)
    .returning("archived_at")
    .executeTakeFirstOrThrow();

  // Both counts, in the same transaction as the write that changes them, per
  // 001. A count maintained anywhere else drifts. An archived row is in
  // neither count, so moving it moves nothing.
  if (moved.archived_at === null) {
    await trx
      .updateTable("threads")
      .set({ content_count: sql`greatest(content_count - 1, 0)` })
      .where("id", "=", ref.threadId)
      .execute();
    await trx
      .updateTable("threads")
      .set({ content_count: sql`content_count + 1` })
      .where("id", "=", destination)
      .execute();
  }

  // 020. A row carrying a picture takes it along: the destination gets a
  // wrap, and the origin loses its own once nothing there links the blob.
  // The object itself is never touched.
  const carried = await trx
    .selectFrom("content_blobs")
    .select("blob_id")
    .where("content_id", "=", ref.id)
    .execute();
  for (const { blob_id } of carried) {
    await ensureThreadWrap(trx, blob_id, destination);
    await dropThreadWrapIfUnused(trx, blob_id, ref.threadId);
  }

  await touchThread(ref.threadId, trx);
  await touchThread(destination, trx);
  // 028. A proposal that just lost a thing may be below two.
  await holdFloor(trx, { contentId: ref.id });

  return { threadId: ref.threadId };
}

/** Delete. Author only, soft, on 004's mechanism exactly. */
export async function deleteContent(
  accountId: string,
  contentId: string,
): Promise<boolean> {
  // Sees a row already inside its window, so a second call reports "nothing to
  // do" rather than "no such thing". A repeated delete is a double click, not
  // an error.
  const ref = await requireAuthor(accountId, contentId, db, true);
  return db.transaction().execute(async (trx) => {
    const result = await trx
      .updateTable("content")
      .set({
        deleted_at: sql`now()`,
        purge_after: sql`now() + interval '8 seconds'`,
        updated_at: sql`now()`,
      })
      .where("id", "=", ref.id)
      .where("deleted_at", "is", null)
      .returning(["archived_at", "deleted_at", "purge_after", "derived_from_message_id"])
      .executeTakeFirst();

    if (!result) return false;

    // 036, and the owner 2026-10-05. What the row carries goes with it, on the
    // row's clock, and so does the message it came from once nothing else
    // alive came from that message (takes.ts). The purge destroys them.
    const clock = { deletedAt: result.deleted_at!, purgeAfter: result.purge_after! };
    await takeFilesOfRow(trx, ref.id, accountId, clock);
    await takeSourceOfRow(trx, { messageId: result.derived_from_message_id, threadId: ref.threadId }, accountId, clock);

    // An archived row already left the count when it was archived.
    if (result.archived_at === null) {
      await trx
        .updateTable("threads")
        .set({ content_count: sql`greatest(content_count - 1, 0)` })
        .where("id", "=", ref.threadId)
        .execute();
    }
    await touchThread(ref.threadId, trx);
    await holdFloor(trx, { contentId: ref.id });

    // Enqueued by the delete rather than left to a timer, exactly as 004's undo
    // does. A timer that stops running leaves content the person believes is
    // gone, and nothing notices.
    await enqueue({
      kind: "content.purge",
      accountId,
      payload: {},
      priority: PRIORITY.background,
      runAfterSeconds: 10,
      tx: trx,
    });

    return true;
  });
}

/** 044. Remove a wrong action from a PDF's row, and put it back. Author only
 *  (OFF-3), as delete and move are: a label the model mislabelled is the
 *  author's to correct, not a co-owned edit. Provenance-safe: forget moves the
 *  matching {label, url} from `attrs.actions` to `attrs.actions_removed`, and
 *  restore moves it back only when it is in `actions_removed`, so a client can
 *  never add a url the PDF did not carry. `actions_removed` never serves to
 *  anyone (`actionsOf` reads `attrs.actions`). Read-once (041) means no later
 *  turn re-adds a forgotten action, so removal is durable with no marker. */
type ActionList = { label: string; url: string }[];

function splitActions(attrs: unknown): { actions: ActionList; removed: ActionList } {
  const a = (attrs && typeof attrs === "object" ? attrs : {}) as Record<string, unknown>;
  const list = (v: unknown): ActionList =>
    Array.isArray(v)
      ? v
          .filter(
            (x): x is { label: string; url: string } =>
              typeof x === "object" &&
              x !== null &&
              typeof (x as Record<string, unknown>).label === "string" &&
              typeof (x as Record<string, unknown>).url === "string"
          )
          .map((x) => ({ label: x.label, url: x.url }))
      : [];
  return { actions: list(a["actions"]), removed: list(a["actions_removed"]) };
}

async function writeActions(
  trx: import("../threads/access.js").Executor,
  id: string,
  actions: ActionList,
  removed: ActionList
): Promise<void> {
  await trx
    .updateTable("content")
    .set({
      attrs: sql`attrs || ${JSON.stringify({ actions, actions_removed: removed })}::jsonb`,
      updated_at: sql`now()`,
    })
    .where("id", "=", id)
    .execute();
}

export async function forgetAction(accountId: string, contentId: string, url: string): Promise<void> {
  const ref = await requireAuthor(accountId, contentId);
  await db.transaction().execute(async (trx) => {
    const row = await trx.selectFrom("content").select("attrs").where("id", "=", ref.id).executeTakeFirstOrThrow();
    const { actions, removed } = splitActions(row.attrs);
    const match = actions.find((a) => a.url === url);
    if (!match) return;
    await writeActions(
      trx,
      ref.id,
      actions.filter((a) => a.url !== url),
      removed.some((a) => a.url === url) ? removed : [...removed, match]
    );
    await touchThread(ref.threadId, trx);
  });
}

export async function restoreAction(accountId: string, contentId: string, url: string): Promise<void> {
  const ref = await requireAuthor(accountId, contentId);
  await db.transaction().execute(async (trx) => {
    const row = await trx.selectFrom("content").select("attrs").where("id", "=", ref.id).executeTakeFirstOrThrow();
    const { actions, removed } = splitActions(row.attrs);
    const match = removed.find((a) => a.url === url);
    // Only a link the PDF carried (so one that was forgotten) can come back,
    // and never past two.
    if (!match || actions.length >= 2 || actions.some((a) => a.url === url)) return;
    await writeActions(trx, ref.id, [...actions, match], removed.filter((a) => a.url !== url));
    await touchThread(ref.threadId, trx);
  });
}

/** Tick something off, or put it back. Co-owned: a thread's contents belong to
 *  everybody in it, and neither direction destroys anything. */
export async function completeContent(
  accountId: string,
  contentId: string,
  done: boolean,
): Promise<{ done: boolean }> {
  const ref = await requireReadable(accountId, contentId);
  const before = await db
    .selectFrom("content")
    .select("done_at")
    .where("id", "=", ref.id)
    .executeTakeFirstOrThrow();

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("content")
      .set({ done_at: done ? sql`now()` : null, updated_at: sql`now()` })
      .where("id", "=", ref.id)
      .execute();
    await touchThread(ref.threadId, trx);
    await holdFloor(trx, { contentId: ref.id });
  });

  return { done: before.done_at !== null };
}

/** Change a priority.
 *
 *  **A person doing this pins it**, which is what stops the planner overwriting
 *  it later. The flag is set by this action and never by the model, so "somebody
 *  decided" and "offload guessed" stay distinguishable forever. */
export async function reprioritise(
  accountId: string,
  contentId: string,
  priority: number,
): Promise<{ priority: number; priorityPinned: boolean }> {
  const ref = await requireReadable(accountId, contentId);
  const before = await db
    .selectFrom("content")
    .select(["priority", "priority_pinned"])
    .where("id", "=", ref.id)
    .executeTakeFirstOrThrow();

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("content")
      .set({ priority, priority_pinned: true, updated_at: sql`now()` })
      .where("id", "=", ref.id)
      .execute();
    await touchThread(ref.threadId, trx);
  });

  return { priority: before.priority, priorityPinned: before.priority_pinned };
}

/** How a thread wants to look.
 *
 *  Co-owned, like the name: a shared thread's arrangement belongs to everybody
 *  in it. Merged rather than replaced, so setting the grouping does not silently
 *  clear the widget order.
 *
 *  **Except the fold, which is the member's.** Which finished rows you have
 *  put away is about what you have read, not about how the thread is arranged,
 *  so it lives on the membership row and one person folding a shared list
 *  folds it for nobody else. */
export async function setPreference(
  accountId: string,
  threadId: string,
  patch: {
    widgets?: string[] | null;
    hideDone?: boolean | null;
  },
): Promise<ThreadPreference> {
  await requireMember(accountId, threadId);

  return db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom("threads")
      .select("attrs")
      .where("id", "=", threadId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!row) throw new NotYours();

    const member = await trx
      .selectFrom("thread_members")
      .select("hide_done")
      .where("thread_id", "=", threadId)
      .where("account_id", "=", accountId)
      .executeTakeFirstOrThrow();

    const before = { ...readPreference(row.attrs), ...(member.hide_done ? { hideDone: true } : {}) };

    if (patch.widgets !== undefined) {
      const merged = readPreference({ widgets: patch.widgets });
      await trx
        .updateTable("threads")
        .set({ attrs: JSON.stringify(merged), updated_at: sql`now()` })
        .where("id", "=", threadId)
        .execute();
    }

    if (patch.hideDone !== undefined) {
      // No `updated_at` on the thread: nothing about the thread moved.
      await trx
        .updateTable("thread_members")
        .set({ hide_done: patch.hideDone === true })
        .where("thread_id", "=", threadId)
        .where("account_id", "=", accountId)
        .execute();
    }

    return before;
  });
}

/** The thread's arrangement and the viewer's own fold, as one object. The
 *  clients read one preference; where each field lives is the server's. */
async function preferenceOf(accountId: string, threadId: string): Promise<ThreadPreference> {
  const row = await db
    .selectFrom("threads")
    .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
    .select(["threads.attrs", "thread_members.hide_done"])
    .where("threads.id", "=", threadId)
    .where("thread_members.account_id", "=", accountId)
    .executeTakeFirstOrThrow();
  return { ...readPreference(row.attrs), ...(row.hide_done ? { hideDone: true } : {}) };
}

export interface ThreadMark {
  name: string;
  icon: string;
  hue: number;
  iconSetBy: "offload" | "person";
}

/** What a layout switch did, beside the name/icon `previous`, so one Undo
 *  sends the layout back and removes or restores the labels it moved. */
export interface LayoutChange {
  previous: { layout: Layout; layoutSetBy: "offload" | "person" };
  made: string[];
  dropped: string[];
}

/** A switch that would need more labels than the thread has room for: refused
 *  whole, with how many it needs and how many are free (decision 17). */
export class LayoutLabelsFull extends Error {
  constructor(
    readonly needed: number,
    readonly free: number,
  ) {
    super("layout_labels_full");
  }
}

/** 037. Change a thread's name, icon and hue, any of them, in one write.
 *  Co-owned: a shared thread's name and look belong to everybody in it, and
 *  none of this touches content.
 *
 *  Whose pick the icon is follows from what changed. An icon or a hue that
 *  differs from the row's is a person's pick from then on. A name alone, while
 *  the pick is still offload's, picks the icon again from the word list, and
 *  keeps what is there when the new name matches nothing: the model may have
 *  named that icon, and a rename is not a reason to throw it away. The hue is
 *  never picked again. `iconSetBy` is what Undo sends back, and it counts only
 *  when the pick itself moves: alone it would hand a person's pick back to
 *  offload with nothing anybody can see changing.
 *
 *  Given a transaction it runs inside it, which is how the model's rename
 *  calls it: a second connection locking a row the first may hold is a wait
 *  Postgres cannot see as a deadlock. */
export async function editThread(
  accountId: string,
  threadId: string,
  input: Partial<ThreadMark> & {
    /** The layout to switch to, in the same write as name, icon and hue. */
    layout?: Layout;
    /** Accepted only alongside `undoLabels`: the layout's pick to put back. */
    layoutSetBy?: "offload" | "person";
    /** The Undo of a switch: restore the labels it dropped, remove the ones it
     *  made that are still empty. */
    undoLabels?: { remove: string[]; restore: string[] };
  },
  within?: import("../threads/access.js").Executor,
): Promise<{ thread: ThreadMark; previous: ThreadMark; layout?: LayoutChange }> {

  // Read then write, in one transaction. `returning` on an UPDATE gives the NEW
  // value in Postgres, so returning it as `previous` would hand the client an
  // Undo that restores what it just set. The kind of bug that looks correct
  // and does nothing.
  const write = async (trx: import("../threads/access.js").Executor) => {
    await requireMember(accountId, threadId, trx);
    const current = await trx
      .selectFrom("threads")
      .select(["name", "icon", "hue", "icon_set_by", "layout", "layout_set_by"])
      .where("id", "=", threadId)
      .where("deleted_at", "is", null)
      .forUpdate()
      .executeTakeFirst();
    if (!current) return null;

    const previous: ThreadMark = { name: current.name, icon: current.icon, hue: current.hue, iconSetBy: current.icon_set_by };
    const thread: ThreadMark = {
      name: input.name ?? previous.name,
      icon: input.icon ?? previous.icon,
      hue: input.hue ?? previous.hue,
      iconSetBy: previous.iconSetBy,
    };
    const moved = thread.icon !== previous.icon || thread.hue !== previous.hue;
    if (moved) thread.iconSetBy = input.iconSetBy ?? "person";
    else if (previous.iconSetBy === "offload" && thread.name !== previous.name) thread.icon = pickThreadIcon(thread.name) ?? previous.icon;

    await trx
      .updateTable("threads")
      .set({ name: thread.name, icon: thread.icon, hue: thread.hue, icon_set_by: thread.iconSetBy, updated_at: sql`now()` })
      .where("id", "=", threadId)
      .execute();

    const layout = await switchLayout(trx, accountId, threadId, current.layout, current.layout_set_by, input);
    return { thread, previous, ...(layout ? { layout } : {}) };
  };
  const result = within ? await write(within) : await db.transaction().execute(write);
  if (!result) throw new NotYours();
  return result;
}

/** The layout half of a thread edit, inside the edit's transaction. Returns the
 *  change for the client's one Undo, or undefined when the layout did not move.
 *
 *  A switch makes the labels the new layout needs and the thread lacks, and
 *  deletes the old layout's empty ones the new one does not use, both as the
 *  person, in one write. A thread with no room for the makes is refused whole
 *  (decision 17). The Undo sends it back the other way: restore the dropped,
 *  remove the made that are still empty, and set the layout and its pick back. */
async function switchLayout(
  trx: import("../threads/access.js").Executor,
  accountId: string,
  threadId: string,
  fromLayout: Layout,
  fromSetBy: "offload" | "person",
  input: { layout?: Layout; layoutSetBy?: "offload" | "person"; undoLabels?: { remove: string[]; restore: string[] } },
): Promise<LayoutChange | undefined> {
  const actor: Actor = { accountId, via: "person" };

  if (input.undoLabels) {
    for (const id of input.undoLabels.restore) {
      // A label another member re-created, or one past its window, is already
      // back or gone: the Undo of a switch is not where that is an error.
      try {
        await restoreLabel(trx, actor, id);
      } catch (error) {
        if (!(error instanceof LabelRefused)) throw error;
      }
    }
    for (const id of input.undoLabels.remove) {
      const live = await labelsOfThread(threadId, trx);
      const made = live.find((label) => label.id === id);
      // Only while it is still empty: a row filed under it since the switch is
      // somebody using the label, and Undo does not take that away.
      if (made && made.count === 0) await deleteLabel(trx, actor, id);
    }
    await trx
      .updateTable("threads")
      .set({
        layout: input.layout ?? fromLayout,
        layout_set_by: input.layoutSetBy ?? fromSetBy,
        layout_changed_at: sql`now()`,
        layout_changed_by: accountId,
        layout_suggestion: null,
        updated_at: sql`now()`,
      })
      .where("id", "=", threadId)
      .execute();
    return undefined;
  }

  if (!input.layout || input.layout === fromLayout) return undefined;
  const to = input.layout;
  const live = await labelsOfThread(threadId, trx);
  const make = labelsToMake(to, live);
  const drop = labelsToDrop(fromLayout, to, live);
  const free = LABEL_LIMIT - (live.length - drop.length);
  if (make.length > free) throw new LayoutLabelsFull(make.length, free);

  for (const id of drop) await deleteLabel(trx, actor, id);
  const made: string[] = [];
  for (const name of make) made.push((await createLabel(trx, actor, threadId, { name })).id);

  await trx
    .updateTable("threads")
    .set({
      layout: to,
      layout_set_by: "person",
      layout_changed_at: sql`now()`,
      layout_changed_by: accountId,
      layout_suggestion: null,
      updated_at: sql`now()`,
    })
    .where("id", "=", threadId)
    .execute();

  return { previous: { layout: fromLayout, layoutSetBy: fromSetBy }, made, dropped: drop };
}

/** The one-time heads-up a member sees after somebody else switched the layout
 *  (decision 13): null for the member who made the change, and null once this
 *  member has seen the layout as it stands. */
async function layoutChangeFor(
  thread: {
    layout: Layout;
    layout_changed_at: Date | string | null;
    layout_changed_by: string | null;
    layout_seen_at: Date | string | null;
  },
  viewerId: string,
): Promise<{ by: { accountId: string; displayName: string }; layout: Layout; at: string } | null> {
  if (!thread.layout_changed_by || !thread.layout_changed_at) return null;
  if (thread.layout_changed_by === viewerId) return null;
  const changedAt = new Date(thread.layout_changed_at);
  if (thread.layout_seen_at && new Date(thread.layout_seen_at) >= changedAt) return null;
  const who = await db
    .selectFrom("accounts")
    .select("display_name")
    .where("id", "=", thread.layout_changed_by)
    .executeTakeFirst();
  return {
    by: { accountId: thread.layout_changed_by, displayName: who?.display_name ?? "Someone" },
    layout: thread.layout,
    at: changedAt.toISOString(),
  };
}

/** Leaving a thread, which is also how a thread dies.
 *
 *  **There is no delete-somebody-else's-thread, because there is no owner.**
 *  OFF-3: a thread resolves to its member set. This removes the caller and
 *  nobody else, and the thread goes when the last member is out. Taking
 *  another member out is 022's `takeOut`, confirmed on a sheet, and is the
 *  one other way a membership ends.
 *
 *  On a thread nobody else is in, those are the same action, which is why one
 *  endpoint serves both and the screen can call it Delete.
 *
 *  Soft, with `purge_after`, so the eight seconds are real and the destroying
 *  is done by the purge job like everything else (DATA-1).
 */
export async function deleteThread(
  accountId: string,
  threadId: string,
): Promise<{ left: boolean; deleted: boolean }> {
  return db.transaction().execute(async (trx) => {
    await requireMember(accountId, threadId, trx);

    // Every dump with no obvious home lands in the default thread, so an
    // account without one has nowhere to put anything (004 AC-2). Refused
    // rather than handled, because there is no good answer to "where did my
    // dump go" afterwards.
    const account = await trx
      .selectFrom("accounts")
      .select("default_thread_id")
      .where("id", "=", accountId)
      .executeTakeFirst();
    if (account?.default_thread_id === threadId) throw new NotYours();

    // Marked, never deleted. The row is what restore puts back, and it is the
    // only row restore may put back: with the row gone, the Undo used to
    // insert a fresh membership for whoever called it, which let any account
    // holding a thread id join it (security review 2026-09-22, C1).
    await trx
      .updateTable("thread_members")
      .set({ state: "left", left_at: sql`now()`, responded_at: sql`now()` })
      .where("thread_id", "=", threadId)
      .where("account_id", "=", accountId)
      .where("state", "=", "accepted")
      .execute();
    // 019. A member leaving takes their calendar picks with them.
    await dropPicksOf(accountId, threadId, trx);
    // 024. And the Activity rows that named this thread's words, both ways.
    await purgeAbout({ viewerId: accountId, threadId }, trx);
    await purgeAbout({ aboutAccountId: accountId, threadId }, trx);
    // 022. And the shares they had waiting on it, which were theirs to make.
    await trx
      .updateTable("thread_members")
      .set({ state: "expired", responded_at: sql`now()`, preview: null })
      .where("thread_id", "=", threadId)
      .where("state", "=", "pending")
      .where("invited_by", "=", accountId)
      .execute();

    // 035. A copy that holds this thread is a way back in. It goes too.
    await destroyCopiesHolding(trx, threadId, accountId);

    const remaining = await trx
      .selectFrom("thread_members")
      .select(({ fn }) => fn.countAll<string>().as("n"))
      .where("thread_id", "=", threadId)
      .where("state", "=", "accepted")
      .executeTakeFirstOrThrow();

    if (Number(remaining.n) > 0) {
      // 022. Leaving revokes the key, as being taken out does. The eight
      // second restore puts the membership back and the next read's
      // `threadKey` wraps a fresh copy from another member's. The last
      // member's key stays below, for the purge job and the restore.
      // 035. Not before every member who stays holds a copy of their own.
      await passThreadKeyOn(trx, threadId, accountId);
      await trx.deleteFrom("thread_keys").where("thread_id", "=", threadId).where("account_id", "=", accountId).execute();
      return { left: true, deleted: false };
    }

    // 036. Held for the whole restore window, not eight seconds: a purge in
    // between took the thread while its Undo still answered yes, and since
    // 036 that would destroy its photos too.
    const dead = await trx
      .updateTable("threads")
      .set({
        deleted_at: sql`now()`,
        purge_after: sql`now() + interval '${sql.raw(RESTORE_WINDOW)}'`,
        updated_at: sql`now()`,
      })
      .where("id", "=", threadId)
      .where("deleted_at", "is", null)
      .returning(["deleted_at", "purge_after"])
      .executeTakeFirst();

    // 036. Everything in it goes with it, the files its rows carry and the
    // messages they came from (takes.ts), held for as long as Undo can still
    // bring the thread back, and the purge is asked for rather than left to
    // the day's run, so it all leaves once that has passed.
    if (dead) {
      const purgeAfter = new Date(dead.deleted_at!.getTime() + RESTORE_WINDOW_MS);
      await takeFilesOfThread(trx, threadId, { deletedAt: dead.deleted_at!, purgeAfter });
      await takeSourcesOfThread(trx, threadId, { deletedAt: dead.deleted_at!, purgeAfter });
      await enqueue({
        kind: "content.purge",
        accountId,
        payload: {},
        priority: PRIORITY.background,
        runAfterSeconds: RESTORE_WINDOW_MS / 1000 + 2,
        tx: trx,
      });
    }

    return { left: true, deleted: true };
  });
}

/** How long after leaving the Undo still works. The toast shows eight
 *  seconds; the rest is the tap at the end of it reaching the server. */
const RESTORE_WINDOW = "15 seconds";
const RESTORE_WINDOW_MS = 15_000;

/** Undo. Puts the membership back and, if the thread died with it, revives it.
 *
 *  **Only the caller's own `left` row, and only inside the window.** That is
 *  the whole authorisation: a stranger holding the id has no row to put back,
 *  a leaver past the window has one the window refuses, a member taken out
 *  has one in another state, and all three get the one refusal. Somebody
 *  already back, pressing Undo twice, is told yes rather than refused, since
 *  they can see the thread either way. The thread is revived only when a row
 *  was put back, so nobody un-deletes a thread they were never in. */
export async function restoreThread(
  accountId: string,
  threadId: string,
): Promise<boolean> {
  return db.transaction().execute(async (trx) => {
    const back = await trx
      .updateTable("thread_members")
      .set({ state: "accepted", left_at: null, responded_at: sql`now()` })
      .where("thread_id", "=", threadId)
      .where("account_id", "=", accountId)
      .where("state", "=", "left")
      .where("left_at", ">", sql<Date>`now() - interval '${sql.raw(RESTORE_WINDOW)}'`)
      .returning("id")
      .executeTakeFirst();

    if (!back) {
      if (await memberOf(accountId, threadId, trx)) return true;
      throw new NotYours();
    }

    const dead = await trx
      .selectFrom("threads")
      .select("deleted_at")
      .where("id", "=", threadId)
      .where("deleted_at", "is not", null)
      .executeTakeFirst();
    if (dead) {
      await trx
        .updateTable("threads")
        .set({ deleted_at: null, purge_after: null, updated_at: sql`now()` })
        .where("id", "=", threadId)
        .execute();
      // 036. And what went with it.
      await restoreFilesOfThread(trx, threadId, dead.deleted_at!);
      await restoreSourcesOfThread(trx, threadId);
    }

    return true;
  });
}

/** How long a typed row may claim to be filing before a client stops waiting.
 *
 *  Nothing sweeps the column. A worker that died leaves a timestamp behind, and
 *  the row is a perfectly good row either way, so the only thing that has to
 *  expire is the spinner. Generous against a model that takes five seconds. */
export const FILING_PATIENCE_MS = 2 * 60 * 1000;

/** The most a person can type into a section heading's +. */
export const QUICK_ADD_CHARS = 500;

/** What the + on a widget's heading starts the row as.
 *
 *  A guess, and a deliberately weak one: it decides which section the row
 *  appears in for the few seconds before offload has read it, so adding from To
 *  do puts it in To do rather than making it appear somewhere else and jump.
 *  offload may change it, and the change mark says so when it does.
 *
 *  **A section with no answer here writes a note instead**, which is what 014
 *  made of a typed sentence with nothing else to be. Files is the one that
 *  lands there: you cannot type a file, and the words somebody typed are a
 *  sentence about the thread.
 *
 *  **`timeline` is the day rail's own +, not a widget.** It went with 015 when
 *  the rail stopped being one and comes back here because the rail has a + of
 *  its own now, on the selected day's heading. */
const STARTS_AS: Record<string, "task" | "location" | "event"> = {
  todo: "task",
  timeline: "event",
};

/** 032. A line that is one web address and nothing else. Anything around it,
 *  "shelf https://...", is words, and stays words. */
// Case-sensitive, as the column's own check is: a capital the keyboard added
// keeps the line words rather than failing the write.
const ONE_ADDRESS = /^https?:\/\/\S+$/;

/** Write what somebody typed, exactly as they typed it.
 *
 *  **The row is the whole of it.** A + on a section is the person choosing the
 *  thread and the type, so there is nothing left for a model to decide, and
 *  since 032 none is asked: no job, no spinner, no budget, and the title never
 *  changes after they press enter. The one mechanical improvement offload used
 *  to make with a model is made here instead: a line that is one web address
 *  is a link.
 *
 *  **`day` is structured, and it is the only thing that is.** The rail's + knows
 *  which day heading it sits under, which is not something anybody said; it is
 *  where they pressed. It arrives as a real value and is final.
 */
export async function quickAdd(
  accountId: string,
  threadId: string,
  text: string,
  section: string,
  options: { day?: string | null | undefined } = {},
): Promise<{ id: string; kind: "content" | "note" }> {
  await requireMember(accountId, threadId);

  // `hasOwn`, because `section` is a string from the request and a plain
  // object answers `constructor` with a function.
  const startsAs = Object.hasOwn(STARTS_AS, section) ? STARTS_AS[section] : undefined;

  // A sentence with no widget type to start as is a note, in the person's own
  // words, exactly as before.
  if (!startsAs) {
    const note = await addNote({ threadId, accountId, text, origin: "stated" });
    await touchThread(threadId, db);
    await noteAddition(threadId, accountId);
    return { id: note.id, kind: "note" };
  }

  // A day with no time in it, noon UTC per `parseWhen`, so it reads back as
  // the same calendar day almost everywhere.
  const occursAt = options.day ? parseWhen(options.day) : null;
  const allDay = occursAt ? isBareDate(options.day) : false;
  const address = ONE_ADDRESS.test(text.trim()) ? text.trim() : null;

  return db.transaction().execute(async (trx) => {
    const row = await trx
      .insertInto("content")
      .values({
        account_id: accountId,
        thread_id: threadId,
        type: startsAs,
        title: address ?? text,
        source: "person",
        updated_at: sql`now()`,
        ...(address ? { url: address } : {}),
        ...(occursAt ? { occurs_at: occursAt } : {}),
        ...(allDay ? { attrs: { all_day: true } } : {}),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await trx
      .updateTable("threads")
      .set({ content_count: sql`content_count + 1` })
      .where("id", "=", threadId)
      .execute();
    await touchThread(threadId, trx);
    // 024. A row typed into a thread with other members reaches them, coalesced.
    await noteAddition(threadId, accountId, new Date(), trx);

    return { id: row.id, kind: "content" as const };
  });
}

export async function threadRoutes(app: App): Promise<void> {
  // ------------------------------------------------------------ My threads
  //
  // Two groups, neither stored: "older" is derived from activity, because a
  // thread does not become old, it stops being used. 028 retired Always on and
  // took the default thread out; what is in it is `loose`.
  app.get(
    "/v1/threads",
    { schema: { response: { 200: threadList, 401: unauthenticated } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      // Which thread is the account's default, so the list can say why one
      // row has no delete. Read here rather than inferred from the name: the
      // default is whatever `accounts.default_thread_id` points at, never a
      // thread called Miscellaneous, and 004 is explicit about that.
      const account = await db
        .selectFrom("accounts")
        .select("default_thread_id")
        .where("id", "=", accountId)
        .executeTakeFirst();

      const rows = await db
        .selectFrom("threads")
        .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
        .select([
          "threads.id as id",
          "threads.name as name",
          "threads.icon as icon",
          "threads.hue as hue",
          "threads.content_count as count",
          "threads.last_activity_at as lastActivityAt",
        ])
        .where("thread_members.account_id", "=", accountId)
        .where("thread_members.state", "=", "accepted")
        .where("threads.deleted_at", "is", null)
        .orderBy("threads.last_activity_at", "desc")
        .execute();

      // One extra query for every thread's members rather than one per thread.
      // A person is in tens of threads, so the N+1 here would be tens of round
      // trips to render one list.
      const ids = rows.map((row) => row.id);
      const memberRows = ids.length
        ? await db
            .selectFrom("thread_members")
            .innerJoin("accounts", "accounts.id", "thread_members.account_id")
            .select([
              "thread_members.thread_id as threadId",
              "accounts.display_name as displayName",
            ])
            .where("thread_members.thread_id", "in", ids)
            .where("thread_members.state", "=", "accepted")
            .where("thread_members.account_id", "!=", accountId)
            .where("accounts.deleted_at", "is", null)
            .execute()
        : [];

      const others = new Map<string, string[]>();
      for (const row of memberRows) {
        const list = others.get(row.threadId) ?? [];
        list.push(row.displayName ?? "Someone");
        others.set(row.threadId, list);
      }

      const stale = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;

      // What is open in each thread by kind, for its line: one grouped query
      // for the whole list. Live rows only, a task only while it is not
      // ticked off, and an event only while it has not ended (a repeating or
      // undated one always counts).
      const kinds = ids.length ? await openKinds(accountId, ids) : new Map<string, Record<string, number>>();

      type Row = z.infer<typeof threadRow>;
      const groups = { now: [] as Row[], older: [] as Row[] };
      for (const row of rows) {
        // 028. Never drawn as a thread: its contents are `loose`.
        if (row.id === account?.default_thread_id) continue;
        const shaped = {
          id: row.id,
          name: row.name,
          icon: DEFAULT_THREAD_ICON,
          threadIcon: row.icon,
          threadHue: row.hue,
          count: row.count,
          meta: threadLine(kinds.get(row.id) ?? {}, others.get(row.id) ?? []),
          isDefault: row.id === account?.default_thread_id,
          others: others.get(row.id) ?? [],
        };
        // 028. Time only. A slow thread sinks and comes back up when
        // something lands in it.
        if (row.lastActivityAt.getTime() < stale) groups.older.push(shaped);
        else groups.now.push(shaped);
      }

      return reply.send({
        invitations: await invitationsFor(accountId),
        groups: [
          { key: "now" as const, threads: groups.now },
          { key: "older" as const, threads: groups.older },
        ],
        loose: await looseSummary(accountId),
      });
    }
  );

  // ---------------------------------------------------------- one thread
  //
  // Four queries: membership, the thread, its members, its counts. It does not
  // become five because the thread holds more, and it must not become one per
  // widget when 007 draws them.
  //
  // 008 spends the fifth. 005 reserved it for a standing summary, which still
  // does not exist; notes took it instead, and both specs are amended rather
  // than left disagreeing about a number one of them enforces. 014 spends a
  // sixth on the two counts the section needs, which is one query for both and
  // not one per count.
  app.get(
    "/v1/threads/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: threadBundle, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const { id } = request.params;
        await requireMember(accountId, id);

        // The viewer's membership rides along, for the fold. It was checked a
        // line above, so the join is a column and not a second check.
        const thread = await db
          .selectFrom("threads")
          .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
          .select([
            "threads.id", "threads.name", "threads.icon", "threads.hue", "threads.icon_set_by", "threads.always_on", "threads.attrs",
            "threads.layout", "threads.layout_set_by", "threads.layout_suggestion", "threads.layout_suggestion_dismissed_at",
            "threads.layout_changed_at", "threads.layout_changed_by",
            "thread_members.hide_done", "thread_members.layout_seen_at",
          ])
          .where("threads.id", "=", id)
          .where("threads.deleted_at", "is", null)
          .where("thread_members.account_id", "=", accountId)
          .executeTakeFirst();
        if (!thread) throw new NotYours();

        // The heads-up another member sees once: non-null when somebody else
        // made the switch and this member has not seen it since.
        const layoutChange = await layoutChangeFor(thread, accountId);

        // One query, two counts. Postgres will not scan two partial indexes in
        // one statement, so this rides content_thread_idx, which covers both
        // states, with a filter per count.
        const counts = await db
          .selectFrom("content")
          .select([
            sql<string>`count(*) filter (where archived_at is null)`.as("active"),
            sql<string>`count(*) filter (where archived_at is not null)`.as("archived"),
          ])
          .where("thread_id", "=", id)
          .where("deleted_at", "is", null)
          .executeTakeFirstOrThrow();

        const members = await membersOf(id, accountId);
        const kinds = await openKinds(accountId, [id]);

        const isDefault = await isDefaultThreadOf(accountId, id);
        return reply.send({
          id: thread.id,
          name: thread.name,
          icon: thread.icon,
          hue: thread.hue,
          iconSetBy: thread.icon_set_by,
          alwaysOn: thread.always_on,
          counts: { active: Number(counts.active), archived: Number(counts.archived), unlabelled: await unlabelledCount(id) },
          members,
          line: threadLine(kinds.get(id) ?? {}, members.filter((m) => !m.isYou).map((m) => m.displayName)),
          labels: await labelsOfThread(id),
          // Validated on the way out as well as on the way in. A preference
          // naming a widget that no longer exists renders as though it were
          // absent, because a thread whose contents changed under a preference
          // is the normal case rather than an edge one.
          notes: await withNoteLabels(await readableNotes(accountId, id), db, accountId),
          noteCounts: await noteCounts(accountId, id),
          preference: {
            ...readPreference(thread.attrs),
            ...(thread.hide_done ? { hideDone: true } : {}),
          },
          standing: null,
          calendars: await calendarCounts(accountId, id),
          shareable: !isDefault,
          isDefault,
          hasPoint: await hasPoint(id),
          layout: thread.layout,
          layoutSetBy: thread.layout_set_by,
          // Drawn only when it still should be: present, not dismissed. The
          // write already guarded that it is offload's and the layout Default.
          layoutSuggestion: thread.layout_suggestion && !thread.layout_suggestion_dismissed_at ? thread.layout_suggestion : null,
          layoutChange,
        });
      })
  );

  // 030. A thread's points, for its map. A member's read, empty while the map
  // is off; nothing Google named is in it.
  const pointSchema = z.object({
    key: z.string(),
    source: z.enum(["row", "calendar"]),
    contentId: z.string().nullable(),
    type: z.string(),
    title: z.string(),
    address: z.string().nullable(),
    approximate: z.boolean(),
    lat: z.number(),
    lng: z.number(),
    googlePlaceId: z.string().nullable(),
    labelIds: z.array(z.string()),
    when: z.object({ at: z.string(), endAt: z.string().nullable(), allDay: z.boolean() }).nullable(),
    url: z.string().nullable(),
    imageUrl: z.string().nullable(),
    authorId: z.string().nullable(),
    calendarName: z.string().nullable(),
  });
  app.get(
    "/v1/threads/:id/points",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ points: z.array(pointSchema), pending: z.number() }), 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        await requireMember(accountId, request.params.id);
        return reply.send(await threadPoints(accountId, request.params.id));
      })
  );

  // ------------------------------------------------- a thread's calendars
  //
  // 019. The viewer's approved calendars against this thread, and a pick on
  // one of them. A pick is the member's own, reads for the whole thread, and
  // can be made or taken back only by them, in a thread they are in.
  const threadCalendar = z.object({
    id: z.string(),
    name: z.string(),
    colour: z.string().nullable(),
    writable: z.boolean(),
    sharedWithYou: z.boolean(),
    primary: z.boolean(),
    picked: z.boolean(),
    note: z.string().nullable(),
  });
  const threadCalendars = z.object({
    calendars: z.array(threadCalendar),
    others: z.array(z.object({ displayName: z.string(), count: z.number() })),
  });

  app.get(
    "/v1/threads/:id/calendars",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: threadCalendars, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        return reply.send(await viewerCalendars(accountId, request.params.id));
      })
  );

  // PATCH rather than PUT: the API's CORS allowlist has never needed PUT and
  // the calendar's own approve route is a PATCH.
  app.patch(
    "/v1/threads/:id/calendars/:calendarId",
    {
      schema: {
        params: z.object({ id: z.string().uuid(), calendarId: z.string().uuid() }),
        body: z.object({ picked: z.boolean() }),
        response: { 200: threadCalendars, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        const { id, calendarId } = request.params;
        await setPick(accountId, id, calendarId, request.body.picked);
        // Ids and a boolean. Nothing anybody named (OFF-1).
        await emit({
          name: "calendar_picked",
          properties: { thread_id: id, calendar_id: calendarId, picked: request.body.picked },
        }).catch(() => undefined);
        return reply.send(await viewerCalendars(accountId, id));
      })
  );

  // The events on the thread's calendars inside a window, for the rail. A
  // title, a time and, while the map is on, where it is (030), whoever asks:
  // never the guests, their answers or the description.
  app.get(
    "/v1/threads/:id/events",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        }),
        response: {
          200: z.object({
            events: z.array(
              z.object({
                id: z.string(),
                sourceRef: z.string(),
                calendarId: z.string(),
                calendarName: z.string(),
                colour: z.string().nullable(),
                title: z.string(),
                occursAt: z.string().nullable(),
                occursEndAt: z.string().nullable(),
                allDay: z.boolean(),
                untrusted: z.boolean(),
                involved: z.boolean(),
                location: z.string().nullable(),
                place: z
                  .object({ id: z.string(), lat: z.number().nullable(), lng: z.number().nullable(), approximate: z.boolean() })
                  .nullable(),
              })
            ),
          }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        // The client asks in its own local days and this reads in UTC, so a
        // day of padding either side keeps a late evening on the last day and
        // an early morning on the first; the client places by local day. The
        // window is capped at the rail's own reach, which is the copy's.
        const DAY = 24 * 60 * 60 * 1000;
        const from = new Date(new Date(`${request.query.from}T00:00:00Z`).getTime() - DAY);
        const to = new Date(new Date(`${request.query.to}T23:59:59Z`).getTime() + DAY);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from || to.getTime() - from.getTime() > 400 * DAY) {
          return reply.send({ events: [] });
        }
        return reply.send({ events: await threadEvents(accountId, request.params.id, from, to) });
      })
  );

  // ------------------------------------------------- a thread's content
  app.get(
    "/v1/threads/:id/content",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          // A uuid, since it is compared to one: anything else was a 500.
          cursor: z.string().uuid().optional(),
          archived: z.enum(["true", "false"]).default("false"),
          // 025. The filter bar's pick, read on the server because the list is
          // paged: either of these labels, or none, or both together.
          labels: z
            .string()
            .max(10 * 37)
            .transform((raw) => raw.split(",").filter(Boolean))
            .pipe(z.array(z.string().uuid()).max(10))
            .optional(),
          unlabelled: z.enum(["true", "false"]).default("false"),
          // The label's list: every row, the filter ignored, each marked with
          // whether it carries this label.
          ticksFor: z.string().uuid().optional(),
        }),
        response: { 200: contentPage, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const { id } = request.params;
        await requireMember(accountId, id);

        const wantArchived = request.query.archived === "true";

        let query = db
          .selectFrom("content")
          .leftJoin("accounts", "accounts.id", "content.account_id")
          .leftJoin("places", "places.id", "content.place_id")
          .select([
            "content.id as id",
            "content.type as type",
            "content.title as title",
            "content.body as body",
            "content.url as url",
            "content.image_url as image_url",
            "content.created_at as created_at",
            "content.archived_at as archived_at",
            "content.account_id as account_id",
            "content.done_at as done_at",
            "content.filing_at as filing_at",
            "content.due_at as due_at",
            "content.occurs_at as occurs_at",
            "content.occurs_end_at as occurs_end_at",
            "content.rrule as rrule",
            "content.source_ref as source_ref",
            "content.is_reminder as is_reminder",
            "content.priority as priority",
            "content.priority_pinned as priority_pinned",
            "content.place_id as place_id",
            "content.attrs as attrs",
            "accounts.display_name as authorName",
            sql<boolean>`exists (
              select 1 from thread_members am
              where am.thread_id = content.thread_id
                and am.account_id = content.account_id
                and am.state = 'accepted'
            )`.as("authorIsMember"),
            "content.location as location",
            "places.lat as placeLat",
            "places.lng as placeLng",
            "places.approximate as placeApproximate",
          ])
          .where("content.thread_id", "=", id)
          .where("content.deleted_at", "is", null)
          .where("content.archived_at", wantArchived ? "is not" : "is", null)
          .orderBy("content.id", "desc")
          .limit(PAGE + 1);

        const picked = request.query.ticksFor ? [] : (request.query.labels ?? []);
        const none = !request.query.ticksFor && request.query.unlabelled === "true";
        if (picked.length > 0 || none) {
          const carrying = picked.length > 0 ? sql<boolean>`exists (${carriesAny(sql.ref("content.id"), picked)})` : null;
          const bare = none ? sql<boolean>`not exists (${carriesAny(sql.ref("content.id"), null)})` : null;
          query = query.where(carrying && bare ? sql<boolean>`(${carrying} or ${bare})` : (carrying ?? bare)!);
        }

        // 2026-10-07. The label's list offers what is still ahead: a ticked
        // off row and an event whose last day is before today are left out,
        // unless the label carries them, so they can still come off it. A
        // series is never over. Days as Today reads them: an all-day row by
        // its UTC date, a timed one in the account's clock.
        const ticksFor = request.query.ticksFor;
        if (ticksFor) {
          const zone = (await zoneOf(accountId)) ?? "UTC";
          const today = sql`(now() at time zone ${zone})::date`;
          const lastDay = sql`(coalesce(content.occurs_end_at, content.occurs_at) at time zone (case when content.attrs->>'all_day' = 'true' then 'UTC' else ${zone} end))::date`;
          query = query.where(
            sql<boolean>`(exists (${carriesAny(sql.ref("content.id"), [ticksFor])}) or (
              content.done_at is null
              and (content.occurs_at is null or content.rrule is not null or ${lastDay} >= ${today})
            ))`,
          );
        }

        // The cursor is the id alone, and the ordering is by id alone.
        //
        // 001 specifies "(created_at, id), which UUIDv7 makes monotonic", and
        // the id is what makes it monotonic, so the id is the whole cursor. The
        // pair version is worse in a way that only shows up under load:
        // Postgres stores `created_at` to the microsecond and a JavaScript Date
        // holds milliseconds, so round-tripping the timestamp through the
        // cursor truncates it. Rows written inside the same millisecond then
        // fall in the gap, because `created_at < cursor` skips them and the
        // `created_at = cursor` tie-break never matches a value that has
        // microseconds. Eighty rows inserted in a loop lost one, which is what
        // a real thread filled by one dump would do.
        if (request.query.cursor) {
          query = query.where("content.id", "<", request.query.cursor);
        }

        const rows = await query.execute();
        const page = rows.slice(0, PAGE);
        const last = page.at(-1);

        const finished = await withPhotos(page.map((row) => toRow(row, accountId)), accountId);
        return reply.send({
          rows: ticksFor ? finished.map((row) => ({ ...row, ticked: row.labels.includes(ticksFor) })) : finished,
          nextCursor: rows.length > PAGE && last ? last.id : null,
        });
      })
  );

  // ------------------------------------------------------ one piece
  app.get(
    "/v1/content/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: contentDetail, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        await requireReadable(accountId, request.params.id);

        const row = await db
          .selectFrom("content")
          .innerJoin("threads", "threads.id", "content.thread_id")
          .leftJoin("accounts", "accounts.id", "content.account_id")
          .leftJoin("places", "places.id", "content.place_id")
          .select([
            "content.id as id",
            "content.type as type",
            "content.title as title",
            "content.body as body",
            "content.url as url",
            "content.image_url as image_url",
            "content.created_at as created_at",
            "content.archived_at as archived_at",
            "content.account_id as account_id",
            "content.done_at as done_at",
            "content.filing_at as filing_at",
            "content.due_at as due_at",
            "content.occurs_at as occurs_at",
            "content.occurs_end_at as occurs_end_at",
            "content.rrule as rrule",
            "content.source_ref as source_ref",
            "content.is_reminder as is_reminder",
            "content.priority as priority",
            "content.priority_pinned as priority_pinned",
            "content.place_id as place_id",
            "content.attrs as attrs",
            "content.derived_from_message_id as fromMessageId",
            "content.thread_id as threadId",
            // 028. A loose row names no thread; the crumb says Not in a thread.
            shownThreadName("threads.id", "threads.name", accountId).as("threadName"),
            shownThreadIcon("threads.id", "threads.icon", accountId).as("threadIcon"),
            shownThreadHue("threads.id", "threads.hue", accountId).as("threadHue"),
            "accounts.display_name as authorName",
            sql<boolean>`exists (
              select 1 from thread_members am
              where am.thread_id = content.thread_id
                and am.account_id = content.account_id
                and am.state = 'accepted'
            )`.as("authorIsMember"),
            "content.location as location",
            "places.lat as placeLat",
            "places.lng as placeLng",
            "places.approximate as placeApproximate",
          ])
          .where("content.id", "=", request.params.id)
          .executeTakeFirstOrThrow();

        // Provenance is the dump and the author, never the history of where
        // this has been. Content that moved must not carry its old thread's
        // name to people who were never in it.
        // 021. The message's words are `said(text, transcript)`: a spoken
        // dump's words reach provenance exactly as typed ones do, since a row
        // filed into a shared thread already points members at the words it
        // came from. The audio never does; it is the dumper's alone.
        const from = row.fromMessageId
          ? await db
              .selectFrom("messages")
              .select(["id", sql<string | null>`said(text, transcript)`.as("text"), "created_at"])
              .where("id", "=", row.fromMessageId)
              .where("deleted_at", "is", null)
              .executeTakeFirst()
          : undefined;

        return reply.send({
          ...(await withPhotos([toRow(row, accountId)], accountId))[0]!,
          threadId: row.threadId,
          threadName: row.threadName,
          threadIcon: row.threadIcon,
          threadHue: row.threadHue,
          from: from
            ? {
                messageId: from.id,
                text: from.text,
                at: from.created_at.toISOString(),
              }
            : null,
        });
      })
  );

  // ================================================================ writes
  //
  // All of them return the row as it now is and what it was, so Undo is one
  // more call to the same endpoint with the old value and the client holds
  // nothing across a reload.

  // 023. What the edit returns is what Undo sends back: one request.
  const previousTitle = z.object({
    title: z.string(),
    body: z.string().nullable(),
    dueAt: z.string().nullable(),
    occursAt: z.string().nullable(),
    occursEndAt: z.string().nullable(),
    allDay: z.boolean(),
    rrule: z.string().nullable(),
    isReminder: z.boolean(),
    labels: z.array(z.string()),
    reminders: z.enum(["on", "off"]).nullable(),
  });

  // Edit. Co-owned: anybody in the thread may fix a title offload got wrong,
  // which is most of what this page is for.
  app.patch(
    "/v1/content/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({
          title: z.string().min(1).max(200).optional(),
          body: z.string().max(4000).nullable().optional(),
          // 023. The when field. Absent leaves a field alone, null clears it.
          dueAt: z.string().max(40).nullable().optional(),
          occursAt: z.string().max(40).nullable().optional(),
          occursEndAt: z.string().max(40).nullable().optional(),
          allDay: z.boolean().optional(),
          rrule: z.string().max(200).nullable().optional(),
          /** The way out of a reminder. No screen draws a way to turn it on;
           *  a true here is Undo putting back what offload decided. */
          isReminder: z.boolean().optional(),
          // 025. The row's labels as a full set.
          labels: z.array(z.string().uuid()).max(10).optional(),
          // 042. The author's Remind me. Null is Undo sending back a snapshot
          // with no switch in it, and leaves the switch alone.
          reminders: z.enum(["on", "off"]).nullable().optional(),
        }),
        response: {
          200: z.object({ content: contentRow, previous: previousTitle }),
          400: refused,
          401: unauthenticated,
          404: notFound,
          409: refused,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const previous = await editContent(accountId, request.params.id, request.body);
        return reply.send({
          content: await rowById(request.params.id, accountId),
          previous,
        });
      })
  );

  // Archive and restore. The co-owned soft action, and the reason a shared list
  // is usable: without it a thread fills with rows only their author can clear.
  for (const [path, archive] of [
    ["archive", true],
    ["restore", false],
  ] as const) {
    app.post(
      `/v1/content/:id/${path}`,
      {
        schema: {
          params: z.object({ id: z.string().uuid() }),
          response: { 200: z.object({ content: contentRow }), 401: unauthenticated, 404: notFound },
        },
      },
      async (request, reply) =>
        guard(reply, async () => {
          const accountId = await currentAccountId(request);
          if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

          await setArchived(accountId, request.params.id, archive);
          return reply.send({ content: await rowById(request.params.id, accountId) });
        })
    );
  }

  // Move. The author's, like delete, because both change who can see something.
  app.post(
    "/v1/content/:id/move",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({ threadId: z.string().uuid() }),
        response: {
          200: z.object({ content: contentRow, previous: z.object({ threadId: z.string() }) }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const previous = await moveContent(accountId, request.params.id, request.body.threadId);
        return reply.send({
          content: await rowById(request.params.id, accountId),
          previous,
        });
      })
  );

  // Delete. Author only, soft, on 004's mechanism exactly: eight seconds, then
  // the purge job that is the only hard delete in the codebase.
  app.delete(
    "/v1/content/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ deleted: z.boolean() }), 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const deleted = await deleteContent(accountId, request.params.id);
        return reply.send({ deleted });
      })
  );

  // 044. Remove a wrong action from a PDF's row, and put it back. Author only,
  // like delete and move. The body is the url to forget; restore refuses any
  // url the row did not carry, so a client can never add one.
  for (const action of ["forget", "restore"] as const) {
    app.post(
      `/v1/content/:id/actions/${action}`,
      {
        schema: {
          params: z.object({ id: z.string().uuid() }),
          body: z.strictObject({ url: z.string().min(1).max(2048) }),
          response: { 200: z.object({ content: contentRow }), 401: unauthenticated, 404: notFound },
        },
      },
      async (request, reply) =>
        guard(reply, async () => {
          const accountId = await currentAccountId(request);
          if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
          if (action === "forget") await forgetAction(accountId, request.params.id, request.body.url);
          else await restoreAction(accountId, request.params.id, request.body.url);
          return reply.send({ content: await rowById(request.params.id, accountId) });
        })
    );
  }

  // Leave a thread, which deletes it when nobody else is in it. One endpoint,
  // because on a thread you are alone in they are the same act, and the screen
  // is honest about which one it is doing.
  app.delete(
    "/v1/threads/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ left: z.boolean(), deleted: z.boolean() }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        return reply.send(await deleteThread(accountId, request.params.id));
      })
  );

  app.post(
    "/v1/threads/:id/restore",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ restored: z.boolean() }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        return reply.send({ restored: await restoreThread(accountId, request.params.id) });
      })
  );

  // Typing straight into a section, without going through the composer.
  //
  // The + on a widget's heading. It is the same model doing the same reading,
  // grounded in this thread rather than in the whole account, and it leaves no
  // trace in the conversation: somebody adding a task to a list is not talking
  // to offload, and a chat log full of "brackets" would make the composer
  // useless as a record of anything.
  app.post(
    "/v1/threads/:id/quick-add",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({
          text: z.string().min(1).max(QUICK_ADD_CHARS),
          /** Which heading the + was on, which decides the row's type. */
          section: z.string().max(32).optional(),
          /** The day open on the rail, when the + was that one's. A day, not a
           *  time: the rail asks which day, never which hour. */
          day: z.string().max(40).optional(),
        }),
        response: {
          200: z.object({ id: z.string(), kind: z.enum(["content", "note"]) }),
          401: unauthenticated,
          404: notFound,
          413: z.object({ error: z.literal("too_long"), maxChars: z.number() }),
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const text = request.body.text.trim();
        if (text.length === 0) return reply.code(404).send({ error: "not_found" as const });

        return reply.send(
          await quickAdd(accountId, request.params.id, text, request.body.section ?? "", {
            day: request.body.day,
          })
        );
      })
  );

  // ---------------------------------------------------------------- notes
  //
  // A note is a sentence about a thread: what is true about it, and sometimes
  // how it should be handled. It sits on the thread rather than in content,
  // because 014 merged the two concepts that were doing this job. The
  // permission split is the one OFF-3 already sets and 005 already applied to
  // content: reading and editing are co-owned, deleting is the author's, and
  // mute is what everybody else gets instead.
  //
  // 014 kept the old `/memories` paths for a release while installed phones
  // caught up. 040 took them back: `/v1/memories` is the Memories tab's now,
  // and a thread note's id there is not found.

  const notePaths = (suffix: string): [string] => [`/v1/notes${suffix}`];

  for (const path of ["/v1/threads/:id/notes"]) {
    app.post(
      path,
      {
        schema: {
          params: z.object({ id: z.string().uuid() }),
          body: z.strictObject({
            text: z.string().min(1).max(NOTE_TEXT_CHARS),
            body: z.string().max(NOTE_BODY_CHARS).nullish(),
          }),
          response: {
            200: z.object({ note: noteSchema }),
            401: unauthenticated,
            404: notFound,
            413: z.object({ error: z.literal("too_long"), maxChars: z.number() }),
          },
        },
      },
      async (request, reply) =>
        guard(reply, async () => {
          const accountId = await currentAccountId(request);
          if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

          const { id } = request.params;
          await requireMember(accountId, id);

          try {
            // **No 409 and no lock.** 008 refused the eleventh under a row lock
            // on the thread; a hundred is a prompt budget applied at assembly,
            // so there is nothing here to serialise and nothing to refuse.
            const note = await addNote({
              threadId: id,
              accountId,
              text: request.body.text,
              body: request.body.body ?? null,
              origin: "stated",
            });
            await touchThread(id, db);
            await noteAddition(id, accountId);
            return reply.send({ note: { ...note, labels: [] } });
          } catch (error) {
            if (error instanceof NoteTooLong) {
              return reply
                .code(413)
                .send({ error: "too_long" as const, maxChars: error.maxChars });
            }
            throw error;
          }
        })
    );
  }

  // What the daily job folded. Read, not worked with: no restore and no edit,
  // and cursor-paginated because it is the one list here that has no ceiling.
  app.get(
    "/v1/threads/:id/notes/folded",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        // A timestamp, checked as one. Unvalidated it reaches `new Date` and
        // becomes an Invalid Date, which is a 500 rather than a refusal.
        querystring: z.object({ cursor: z.string().datetime().optional() }),
        response: {
          200: z.object({ notes: z.array(noteSchema), cursor: z.string().nullable() }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        await requireMember(accountId, request.params.id);

        const before = request.query.cursor ? new Date(request.query.cursor) : null;
        // One more than the page, so "is there another page" is answered by the
        // read rather than by a count.
        const rows = await foldedNotes(accountId, request.params.id, before, FOLDED_PAGE + 1);
        const page = rows.slice(0, FOLDED_PAGE);
        const last = page[page.length - 1];
        return reply.send({
          notes: await withNoteLabels(page, db, accountId),
          cursor:
            rows.length > FOLDED_PAGE && last?.supersededAt
              ? last.supersededAt.toISOString()
              : null,
        });
      })
  );

  // Edit. The words are the author's alone (`editNote`); the labels are any
  // member's, as a thread's labels are. The full text rather than anything a
  // row shortened.
  // Returns `previous` so Undo has something to write back.
  for (const path of notePaths("/:id")) {
    app.patch(
      path,
      {
        schema: {
          params: z.object({ id: z.string().uuid() }),
          body: z.strictObject({
            // Optional since 025, so the label sheet can write a note's labels
            // alone; one of the two is required.
            text: z.string().min(1).max(NOTE_TEXT_CHARS).optional(),
            body: z.string().max(NOTE_BODY_CHARS).nullish(),
            labels: z.array(z.string().uuid()).max(10).optional(),
          }),
          response: {
            200: z.object({ note: noteSchema, previous: z.string(), previousLabels: z.array(z.string()) }),
            401: unauthenticated,
            404: notFound,
            // Only reachable for a note offload wrote: the unique index covers
            // nothing else. Refused rather than merged into the existing row,
            // which would destroy one note to satisfy an edit of another.
            409: z.object({ error: z.literal("duplicate") }),
            413: z.object({ error: z.literal("too_long"), maxChars: z.number() }),
          },
        },
      },
      async (request, reply) =>
        guard(reply, async () => {
          const accountId = await currentAccountId(request);
          if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

          const { text, labels } = request.body;
          if (text === undefined && labels === undefined) return reply.code(404).send({ error: "not_found" as const });
          try {
            const result = await db.transaction().execute(async (trx) => {
              const current = await requireReadableNote(accountId, request.params.id, trx);
              const previousLabels = (await withNoteLabels([current], trx, accountId))[0]!.labels;
              if (labels !== undefined) {
                await setRowLabels(trx, { accountId, via: "person" }, { kind: "note", id: current.id, threadId: current.threadId }, labels);
              }
              const edited =
                text === undefined
                  ? { note: current as Note, previous: current.text }
                  : await editNote(
                      {
                        noteId: request.params.id,
                        accountId,
                        text,
                        ...(request.body.body === undefined ? {} : { body: request.body.body }),
                      },
                      trx,
                    );
              if (!edited) return null;
              const [note] = await withNoteLabels([edited.note], trx, accountId);
              return { note: note!, previous: edited.previous, previousLabels };
            });
            if (!result) return reply.code(409).send({ error: "duplicate" as const });
            return reply.send(result);
          } catch (error) {
            if (error instanceof NoteTooLong) {
              return reply
                .code(413)
                .send({ error: "too_long" as const, maxChars: error.maxChars });
            }
            throw error;
          }
        })
    );
  }

  // Delete. The author's alone, per OFF-3. A member who did not write it gets
  // the same refusal a non-member gets, so the response never teaches who did.
  for (const path of notePaths("/:id")) {
    app.delete(
      path,
      {
        schema: {
          params: z.object({ id: z.string().uuid() }),
          response: {
            200: z.object({ deleted: z.boolean() }),
            401: unauthenticated,
            404: notFound,
          },
        },
      },
      async (request, reply) =>
        guard(reply, async () => {
          const accountId = await currentAccountId(request);
          if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

          // One transaction: the note and what goes with it (takes.ts).
          const deleted = await db.transaction().execute((trx) => deleteNote(request.params.id, accountId, trx));
          return reply.send({ deleted });
        })
    );
  }

  // Undo the delete. Nothing to re-check: 008 re-checked the cap here because
  // restore was the one door the cap did not watch, and there is no cap now.
  for (const path of notePaths("/:id/restore")) {
    app.post(
      path,
      {
        schema: {
          params: z.object({ id: z.string().uuid() }),
          response: {
            200: z.object({ note: noteSchema }),
            401: unauthenticated,
            404: notFound,
          },
        },
      },
      async (request, reply) =>
        guard(reply, async () => {
          const accountId = await currentAccountId(request);
          if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

          const note = await db
            .transaction()
            .execute((trx) => restoreNote(request.params.id, accountId, trx));
          return reply.send({ note: (await withNoteLabels([note], db, accountId))[0]! });
        })
    );
  }

  // Move a note within its section. Any member, reversible by writing the
  // previous number back, and the twin of `/v1/content/:id/priority`: the same
  // scale, so the same drag helper serves both lists. No old alias,
  // because no shipped build calls it.
  app.post(
    "/v1/notes/:id/priority",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({ priority: z.number().int().min(0).max(100) }),
        response: {
          200: z.object({ note: noteSchema, previous: z.object({ priority: z.number() }) }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        const result = await reprioritiseNote(accountId, request.params.id, request.body.priority);
        return reply.send({ ...result, note: (await withNoteLabels([result.note], db, accountId))[0]! });
      })
  );

  // Mute and unmute. Any member, thread-wide, and reversible, which is why it
  // is on the OFF-6 allowlist rather than under an eight second toast.
  for (const path of notePaths("/:id/mute")) {
    app.post(
      path,
      {
        schema: {
          params: z.object({ id: z.string().uuid() }),
          body: z.strictObject({ muted: z.boolean() }),
          response: {
            200: z.object({ note: noteSchema }),
            401: unauthenticated,
            404: notFound,
          },
        },
      },
      async (request, reply) =>
        guard(reply, async () => {
          const accountId = await currentAccountId(request);
          if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

          const note = await setMuted(request.params.id, accountId, request.body.muted);
          return reply.send({ note: (await withNoteLabels([note], db, accountId))[0]! });
        })
    );
  }

  // 2026-10-07. A thread made by hand, from the plus on My threads, with Edit
  // thread's three fields. Made as the model's and a proposal's are: the
  // thread and its creator's membership together, the icon read off the name
  // unless another was picked, which makes it the person's. The popover sends
  // the icon it showed, so the one offload would pick stays offload's.
  app.post(
    "/v1/threads",
    {
      schema: {
        body: z.strictObject({
          name: z.string().trim().min(1).max(80),
          icon: z.string().refine(isThreadIcon).optional(),
          hue: z.number().int().min(1).max(10).optional(),
          // New thread's Layout row, the person's pick. Default when omitted.
          layout: z.enum(LAYOUTS).optional(),
        }),
        response: {
          200: z.object({ thread: z.object({ id: z.string(), name: z.string(), icon: z.string(), hue: z.number() }) }),
          401: unauthenticated,
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
      const { name, icon, hue, layout } = request.body;
      const thread = await db.transaction().execute(async (trx) => {
        const mark = await markFor(trx, accountId, name, icon);
        const offloads = pickThreadIcon(name) ?? DEFAULT_THREAD_ICON;
        const made = await trx
          .insertInto("threads")
          .values({
            created_by_account_id: accountId,
            name,
            icon: mark.icon,
            hue: hue ?? mark.hue,
            icon_set_by: mark.icon === offloads ? "offload" : "person",
            always_on: false,
            // A person's pick from New thread. Default is the column's own.
            ...(layout ? { layout, layout_set_by: "person" } : {}),
            last_activity_at: sql`now()`,
            updated_at: sql`now()`,
          })
          .returning(["id", "name", "icon", "hue"])
          .executeTakeFirstOrThrow();
        await trx
          .insertInto("thread_members")
          .values({ thread_id: made.id, account_id: accountId, invited_by: null, state: "accepted", responded_at: sql`now()` })
          .execute();
        // The labels the layout organises by, made as the person who picked it.
        if (layout) {
          for (const labelName of LAYOUT_LABELS[layout]) {
            await createLabel(trx, { accountId, via: "person" }, made.id, { name: labelName });
          }
        }
        return made;
      });
      return reply.send({ thread });
    },
  );

  // 037. Edit thread: the name, the icon and the hue in one write. Co-owned,
  // and it touches no content.
  app.patch(
    "/v1/threads/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z
          .strictObject({
            name: z.string().min(1).max(80).optional(),
            icon: z.string().refine(isThreadIcon).optional(),
            hue: z.number().int().min(1).max(10).optional(),
            iconSetBy: z.enum(["offload", "person"]).optional(),
            // Thread layouts. The switch rides the same write as name and look,
            // so Save is one request with one Undo.
            layout: z.enum(LAYOUTS).optional(),
            layoutSetBy: z.enum(["offload", "person"]).optional(),
            undoLabels: z
              .object({ remove: z.array(z.string().uuid()), restore: z.array(z.string().uuid()) })
              .optional(),
          })
          .refine((body) => Object.values(body).some((value) => value !== undefined))
          // Whose pick it is comes back only with the pick itself, which is
          // what Undo sends. Alone it would hand a person's pick back to
          // offload without changing anything anybody can see.
          .refine((body) => body.iconSetBy === undefined || (body.icon !== undefined && body.hue !== undefined))
          // `layoutSetBy` is the layout's twin of that rule: accepted only
          // alongside `undoLabels`, which is the only write that puts a pick back.
          .refine((body) => body.layoutSetBy === undefined || body.undoLabels !== undefined),
        response: {
          200: z.object({
            thread: threadMark.extend({ id: z.string() }),
            previous: threadMark,
            layout: z
              .object({
                previous: z.object({ layout: z.enum(LAYOUTS), layoutSetBy: z.enum(["offload", "person"]) }),
                made: z.array(z.string()),
                dropped: z.array(z.string()),
              })
              .optional(),
          }),
          401: unauthenticated,
          404: notFound,
          409: z.object({ error: z.literal("layout_labels_full"), needed: z.number(), free: z.number() }),
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const { name, icon, hue, iconSetBy, layout, layoutSetBy, undoLabels } = request.body;
        try {
          const result = await editThread(accountId, request.params.id, {
            ...(name !== undefined ? { name } : {}),
            ...(icon !== undefined ? { icon } : {}),
            ...(hue !== undefined ? { hue } : {}),
            ...(iconSetBy !== undefined ? { iconSetBy } : {}),
            ...(layout !== undefined ? { layout } : {}),
            ...(layoutSetBy !== undefined ? { layoutSetBy } : {}),
            ...(undoLabels !== undefined ? { undoLabels } : {}),
          });
          return reply.send({
            thread: { id: request.params.id, ...result.thread },
            previous: result.previous,
            ...(result.layout ? { layout: result.layout } : {}),
          });
        } catch (error) {
          if (error instanceof LayoutLabelsFull) {
            return reply.code(409).send({ error: "layout_labels_full" as const, needed: error.needed, free: error.free });
          }
          throw error;
        }
      })
  );

  // Thread layouts. The suggestion line's x: the thread's suggestion ends for
  // everybody (decision 25). Idempotent, member-only.
  app.post(
    "/v1/threads/:id/layout-suggestion/dismiss",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ ok: z.literal(true) }), 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        await requireMember(accountId, request.params.id);
        await db
          .updateTable("threads")
          .set({ layout_suggestion_dismissed_at: sql`now()`, updated_at: sql`now()` })
          .where("id", "=", request.params.id)
          .where("layout_suggestion_dismissed_at", "is", null)
          .execute();
        return reply.send({ ok: true as const });
      })
  );

  // Thread layouts. The heads-up has drawn: this member has now seen the layout
  // as it stands, so it does not draw again (decision 13).
  app.post(
    "/v1/threads/:id/layout-seen",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ ok: z.literal(true) }), 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        await requireMember(accountId, request.params.id);
        await db
          .updateTable("thread_members")
          .set({ layout_seen_at: sql`now()` })
          .where("thread_id", "=", request.params.id)
          .where("account_id", "=", accountId)
          .execute();
        return reply.send({ ok: true as const });
      })
  );

  // Tick, reprioritise and arrange. All co-owned, all reversible, all returning
  // what was there so Undo is one more call with the old value.
  app.post(
    "/v1/content/:id/complete",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({ done: z.boolean() }),
        response: {
          200: z.object({ content: contentRow, previous: z.object({ done: z.boolean() }) }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        const previous = await completeContent(accountId, request.params.id, request.body.done);
        return reply.send({ content: await rowById(request.params.id, accountId), previous });
      })
  );

  app.post(
    "/v1/content/:id/priority",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({ priority: z.number().int().min(0).max(100) }),
        response: {
          200: z.object({
            content: contentRow,
            previous: z.object({ priority: z.number(), priorityPinned: z.boolean() }),
          }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        const previous = await reprioritise(accountId, request.params.id, request.body.priority);
        return reply.send({ content: await rowById(request.params.id, accountId), previous });
      })
  );

  app.patch(
    "/v1/threads/:id/preference",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({
          // Bounded, since an unbounded value would be stored on the thread
          // and served to every member; `readPreference` keeps the three kinds.
          widgets: z.array(z.string().max(WIDGET_KIND_CHARS)).max(3).nullish(),
          hideDone: z.boolean().nullish(),
        }),
        response: {
          200: z.object({
            preference: z.object({
              widgets: z.array(z.string()).optional(),
              hideDone: z.boolean().optional(),
            }),
            previous: z.object({
              widgets: z.array(z.string()).optional(),
              hideDone: z.boolean().optional(),
            }),
          }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const previous = await setPreference(accountId, request.params.id, {
          ...(request.body.widgets === undefined ? {} : { widgets: request.body.widgets }),
          ...(request.body.hideDone === undefined ? {} : { hideDone: request.body.hideDone }),
        });

        return reply.send({
          preference: await preferenceOf(accountId, request.params.id),
          previous,
        });
      })
  );
}

/** One row, shaped the way every response shapes it. Re-read after a write
 *  rather than assembled from the update, so what the client renders is what
 *  the database holds. */
async function rowById(contentId: string, viewerId: string) {
  const row = await db
    .selectFrom("content")
    .leftJoin("accounts", "accounts.id", "content.account_id")
    .leftJoin("places", "places.id", "content.place_id")
    .select([
      "content.id as id",
      "content.type as type",
      "content.title as title",
      "content.body as body",
      "content.url as url",
            "content.image_url as image_url",
      "content.created_at as created_at",
      "content.archived_at as archived_at",
      "content.account_id as account_id",
      "content.done_at as done_at",
      "content.filing_at as filing_at",
      "content.due_at as due_at",
      "content.occurs_at as occurs_at",
            "content.occurs_end_at as occurs_end_at",
            "content.rrule as rrule",
            "content.source_ref as source_ref",
      "content.is_reminder as is_reminder",
      "content.priority as priority",
      "content.priority_pinned as priority_pinned",
      "content.place_id as place_id",
            "content.attrs as attrs",
      "accounts.display_name as authorName",
      sql<boolean>`exists (
        select 1 from thread_members am
        where am.thread_id = content.thread_id
          and am.account_id = content.account_id
          and am.state = 'accepted'
      )`.as("authorIsMember"),
      "content.location as location",
      "places.lat as placeLat",
      "places.lng as placeLng",
      "places.approximate as placeApproximate",
    ])
    .where("content.id", "=", contentId)
    .executeTakeFirstOrThrow();
  return (await withPhotos([toRow(row, viewerId)], viewerId))[0]!;
}

/** 020. Attach each row's photo, one query for the page. A row carries at most
 *  one photo today, since a photo row is one photo; the first live blob wins
 *  if that ever changes. */
export async function withPhotos<T extends { id: string; photo: unknown }>(rows: T[], viewerId: string): Promise<(T & { labels: string[] })[]> {
  if (rows.length === 0) return [];
  const found = await db
    .selectFrom("content_blobs")
    .innerJoin("blobs", "blobs.id", "content_blobs.blob_id")
    .select([
      "content_blobs.content_id as content_id",
      "blobs.id as id",
      "blobs.kind",
      "blobs.width",
      "blobs.height",
      "blobs.pages",
      "blobs.renditions_at",
      "blobs.clean_at",
      "blobs.unreadable_at",
    ])
    .where("content_blobs.content_id", "in", rows.map((row) => row.id))
    .where("blobs.kind", "in", ["image", "pdf"])
    .where("blobs.deleted_at", "is", null)
    .orderBy("content_blobs.created_at", "asc")
    .execute();
  const byContent = new Map<string, FileOnRow>();
  for (const blob of found) {
    if (byContent.has(blob.content_id)) continue;
    byContent.set(blob.content_id, fileToWire(blob));
  }
  // 025. Every row a client reads passes through here, so this is the one
  // place a row gains its labels, and since 042 its author's Remind me.
  const labelled = await withContentLabels(rows.map((row) => ({ ...row, photo: byContent.get(row.id) ?? null })));
  return withRowReminders(labelled, viewerId);
}

export const THREAD_LIMITS = { PAGE, STALE_DAYS } as const;

/** Each thread's open content by type, for `threadLine`, through the one
 *  read predicate: a thread the viewer is not in counts nothing. */
export async function openKinds(viewerId: string, threadIds: string[]): Promise<Map<string, Record<string, number>>> {
  const rows = await db
    .selectFrom("readable_content")
    .select(["thread_id as threadId", "type", (eb) => eb.fn.countAll<string>().as("n")])
    .where("viewer_account_id", "=", viewerId)
    .where("thread_id", "in", threadIds)
    .where("archived_at", "is", null)
    .where("deleted_at", "is", null)
    .where((eb) =>
      eb.or([
        eb("type", "not in", ["task", "event"]),
        eb.and([eb("type", "=", "task"), eb("done_at", "is", null)]),
        eb.and([
          eb("type", "=", "event"),
          eb.or([
            eb("rrule", "is not", null),
            eb("occurs_at", "is", null),
            eb(sql`coalesce(occurs_end_at, occurs_at)`, ">=", sql`now()`),
          ]),
        ]),
      ]),
    )
    .groupBy(["thread_id", "type"])
    .execute();
  const out = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const held = out.get(row.threadId) ?? {};
    held[row.type] = Number(row.n);
    out.set(row.threadId, held);
  }
  return out;
}

/** 042. The author's Remind me on rows already shaped for one viewer: only a
 *  row that is theirs can carry one. */
async function withRowReminders<T extends { id: string }>(rows: T[], viewerId: string): Promise<T[]> {
  const theirs = rows.filter((row) => (row as { author?: { isYou?: boolean } }).author?.isYou);
  const found = await remindersOf(db, "content", theirs.map((row) => row.id), viewerId);
  return rows.map((row) => (found.has(row.id) ? { ...row, reminders: found.get(row.id)! } : row));
}

