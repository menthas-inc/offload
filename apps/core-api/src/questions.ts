// 018. Asking back: the templates, the values, the envelope and the apply step.
//
// Everything the model may ask is bounded here by schema and by code, and
// everything a person may answer is a value this file already knows how to
// apply. The model supplies a field, a row and up to four values; the server
// renders the sentence, adds the way out, and later fills exactly one field on
// exactly one row from exactly one of those values.

import { z } from "zod";
import { sql, type Kysely, type Transaction } from "kysely";
import { db } from "./db.js";
import type { Database } from "./schema.js";
import { normaliseTags, BadTags, MAX_TAGS } from "./threads/tags.js";
import { COUNTRIES, isCountry } from "./countries.js";
import { NotYours, touchThread } from "./threads/access.js";
import { moveContentIn } from "./routes/threads.js";

type Trx = Transaction<Database>;
/** For the two writers that may run inside a caller's transaction or on the
 *  pool: the tool route raises a calendar question from whichever it holds. */
type Writer = Trx | Kysely<Database>;

/** 019 added `calendar`: which of the person's calendars a row goes on. Raised
 *  by the server from inside a calendar write, never by the model's `ask`, and
 *  applied through 012's write path rather than by filling a field. 020 added
 *  `thread`: a photo sent alone from Today, asked which thread, applied as a
 *  move. */
export const FIELDS = ["date", "span", "time", "tag", "country", "calendar", "thread"] as const;
export type Field = (typeof FIELDS)[number];

/** The way out, on every question. An answer, not a dismissal. */
export const ESCAPE_LABEL = "Not that";

export const QUESTION_TEXT_CHARS = 80;
export const OPTION_LABEL_CHARS = 24;
export const MAX_QUESTIONS = 2;
export const MAX_VALUES = 4;

/** What the worker posts with a settled turn. Validated again on the way in,
 *  against the closed set, because a set enforced in one place is a set until
 *  there is a second writer. */
export const askedQuestion = z.object({
  field: z.enum(FIELDS),
  title: z.string().min(1).max(60),
  contentId: z.string().uuid().nullish(),
  // The label is the model's and is never used: the server words every
  // option from its value. Accepted absent or null so a model that sends
  // none is not refused at the door, which is what took a whole turn down
  // on the first real date question.
  options: z
    .array(
      z.object({
        label: z.string().max(OPTION_LABEL_CHARS).nullish(),
        value: z.string().min(1).max(40),
      }),
    )
    .max(MAX_VALUES)
    .default([]),
});
export type AskedQuestion = z.infer<typeof askedQuestion>;

/** An option as stored: the value the server applies, and its label. The
 *  escape carries a null value. */
export interface StoredOption {
  label: string;
  value: string | null;
}

/** What a client sees. Values are never sent; an index comes back. */
export const questionOnWire = z
  .object({
    id: z.string(),
    field: z.enum(FIELDS),
    text: z.string(),
    options: z.array(z.object({ label: z.string(), kind: z.enum(["value", "plain"]) })),
    ordinal: z.number().int(),
  })
  .nullable();
export type QuestionOnWire = z.infer<typeof questionOnWire>;

// ---------------------------------------------------------------- the sentence

/** One template per field, with the row's own title as the only slot. The
 *  thread is not named: the pill under the turn already says where. */
export function renderText(field: Field, title: string, dimension?: string): string {
  const name = clip(title, 40);
  switch (field) {
    case "date":
      return `Filed "${name}". By when?`;
    case "span":
      return `Filed "${name}" as a stay. Which dates?`;
    case "time":
      return `Filed "${name}". Which day and time?`;
    case "tag":
      return `Filed "${name}". Which ${dimension ?? "tag"}?`;
    case "country":
      return "For which country?";
    case "calendar":
      return `Filed "${name}". Which calendar?`;
    case "thread":
      return `Kept "${name}". Which thread?`;
  }
}

function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------- values

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO = /^[A-Z]{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A value in the field's wire form, or null. Shape and sense only: a day is a
 *  day, a span is in order, a clock exists. Membership among the options is
 *  the caller's check where it applies. */
export function parseValue(field: Field, raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : null);
  switch (field) {
    case "date": {
      const day = str("day");
      return day && DAY.test(day) && plausibleDay(day) ? { day } : null;
    }
    case "span": {
      const from = str("from");
      const to = str("to") ?? from;
      if (!from || !to || !DAY.test(from) || !DAY.test(to)) return null;
      if (!plausibleDay(from) || !plausibleDay(to) || to < from) return null;
      return { from, to };
    }
    case "time": {
      const day = str("day");
      const time = str("time");
      return day && time && DAY.test(day) && plausibleDay(day) && CLOCK.test(time) ? { day, time } : null;
    }
    case "tag": {
      const tag = str("tag");
      if (!tag) return null;
      try {
        const [one] = normaliseTags([tag]);
        return one ? { tag: one } : null;
      } catch (error) {
        if (error instanceof BadTags) return null;
        throw error;
      }
    }
    case "country": {
      const country = str("country")?.toUpperCase() ?? null;
      return country && ISO.test(country) ? { country } : null;
    }
    case "calendar": {
      const calendar = str("calendar")?.toLowerCase() ?? null;
      return calendar && UUID.test(calendar) ? { calendar } : null;
    }
    case "thread": {
      const thread = str("thread");
      return thread && UUID.test(thread) ? { thread } : null;
    }
  }
}

function plausibleDay(day: string): boolean {
  const at = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return false;
  const span = Math.abs(at.getTime() - Date.now());
  return span < 366 * 24 * 3600 * 1000 * 2;
}

/** The value an option carries, in the field's wire form. What the model
 *  sends is one string per option; this is how it reads for each field. */
export function optionValue(field: Field, value: string): Record<string, string> | null {
  switch (field) {
    case "date":
      return parseValue(field, { day: value });
    case "span": {
      const [from, to] = value.split("/");
      return parseValue(field, { from, to: to ?? from });
    }
    case "time": {
      const [day, time] = value.split("T");
      return parseValue(field, { day, time });
    }
    case "tag":
      return parseValue(field, { tag: value });
    case "country":
      return parseValue(field, { country: value });
    case "calendar":
      return parseValue(field, { calendar: value });
    case "thread":
      return parseValue(field, { thread: value });
  }
}

function dimensionOf(tag: string): string | null {
  const i = tag.indexOf(":");
  return i > 0 ? tag.slice(0, i) : null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayParts(day: string): { d: number; m: number; y: number; dow: number } {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return { d, m, y, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** The label of an option, worded by the server from the value.
 *
 *  **The model supplies values and nothing it wrote is ever a label.** A label
 *  is written into the log as the person's own turn when tapped, read back
 *  into every later prompt as their words and indexed with them, so a page's
 *  sentence smuggled in as a label would become something they said. Wording
 *  it here from a value the parser already accepted closes that. Under 24
 *  characters by construction, apart from a long country name, which falls
 *  back to its code. */
export function labelFor(field: Field, value: string): string {
  const parsed = optionValue(field, value);
  if (!parsed) return value;
  switch (field) {
    case "date": {
      const { d, m, y } = dayParts(parsed["day"]!);
      const thisYear = new Date().getUTCFullYear();
      return `${d} ${MONTHS[m - 1]}${y === thisYear ? "" : ` ${y}`}`;
    }
    case "span": {
      const from = dayParts(parsed["from"]!);
      const to = dayParts(parsed["to"]!);
      if (from.m === to.m && from.y === to.y) {
        return from.d === to.d ? `${from.d} ${MONTHS[from.m - 1]}` : `${from.d} to ${to.d} ${MONTHS[from.m - 1]}`;
      }
      return `${from.d} ${MONTHS[from.m - 1]!.slice(0, 3)} to ${to.d} ${MONTHS[to.m - 1]!.slice(0, 3)}`;
    }
    case "time": {
      const { d, m, dow } = dayParts(parsed["day"]!);
      return `${DAYS[dow]} ${d} ${MONTHS[m - 1]!.slice(0, 3)} ${parsed["time"]}`;
    }
    case "tag": {
      const tag = parsed["tag"]!;
      const word = tag.includes(":") ? tag.slice(tag.indexOf(":") + 1) : tag;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
    case "country": {
      const code = parsed["country"]!;
      const name = COUNTRIES.find((c) => c.code === code)?.name ?? code;
      return name.length <= OPTION_LABEL_CHARS ? name : code;
    }
    case "calendar":
      // Worded from the calendar row by `raiseCalendarQuestion`, the one
      // label not derived from its value by arithmetic. Never reached.
      return value;
    case "thread":
      // Named from the database in `validateAsked`, which is the only place a
      // thread's name is read; the value alone cannot be worded.
      return value;
  }
}

// ---------------------------------------------------------------- validation at turn-result

export type Refusal =
  | "too_many"
  | "bad_target"
  | "bad_value"
  | "too_few_values"
  | "no_target"
  | "wrong_path"
  | "forbidden_by_note"
  | "duplicate_field"
  | "bad_dimension"
  | "not_their_country"
  // 020. The one condition under which where a row goes may be asked did
  // not hold: the dump had words, a thread was on screen, the turn wrote
  // more than the photo, or the photo is not in the default thread.
  | "thread_condition";

interface Validated {
  field: Field;
  text: string;
  options: StoredOption[];
  targetContentId: string | null;
  targetNoteId: string | null;
}

/** Turn what the worker posted into rows, or say why not. All or nothing: a
 *  list with one bad question is dropped whole and the turn settles as if it
 *  had asked nothing, which is the safe direction. */
export async function validateAsked(
  trx: Trx,
  asked: AskedQuestion[],
  ctx: { accountId: string; messageId: string; answering: boolean },
): Promise<{ ok: true; rows: Validated[] } | { ok: false; reason: Refusal; field: Field | null }> {
  if (asked.length > MAX_QUESTIONS) return { ok: false, reason: "too_many", field: null };

  const landed = await trx
    .selectFrom("content")
    .select(["id", "thread_id", "type", "title"])
    .where("derived_from_message_id", "=", ctx.messageId)
    .where("account_id", "=", ctx.accountId)
    .where("deleted_at", "is", null)
    .execute();
  const landedNotes = await trx
    .selectFrom("notes")
    .select(["id", "subject_id", "text"])
    .where("derived_from_message_id", "=", ctx.messageId)
    .where("account_id", "=", ctx.accountId)
    .where("deleted_at", "is", null)
    .execute();

  const rows: Validated[] = [];
  const seen = new Set<string>();
  for (const q of asked) {
    if (ctx.answering !== (q.field === "country")) return { ok: false, reason: "wrong_path", field: q.field };
    // 019. Only the server raises a calendar question, from inside a write.
    if (q.field === "calendar") return { ok: false, reason: "wrong_path", field: q.field };

    let targetContentId: string | null = null;
    let targetNoteId: string | null = null;
    let threadId: string | null = null;
    // **The title is the row's, read back from the row.** The model echoes one
    // and it is ignored: a page it read could have written it, and the
    // sentence is offload's own voice.
    let title = "";
    if (q.field !== "country") {
      if (!q.contentId) return { ok: false, reason: "no_target", field: q.field };
      const content = landed.find((row) => row.id === q.contentId);
      const note = landedNotes.find((row) => row.id === q.contentId);
      if (content) {
        targetContentId = content.id;
        threadId = content.thread_id;
        title = content.title;
      } else if (note && q.field !== "tag") {
        targetNoteId = note.id;
        threadId = note.subject_id;
        title = note.text;
      } else {
        return { ok: false, reason: "bad_target", field: q.field };
      }
      const key = `${q.contentId}:${q.field}`;
      if (seen.has(key)) return { ok: false, reason: "duplicate_field", field: q.field };
      seen.add(key);
    }

    // 020. Where a row goes is never asked, except here, and the exception is
    // a condition the server checks rather than a judgment the model made:
    // no words, no thread on screen, and the turn wrote exactly one row, the
    // photo, in the default thread.
    if (q.field === "thread") {
      const condition = await threadQuestionAllowed(trx, ctx.accountId, ctx.messageId, targetContentId, landed);
      if (!condition) return { ok: false, reason: "thread_condition", field: q.field };
    }

    const options: StoredOption[] = [];
    for (const o of q.options) {
      // Stored in the parser's own form: a country as its code uppercased, a
      // tag normalised, so what is stored is what applies.
      const parsed = optionValue(q.field, o.value);
      if (!parsed) return { ok: false, reason: "bad_value", field: q.field };
      const value = storedForm(q.field, parsed);
      if (options.some((have) => have.value === value)) continue;
      options.push({ label: labelFor(q.field, value), value });
    }
    if (q.field === "thread") {
      // Each option a thread the person is an accepted member of, named from
      // the database and never from the model, and never the default it is
      // already in. Anything else is dropped rather than refused whole: a
      // wrong guess among four is not a reason to ask nothing.
      const named = await threadOptions(trx, ctx.accountId, options.map((o) => o.value!), threadId);
      options.length = 0;
      options.push(...named);
    }
    if (q.field === "tag" && options.length < 2) return { ok: false, reason: "too_few_values", field: q.field };
    if (q.field === "thread" && options.length < 1) return { ok: false, reason: "too_few_values", field: q.field };
    if (q.field === "country") {
      if (options.length !== 2) return { ok: false, reason: "too_few_values", field: q.field };
      // One of the two is where the account says they are. The other is what
      // the thread says, which only the model can read; but two countries
      // neither of which is theirs is a question nobody asked for.
      const account = await trx
        .selectFrom("accounts")
        .select("country")
        .where("id", "=", ctx.accountId)
        .executeTakeFirst();
      const theirs = account?.country?.toUpperCase();
      if (!theirs || !options.some((o) => o.value === theirs) || !options.every((o) => isCountry(o.value!))) {
        return { ok: false, reason: "not_their_country", field: q.field };
      }
    }
    options.push({ label: ESCAPE_LABEL, value: null });

    let dimension: string | undefined;
    if (q.field === "tag") {
      // The dimension is the thread's: one its rows already use, or one its
      // own notes name. Anything else is a word from somewhere else landing in
      // offload's sentence.
      dimension = dimensionOf(options[0]!.value!) ?? undefined;
      if (!dimension || !options.every((o) => o.value === null || dimensionOf(o.value) === dimension)) {
        return { ok: false, reason: "bad_dimension", field: q.field };
      }
      if (!threadId || !(await threadHasDimension(trx, threadId, ctx.accountId, dimension))) {
        return { ok: false, reason: "bad_dimension", field: q.field };
      }
    }

    if (threadId && (await forbidden(trx, threadId, ctx.accountId, q.field))) {
      return { ok: false, reason: "forbidden_by_note", field: q.field };
    }

    const text = renderText(q.field, title, dimension);
    if (text.length > QUESTION_TEXT_CHARS) return { ok: false, reason: "bad_value", field: q.field };
    rows.push({ field: q.field, text, options, targetContentId, targetNoteId });
  }
  return { ok: true, rows };
}

/** The answer's turn changed this thread. Recorded against the answering
 *  message the way a move or an edit is, so the turn wears the Done mark and
 *  the thread's pill, and the open panes reload: the turn filed nothing, and
 *  without this a typed "Friday at 10" settled with nothing on screen to say
 *  it had landed. */
export async function landedIn(trx: Trx, messageId: string | null, threadId: string): Promise<void> {
  if (!messageId) return;
  await trx
    .insertInto("message_threads")
    .values({ message_id: messageId, thread_id: threadId, landed: true })
    .onConflict((oc) => oc.columns(["message_id", "thread_id"]).doUpdateSet({ landed: true }))
    .execute();
}

/** 020. Whether this turn may ask which thread: the dump had no words, no
 *  thread was on screen, and the only row it wrote is the photo row named,
 *  sitting in the account's default thread. */
async function threadQuestionAllowed(
  trx: Trx,
  accountId: string,
  messageId: string,
  targetContentId: string | null,
  landed: { id: string; thread_id: string }[],
): Promise<boolean> {
  if (!targetContentId) return false;
  if (landed.length !== 1 || landed[0]!.id !== targetContentId) return false;
  const message = await trx
    .selectFrom("messages")
    .select(["text", "looking_at_thread_id"])
    .where("id", "=", messageId)
    .executeTakeFirst();
  if (!message || (message.text ?? "").trim() !== "" || message.looking_at_thread_id) return false;
  const account = await trx
    .selectFrom("accounts")
    .select("default_thread_id")
    .where("id", "=", accountId)
    .executeTakeFirst();
  if (!account?.default_thread_id || landed[0]!.thread_id !== account.default_thread_id) return false;
  const carries = await trx
    .selectFrom("content_blobs")
    .select("blob_id")
    .where("content_id", "=", targetContentId)
    .executeTakeFirst();
  return Boolean(carries);
}

/** 020. The threads offered, as the server knows them: accepted membership,
 *  live, not the one the row is in, named from the row and clipped to the
 *  label cap. Order as offered, up to the cap the caller already applied. */
async function threadOptions(
  trx: Trx,
  accountId: string,
  ids: string[],
  exceptThreadId: string | null,
): Promise<StoredOption[]> {
  if (ids.length === 0) return [];
  const rows = await trx
    .selectFrom("threads")
    .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
    .select(["threads.id as id", "threads.name as name"])
    .where("threads.id", "in", ids)
    .where("threads.deleted_at", "is", null)
    .where("thread_members.account_id", "=", accountId)
    .where("thread_members.state", "=", "accepted")
    .execute();
  const byId = new Map(rows.map((row) => [row.id, row.name]));
  const out: StoredOption[] = [];
  for (const id of ids) {
    const name = byId.get(id);
    if (!name || id === exceptThreadId) continue;
    out.push({ label: clip(name, OPTION_LABEL_CHARS), value: id });
  }
  return out;
}

/** The parser's own form of a value, which is what is stored and compared. */
function storedForm(field: Field, parsed: Record<string, string>): string {
  switch (field) {
    case "date":
      return parsed["day"]!;
    case "span":
      return `${parsed["from"]}/${parsed["to"]}`;
    case "time":
      return `${parsed["day"]}T${parsed["time"]}`;
    case "tag":
      return parsed["tag"]!;
    case "country":
      return parsed["country"]!;
    case "calendar":
      return parsed["calendar"]!;
    case "thread":
      return parsed["thread"]!;
  }
}

const DIMENSION = /^[a-z][a-z0-9_-]{0,23}$/;

/** Whether a dimension is one the thread already groups by: on its rows, or
 *  named as a word in a note of the person's own. */
async function threadHasDimension(trx: Trx, threadId: string, accountId: string, dimension: string): Promise<boolean> {
  if (!DIMENSION.test(dimension)) return false;
  const rows = await trx
    .selectFrom("content")
    .select("tags")
    .where("thread_id", "=", threadId)
    .where("deleted_at", "is", null)
    .where(sql<boolean>`exists (select 1 from unnest(tags) t where t like ${dimension + ":%"})`)
    .limit(1)
    .execute();
  if (rows.length > 0) return true;
  const notes = await ownNotes(trx, threadId, accountId);
  const word = new RegExp(`(^|[^a-z0-9])${dimension}s?([^a-z0-9]|$)`, "i");
  return notes.some((note) => word.test(note));
}

/** The thread's notes as the planner sees them: the person's own, not another
 *  member's, nothing derived from a connected app, nothing set aside. */
async function ownNotes(trx: Trx, threadId: string, accountId: string): Promise<string[]> {
  const notes = await trx
    .selectFrom("notes")
    .select("text")
    .where("scope", "=", "thread")
    .where("subject_id", "=", threadId)
    .where("account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .where("muted_at", "is", null)
    .where("derived_from_untrusted", "=", false)
    .execute();
  return notes.map((n) => n.text);
}

/** A note on the thread that forbids asking about this field. The prompt
 *  carries the rule; this is the second gate, so the prompt is not the only
 *  one. Coarse on purpose: "never ask" plus the field's word. */
async function forbidden(trx: Trx, threadId: string, accountId: string, field: Field): Promise<boolean> {
  const words: Record<Field, string[]> = {
    date: ["date", "dates", "when", "by when"],
    span: ["date", "dates"],
    time: ["time", "times", "when"],
    tag: ["tag", "tags", "genre", "city", "room"],
    country: ["country"],
    calendar: ["calendar", "calendars"],
    thread: ["thread", "threads", "where"],
  };
  const notes = await ownNotes(trx, threadId, accountId);
  return notes.some((note) => {
    const t = note.toLowerCase();
    return /never ask|don't ask|do not ask|no questions/.test(t) && words[field].some((w) => t.includes(w));
  });
}

// ---------------------------------------------------------------- the calendar question

/** 019. Which of the person's calendars a row goes on, raised by the server
 *  from inside `create_event` when the row's thread has several writable
 *  calendars picked, or none yet while the account has approved some.
 *
 *  **The label is a calendar's name**, the one label here not worded from its
 *  value: the person's own for a calendar they own, somebody else's words for
 *  one shared with them, which is why the question and the answer's message
 *  are marked untrusted in that case. The value is the calendar's id. */
export async function raiseCalendarQuestion(
  trx: Writer,
  input: {
    accountId: string;
    messageId: string;
    contentId: string;
    title: string;
    calendars: Array<{ id: string; name: string; owned: boolean }>;
    /** The thread had no calendar: the tap picks the one chosen for it. */
    picksOnAnswer: boolean;
    /** The turn has read a connected app, so the title it quotes may have a
     *  stranger's words in it. The taint is per turn, as 008 has it. */
    sawApps: boolean;
  },
): Promise<boolean> {
  const message = await trx
    .selectFrom("messages")
    .select(["conversation_id", "turn_id"])
    .where("id", "=", input.messageId)
    .where("account_id", "=", input.accountId)
    .executeTakeFirst();
  if (!message) return false;

  const options: StoredOption[] = [];
  for (const calendar of input.calendars.slice(0, MAX_VALUES)) {
    const value = calendar.id.toLowerCase();
    if (!UUID.test(value) || options.some((o) => o.value === value)) continue;
    options.push({ label: clip(calendar.name, OPTION_LABEL_CHARS), value });
  }
  if (options.length === 0) return false;
  options.push({ label: ESCAPE_LABEL, value: null });

  const text = renderText("calendar", input.title);
  await storeQuestions(
    trx,
    [{ field: "calendar", text, options, targetContentId: input.contentId, targetNoteId: null }],
    {
      accountId: input.accountId,
      conversationId: message.conversation_id,
      messageId: input.messageId,
      turnId: message.turn_id,
      derivedFromUntrusted: input.sawApps || input.calendars.some((calendar) => !calendar.owned),
    },
  );
  if (input.picksOnAnswer) {
    await trx
      .updateTable("questions")
      .set({ previous_value: JSON.stringify({ picks: true }) })
      .where("turn_id", "=", message.turn_id)
      .where("field", "=", "calendar")
      .execute();
  }
  return true;
}

/** A typed answer to a calendar question: the text, trimmed and lowercased,
 *  equal to or a prefix of exactly one offered label. No model. Anything else
 *  is null, and the caller closes the question. */
export function matchCalendarLabel(text: string, options: StoredOption[]): number | null {
  const typed = text.trim().toLowerCase();
  if (!typed) return null;
  const hits = options
    .map((option, index) => ({ option, index }))
    .filter(({ option }) => option.value !== null && option.label.toLowerCase().startsWith(typed));
  return hits.length === 1 ? hits[0]!.index : null;
}

// ---------------------------------------------------------------- store

export async function storeQuestions(
  trx: Writer,
  rows: Validated[],
  ctx: {
    accountId: string;
    conversationId: string;
    messageId: string;
    turnId: string;
    derivedFromUntrusted: boolean;
  },
): Promise<void> {
  // One open per conversation. A question still open from an earlier turn in
  // this conversation closes now: the next turn closes the last one whatever
  // it says, and this is the next turn.
  await trx
    .updateTable("questions")
    .set({ state: "closed", settled_at: sql`now()` })
    .where("conversation_id", "=", ctx.conversationId)
    .where("state", "in", ["open", "pending"])
    .where("turn_id", "<>", ctx.turnId)
    .execute();

  for (const [i, row] of rows.entries()) {
    await trx
      .insertInto("questions")
      .values({
        account_id: ctx.accountId,
        conversation_id: ctx.conversationId,
        message_id: ctx.messageId,
        turn_id: ctx.turnId,
        ordinal: i + 1,
        field: row.field,
        target_content_id: row.targetContentId,
        target_note_id: row.targetNoteId,
        text: row.text,
        options: JSON.stringify(row.options),
        state: i === 0 ? "open" : "pending",
        derived_from_untrusted: ctx.derivedFromUntrusted,
      })
      .onConflict((oc) => oc.columns(["turn_id", "ordinal"]).doNothing())
      .execute();
  }
}

// ---------------------------------------------------------------- read

function onWire(row: {
  id: string;
  field: string;
  text: string;
  options: unknown;
  ordinal: number;
}): QuestionOnWire {
  const options = Array.isArray(row.options) ? (row.options as StoredOption[]) : [];
  return {
    id: row.id,
    field: row.field as Field,
    text: row.text,
    options: options.map((o) => ({ label: o.label, kind: o.value === null ? "plain" : "value" })),
    ordinal: row.ordinal,
  };
}

/** The open question for each message, for the envelope. One query for a page,
 *  the same shape `waitingFor` takes. */
export async function questionsFor(accountId: string, messageIds: string[]): Promise<Map<string, QuestionOnWire>> {
  const out = new Map<string, QuestionOnWire>();
  if (messageIds.length === 0) return out;
  const rows = await db
    .selectFrom("questions")
    .select(["id", "message_id", "field", "text", "options", "ordinal"])
    .where("account_id", "=", accountId)
    .where("message_id", "in", messageIds)
    .where("state", "=", "open")
    .execute();
  for (const row of rows) out.set(row.message_id, onWire(row));
  return out;
}

/** The open question in a conversation, if any, for the job that reads it. */
export async function openQuestionIn(trx: Trx, conversationId: string): Promise<string | null> {
  const row = await trx
    .selectFrom("questions")
    .select("id")
    .where("conversation_id", "=", conversationId)
    .where("state", "=", "open")
    .executeTakeFirst();
  return row?.id ?? null;
}

// ---------------------------------------------------------------- close

export async function closeOpenQuestions(
  trx: Trx,
  where: { conversationId: string } | { accountId: string; exceptConversationId: string },
): Promise<void> {
  let q = trx
    .updateTable("questions")
    .set({ state: "closed", settled_at: sql`now()` })
    .where("state", "in", ["open", "pending"]);
  if ("conversationId" in where) q = q.where("conversation_id", "=", where.conversationId);
  else q = q.where("account_id", "=", where.accountId).where("conversation_id", "<>", where.exceptConversationId);
  await q.execute();
}

/** Close one question, if it is still open. Returns whether it was. */
export async function closeQuestion(
  trx: Trx,
  questionId: string,
  accountId: string,
  settlingMessageId: string | null = null,
): Promise<boolean> {
  const done = await trx
    .updateTable("questions")
    .set({ state: "closed", settled_at: sql`now()` })
    .where("id", "=", questionId)
    .where("account_id", "=", accountId)
    .where("state", "=", "open")
    .returning("id")
    .executeTakeFirst();
  if (done) await promotePending(trx, questionId, settlingMessageId);
  return done !== undefined;
}

/** The open question on one message, read inside a transaction that may have
 *  just opened it. `questionsFor` reads through the pool and would not see it. */
export async function openQuestionOn(trx: Trx, accountId: string, messageId: string): Promise<QuestionOnWire | null> {
  const row = await trx
    .selectFrom("questions")
    .select(["id", "message_id", "field", "text", "options", "ordinal"])
    .where("account_id", "=", accountId)
    .where("message_id", "=", messageId)
    .where("state", "=", "open")
    .executeTakeFirst();
  return row ? onWire(row) : null;
}

/** The turn's second question, once the first has settled by any path. */
/** The turn's second question opens when the first settles, **on the message
 *  that settled it**: the envelope of the answering message is what every
 *  client reads next, a tap's response and a typed answer's stream alike, so
 *  the second question hangs off that message rather than the one that asked. */
async function promotePending(trx: Trx, settledId: string, answeringMessageId: string | null): Promise<void> {
  const settled = await trx
    .selectFrom("questions")
    .select(["turn_id", "conversation_id"])
    .where("id", "=", settledId)
    .executeTakeFirst();
  if (!settled) return;
  await trx
    .updateTable("questions")
    .set({ state: "open", ...(answeringMessageId ? { message_id: answeringMessageId } : {}) })
    .where("turn_id", "=", settled.turn_id)
    .where("state", "=", "pending")
    .execute();
}

// ---------------------------------------------------------------- apply

export type Applied =
  | { applied: true; field: Field; threadId: string | null }
  | { applied: false; reason: "not_open" | "gone" | "already_set" | "bad_value" | "no_target" };

/** Fill the one field on the one row the question was about, and settle the
 *  question. No model. The previous value is kept for Undo.
 *
 *  `answerTurnId` is the turn the answer is written under, so `undoTurn` can
 *  find it; `answeredMessageId` is the person's message that answered. */
export async function applyAnswer(
  trx: Trx,
  questionId: string,
  accountId: string,
  value: Record<string, string>,
  by: { answeredMessageId: string | null; answerTurnId: string | null; option: number | null },
): Promise<Applied> {
  const q = await trx
    .selectFrom("questions")
    .selectAll()
    .where("id", "=", questionId)
    .where("account_id", "=", accountId)
    .where("state", "=", "open")
    .forUpdate()
    .executeTakeFirst();
  if (!q) return { applied: false, reason: "not_open" };

  const field = q.field as Field;
  // 019. A calendar answer reaches Google and cannot run inside this
  // transaction; the answer route handles it on its own path.
  if (field === "calendar") return { applied: false, reason: "bad_value" };
  const parsed = parseValue(field, value);
  if (!parsed) return { applied: false, reason: "bad_value" };
  // A tag or a country is one of the values offered, checked here as well as
  // in the worker: the internal route is a second writer, and a set enforced
  // in one place is a set until there is a second writer.
  if (field === "tag" || field === "country" || field === "thread") {
    const offered = Array.isArray(q.options) ? (q.options as StoredOption[]) : [];
    if (!offered.some((o) => o.value !== null && o.value === storedForm(field, parsed))) {
      return { applied: false, reason: "bad_value" };
    }
  }

  const settle = (extra: Record<string, unknown>) =>
    trx
      .updateTable("questions")
      .set({
        state: "answered",
        settled_at: sql`now()`,
        answered_option: by.option,
        answered_message_id: by.answeredMessageId,
        answer_turn_id: by.answerTurnId,
        ...extra,
      })
      .where("id", "=", q.id)
      .execute();

  if (field === "country") {
    await settle({ previous_value: null });
    await promotePending(trx, q.id, by.answeredMessageId);
    return { applied: true, field, threadId: null };
  }

  // 020. The thread answer is a move, through the same function a move by
  // hand runs, so the wraps follow the picture. A row already moved by hand
  // is a question beside the point, and closes.
  if (field === "thread") {
    if (!q.target_content_id) return { applied: false, reason: "no_target" };
    const row = await trx
      .selectFrom("content")
      .select(["id", "thread_id"])
      .where("id", "=", q.target_content_id)
      .where("deleted_at", "is", null)
      .forUpdate()
      .executeTakeFirst();
    const account = await trx
      .selectFrom("accounts")
      .select("default_thread_id")
      .where("id", "=", accountId)
      .executeTakeFirst();
    if (!row) {
      await trx.updateTable("questions").set({ state: "closed", settled_at: sql`now()` }).where("id", "=", q.id).execute();
      await promotePending(trx, q.id, by.answeredMessageId);
      return { applied: false, reason: "gone" };
    }
    if (row.thread_id !== account?.default_thread_id || row.thread_id === parsed["thread"]) {
      await trx.updateTable("questions").set({ state: "closed", settled_at: sql`now()` }).where("id", "=", q.id).execute();
      await promotePending(trx, q.id, by.answeredMessageId);
      return { applied: false, reason: "already_set" };
    }
    try {
      await moveContentIn(trx, accountId, row.id, parsed["thread"]!);
    } catch (error) {
      if (error instanceof NotYours) {
        await trx.updateTable("questions").set({ state: "closed", settled_at: sql`now()` }).where("id", "=", q.id).execute();
        await promotePending(trx, q.id, by.answeredMessageId);
        return { applied: false, reason: "gone" };
      }
      throw error;
    }
    await landedIn(trx, by.answeredMessageId, parsed["thread"]!);
    await settle({ previous_value: JSON.stringify({ thread_id: row.thread_id }) });
    await promotePending(trx, q.id, by.answeredMessageId);
    return { applied: true, field, threadId: parsed["thread"]! };
  }

  if (q.target_content_id) {
    const row = await trx
      .selectFrom("content")
      .select(["id", "thread_id", "type", "due_at", "occurs_at", "occurs_end_at", "tags", "updated_at"])
      .where("id", "=", q.target_content_id)
      .where("deleted_at", "is", null)
      .forUpdate()
      .executeTakeFirst();
    if (!row) {
      await trx.updateTable("questions").set({ state: "closed", settled_at: sql`now()` }).where("id", "=", q.id).execute();
      await promotePending(trx, q.id, by.answeredMessageId);
      return { applied: false, reason: "gone" };
    }
    const previous = { due_at: row.due_at, occurs_at: row.occurs_at, occurs_end_at: row.occurs_end_at, tags: row.tags };
    const set = contentPatch(field, parsed, row);
    if (set === null) {
      await trx.updateTable("questions").set({ state: "closed", settled_at: sql`now()` }).where("id", "=", q.id).execute();
      await promotePending(trx, q.id, by.answeredMessageId);
      return { applied: false, reason: "already_set" };
    }
    await trx.updateTable("content").set({ ...set, updated_at: sql`now()` }).where("id", "=", row.id).execute();
    await touchThread(row.thread_id, trx);
    await landedIn(trx, by.answeredMessageId, row.thread_id);
    await settle({ previous_value: JSON.stringify(previous) });
    await promotePending(trx, q.id, by.answeredMessageId);
    return { applied: true, field, threadId: row.thread_id };
  }

  if (q.target_note_id) {
    const row = await trx
      .selectFrom("notes")
      .select(["id", "subject_id", "due_at", "occurs_at", "occurs_end_at"])
      .where("id", "=", q.target_note_id)
      .where("deleted_at", "is", null)
      .forUpdate()
      .executeTakeFirst();
    if (!row) {
      await trx.updateTable("questions").set({ state: "closed", settled_at: sql`now()` }).where("id", "=", q.id).execute();
      await promotePending(trx, q.id, by.answeredMessageId);
      return { applied: false, reason: "gone" };
    }
    const previous = { due_at: row.due_at, occurs_at: row.occurs_at, occurs_end_at: row.occurs_end_at };
    const set = notePatch(field, parsed, row);
    if (set === null) {
      await trx.updateTable("questions").set({ state: "closed", settled_at: sql`now()` }).where("id", "=", q.id).execute();
      await promotePending(trx, q.id, by.answeredMessageId);
      return { applied: false, reason: "already_set" };
    }
    await trx.updateTable("notes").set({ ...set, updated_at: sql`now()` }).where("id", "=", row.id).execute();
    if (row.subject_id) {
      await touchThread(row.subject_id, trx);
      await landedIn(trx, by.answeredMessageId, row.subject_id);
    }
    await settle({ previous_value: JSON.stringify(previous) });
    await promotePending(trx, q.id, by.answeredMessageId);
    return { applied: true, field, threadId: row.subject_id };
  }

  return { applied: false, reason: "no_target" };
}

const day = (d: string) => new Date(`${d}T00:00:00Z`);
const moment = (d: string, t: string) => new Date(`${d}T${t}:00Z`);

/** What the value sets on a content row, or null when the field was already
 *  filled by hand since the question was asked. */
function contentPatch(
  field: Field,
  v: Record<string, string>,
  row: { type: string; due_at: Date | null; occurs_at: Date | null; occurs_end_at: Date | null; tags: string[] },
): Record<string, unknown> | null {
  switch (field) {
    case "date":
      if (row.type === "task") return row.due_at ? null : { due_at: day(v["day"]!) };
      return row.occurs_at ? null : { occurs_at: day(v["day"]!) };
    case "span":
      return row.occurs_at ? null : { occurs_at: day(v["from"]!), occurs_end_at: day(v["to"]!) };
    case "time":
      return row.occurs_at ? null : { occurs_at: moment(v["day"]!, v["time"]!) };
    case "tag": {
      const tag = v["tag"]!;
      const dim = dimensionOf(tag);
      if (dim && row.tags.some((t) => t.startsWith(`${dim}:`))) return null;
      if (row.tags.includes(tag)) return null;
      if (row.tags.length >= MAX_TAGS) return null;
      return { tags: [...row.tags, tag] };
    }
    case "country":
    case "calendar":
    case "thread":
      // Handled before this is reached: country fills nothing, a calendar
      // writes through 012, a thread moves.
      return null;
  }
}

function notePatch(
  field: Field,
  v: Record<string, string>,
  row: { due_at: Date | null; occurs_at: Date | null; occurs_end_at: Date | null },
): Record<string, unknown> | null {
  switch (field) {
    case "date":
      return row.occurs_at ? null : { occurs_at: day(v["day"]!) };
    case "span":
      return row.occurs_at ? null : { occurs_at: day(v["from"]!), occurs_end_at: day(v["to"]!) };
    case "time":
      return row.occurs_at ? null : { occurs_at: moment(v["day"]!, v["time"]!) };
    default:
      return null;
  }
}

/** Undo of an answer's turn: the previous value back on the row. The question
 *  stays answered. */
export async function restoreAnswers(trx: Trx, accountId: string, answerTurnId: string): Promise<void> {
  const rows = await trx
    .selectFrom("questions")
    .select(["id", "target_content_id", "target_note_id", "previous_value"])
    .where("answer_turn_id", "=", answerTurnId)
    .where("account_id", "=", accountId)
    .where("state", "=", "answered")
    .execute();
  for (const q of rows) {
    const previous = (q.previous_value ?? null) as Record<string, unknown> | null;
    if (!previous) continue;
    // 020. A thread answer is undone by moving the row back, wraps and all.
    if (typeof previous["thread_id"] === "string" && q.target_content_id) {
      try {
        await moveContentIn(trx, accountId, q.target_content_id, previous["thread_id"]);
      } catch (error) {
        // The row is gone, or the thread it came from is. Nothing to put back.
        if (!(error instanceof NotYours)) throw error;
      }
      continue;
    }
    // 019. A calendar answer's write was taken back at Google before this
    // transaction, which cleared the row's `source_ref`; what is left to undo
    // is the pick the tap made for the thread, if it made one.
    if (previous["picks"] === true && q.target_content_id) {
      const row = await trx
        .selectFrom("content")
        .select(["thread_id", "source_ref"])
        .where("id", "=", q.target_content_id)
        .executeTakeFirst();
      if (row && row.source_ref === null) {
        await trx
          .deleteFrom("thread_calendars")
          .where("thread_id", "=", row.thread_id)
          .where("account_id", "=", accountId)
          .where("calendar_id", "=", previous["calendar"] as string)
          .execute();
      }
      continue;
    }
    const back = {
      due_at: (previous["due_at"] as string | null) ?? null,
      occurs_at: (previous["occurs_at"] as string | null) ?? null,
      occurs_end_at: (previous["occurs_end_at"] as string | null) ?? null,
    };
    if (q.target_content_id) {
      await trx
        .updateTable("content")
        .set({ ...back, ...(Array.isArray(previous["tags"]) ? { tags: previous["tags"] as string[] } : {}), updated_at: sql`now()` })
        .where("id", "=", q.target_content_id)
        .execute();
    } else if (q.target_note_id) {
      await trx.updateTable("notes").set({ ...back, updated_at: sql`now()` }).where("id", "=", q.target_note_id).execute();
    }
  }
}

/** Undo of the asking turn: its questions close. */
export async function closeQuestionsOfTurn(trx: Trx, accountId: string, turnId: string): Promise<void> {
  await trx
    .updateTable("questions")
    .set({ state: "closed", settled_at: sql`now()` })
    .where("turn_id", "=", turnId)
    .where("account_id", "=", accountId)
    .where("state", "in", ["open", "pending"])
    .execute();
}

/** The label of an option, for the person's own turn in the log. */
export async function optionLabel(trx: Trx, accountId: string, questionId: string, index: number): Promise<{ label: string; value: string | null; field: Field } | null> {
  const q = await trx
    .selectFrom("questions")
    .select(["field", "options"])
    .where("id", "=", questionId)
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  if (!q || !Array.isArray(q.options)) return null;
  const option = (q.options as StoredOption[])[index];
  if (!option) return null;
  return { label: option.label, value: option.value, field: q.field as Field };
}
