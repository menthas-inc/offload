// Threads, content and notes, from a phone.
//
// The web's `lib/threads.ts` in the shape this app already has: every call goes
// through `send`, which carries the session out of secure storage and sets a
// content type only when there is a body.
//
// **The types are the API's, not a second opinion about it.** Where the server
// computes something the screen would otherwise have to work out, `canDelete`,
// `isDefault`, `authorIsMember`, the phone renders the answer rather than
// deriving one. A client that decides who may delete something is a client that
// can disagree with the server, and the server is the one that enforces it.

import { typedAddress } from "./typed-row";
import type { Label } from "./labels";
import { send } from "./api";
import { onSignedOut } from "./session-end";
import type { Invitation } from "./people";
import type { LooseSummary } from "./loose";
import type { Layout, Reminders, Sortable, ThreadLook } from "@offload/widgets";
import { orderThreads, provisionalId, type ThreadSort } from "@offload/widgets";

export { domainOf, isProvisional, provisionalId, rangeOf, startsAs } from "@offload/widgets";

export interface ThreadRow {
  id: string;
  name: string;
  /** 037. One of the seventy thread icons, or lasso, and one of the ten hues. */
  icon: string;
  hue: number;
  count: number;
  meta: string;
  /** Always false since 028, which took the default thread out of the list.
   *  Kept because the server still sends it. */
  isDefault: boolean;
  /** 2026-10-07. Everybody else in it, by name: a shared thread is left,
   *  not deleted, and the question names who it stays with. */
  others?: string[];
  /** 2026-10-29. The same people, as faces for the tile's corner. Absent from
   *  an API from before. */
  faces?: { accountId: string; initials: string }[];
  /** 2026-10-29. When it was made, for newest first at the press. */
  createdAt?: string;
}

/** 2026-10-29. One group: Older threads went with the grid. */
export interface ThreadGroup {
  key: "now";
  threads: ThreadRow[];
}

/** How My threads is ordered, and the person's own order as it is kept. */
export interface ThreadOrder {
  sort: ThreadSort;
  ids: string[];
}

export interface Member {
  accountId: string;
  displayName: string;
  initials: string;
  isYou: boolean;
}

/** A sentence a thread holds about itself: what is true about it, and
 *  sometimes how it is handled. */
export interface Note {
  id: string;
  /** 025. The note's live labels, by id, in the thread's label order. */
  labels: string[];
  text: string;
  /** What was dumped when it did not fit in 200 characters. Never in a prompt,
   *  and never on the row. */
  body: string | null;
  origin: "stated" | "learned";
  authorId: string | null;
  /** False once the author left or deleted their account, at which point every
   *  member may delete it. Computed server-side. */
  authorIsMember: boolean;
  muted: boolean;
  /** 042. The author's Remind me on a dated note, as on a row. */
  reminders?: Reminders | undefined;
  occursAt: string | null;
  occursEndAt: string | null;
  dueAt: string | null;
  placeId: string | null;
  /** Where it sits in the section, 0 to 100 and higher first. Moved by
   *  dragging the row, and by nothing else. */
  priority: number;
  /** The date carries no time, so nothing may draw one. */
  allDay: boolean;
  /** That it comes round again. One note, a mark on every matching day. 023:
   *  an RFC 5545 rule, anchored on the occurrence. */
  rrule: string | null;
  /** When it was last written. Decides which notes reach offload when a thread
   *  holds more than the budget. */
  writtenAt: string;
  /** When it was put down, which nothing changes. 028 sorts and dates the
   *  notes that are not in a thread by it. */
  createdAt: string;
  supersededAt: string | null;
}

/** A hundred, matching NOTE_PROMPT_BUDGET. **Not a cap**: it is how many of a
 *  thread's notes reach offload, and nothing refuses the next one. */
export const NOTE_BUDGET = 100;
export const NOTE_CHARS = 200;
export const NOTE_BODY_CHARS = 4000;

export interface ThreadBundle {
  id: string;
  name: string;
  icon: string;
  hue: number;
  /** 037. Whose pick the icon and hue are. Edit thread previews a rename's
   *  pick only while it is still offload's. */
  iconSetBy: "offload" | "person";
  alwaysOn: boolean;
  /** `unlabelled` is 025's No label count. */
  counts: { active: number; archived: number; unlabelled: number };
  members: Member[];
  /** 025. The thread's labels in the order they were made, with counts. */
  labels: Label[];
  notes: Note[];
  noteCounts: { active: number; folded: number };
  preference: { widgets?: string[]; hideDone?: boolean };
  standing: string | null;
  /** 022. False on the account's default thread, where Share is not drawn. */
  shareable: boolean;
  /** 028. The caller's own default thread, which is never drawn as a thread:
   *  the screen opens Not in a thread in its place. */
  isDefault: boolean;
  /** 019. The viewer's picks and approved count, and whether anybody has
   *  picked here, which earns the rail. Null when the account has no calendar
   *  connection at all, which hides the glyph. */
  calendars: { picked: number; total: number; anyPicked: boolean } | null;
  /** 030. One live thing in the thread has a point: earns the switch. */
  hasPoint: boolean;
  /** Thread layouts (2026-10-19): how the page is laid out, whose pick it is,
   *  the one suggestion the line draws, and the heads-up another member sees
   *  once after somebody else switched. */
  layout: Layout;
  layoutSetBy: "offload" | "person";
  layoutSuggestion: Exclude<Layout, "default"> | null;
  layoutChange: { by: { accountId: string; displayName: string }; layout: Layout; at: string } | null;
}

/** Thread layouts: what a layout switch did, so one Undo sends it back. */
export interface LayoutChange {
  previous: { layout: Layout; layoutSetBy: "offload" | "person" };
  made: string[];
  dropped: string[];
}

/** A layout needs more labels than the thread can still hold (server 409).
 *  `needed` is how many it would make, `free` how many slots remain. */
export interface LayoutLabelsFull {
  labelsFull: { needed: number; free: number };
}

export type ThreadEdited = { thread: ThreadLook & { id: string }; previous: ThreadLook; layout?: LayoutChange };

export const isLabelsFull = (result: ThreadEdited | LayoutLabelsFull): result is LayoutLabelsFull =>
  "labelsFull" in result;

/** The body Edit thread's Save sends: the look, and the layout with its Undo. */
export type ThreadEdit = Partial<ThreadLook> & {
  layout?: Layout;
  layoutSetBy?: "offload" | "person";
  undoLabels?: { remove: string[]; restore: string[] };
};

/** 019. One of the viewer's approved calendars, against a thread. */
export interface ThreadCalendar {
  id: string;
  name: string;
  colour: string | null;
  writable: boolean;
  sharedWithYou: boolean;
  primary: boolean;
  picked: boolean;
  /** The account's address, when two rows share a name. */
  note: string | null;
}

export interface ThreadCalendars {
  calendars: ThreadCalendar[];
  /** Other members with picks here: named, their calendars counted. */
  others: Array<{ displayName: string; count: number }>;
}

/** 019. An event on one of the thread's calendars, for the rail. A title, a
 *  time and, while the map is on, where it is (030): never the guests, their
 *  answers or the description. */
export interface ThreadEvent {
  id: string;
  sourceRef: string;
  calendarId: string;
  calendarName: string;
  colour: string | null;
  title: string;
  occursAt: string | null;
  occursEndAt: string | null;
  allDay: boolean;
  untrusted: boolean;
  /** 027. False when the viewer neither made it nor was invited to it. */
  involved?: boolean;
  /** 030. Where it is, in the calendar's words, and its point. */
  location: string | null;
  place: { id: string; lat: number | null; lng: number | null; approximate: boolean } | null;
}

/** 030. Where a row is, and nothing Google named: its name and address are
 *  neither kept nor sent. The coordinates are null once they age past thirty
 *  days, until a map asks for them again. */
export interface Place {
  id: string;
  lat: number | null;
  lng: number | null;
  approximate: boolean;
}

/** Satisfies `Sortable` so the shared widget rule takes it unchanged. */
/** What a tap on a row does. 2026-09-29: the row's tools moved into its edit
 *  sheet, so a tap opens it. A link with an address keeps the tap for its
 *  page and reaches the sheet from its ellipsis. Somebody else's row cannot
 *  be edited, so it opens the action sheet, which holds Archive. */
export function rowTap(row: Pick<ContentRow, "type" | "url" | "archivedAt" | "canDelete">): "open" | "edit" | "actions" {
  if (row.type === "link" && row.url && !row.archivedAt) return "open";
  return row.canDelete ? "edit" : "actions";
}

export interface ContentRow extends Sortable {
  id: string;
  type: string;
  title: string;
  body: string | null;
  /** Where it came from, when it came from a page. The row opens it, which is
   *  the whole reason somebody dumps a link. Null on everything else. */
  url: string | null;
  /** A picture the page publishes about itself, as an address. **Loaded from
   *  the site by this device**, so the site learns who looked and when: that is
   *  the cost of the cheap shape and it is disclosed in the privacy policy
   *  rather than hidden in a comment. Null on everything that is not a link. */
  imageUrl: string | null;
  /** 020. The picture a photo row carries, as the id a rendition URL is built
   *  from. `ready` is whether the renditions exist yet. Null on everything
   *  that is not a photo. */
  /** 020, 041. A photo's dimensions, or a PDF's pages and whether it opens. */
  photo: {
    blobId: string;
    kind: "image" | "pdf";
    width?: number;
    height?: number;
    pages?: number;
    openable?: boolean;
    unreadable?: boolean;
    ready: boolean;
  } | null;
  /** 044. Up to two links the PDF carried, offered beside it. Null on a row
   *  that is not a PDF or carries none; absent on an older shape. */
  actions?: { label: string; url: string }[] | null;
  createdAt: string;
  archivedAt: string | null;
  doneAt: string | null;
  dueAt: string | null;
  occursAt: string | null;
  /** The other end of a span, so the rail draws a thing on every day it
   *  covers. Written since 0011 and read by nothing until 015. */
  occursEndAt: string | null;
  /** That it comes round again, as a rule the calendar expands. One row, a
   *  mark on every matching day. 023: an RFC 5545 rule in the closed grammar
   *  of `@offload/widgets`, the server's own serialisation. */
  rrule: string | null;
  isReminder: boolean;
  /** 042. The author's Remind me: on while offload will remind them, off once
   *  they stopped it, null otherwise and to anybody else. */
  reminders?: Reminders | undefined;
  /** 023. Written to a calendar, so its time is Google's: no When on it. */
  onCalendar: boolean;
  priority: number;
  priorityPinned: boolean;
  /** 025. The row's live labels, by id, in the thread's label order. */
  labels: string[];
  place: Place | null;
  /** 030. An event's location, in offload's own words. */
  location: string | null;
  placeId: string | null;
  /** The repeating series this occurrence belongs to, or null for a one off.
   *  A timeline collapses a series to one entry; a calendar draws every one. */
  seriesRef: string | null;
  /** The date carries no time, so nothing may draw one. */
  allDay: boolean;
  author: { accountId: string | null; displayName: string; isYou: boolean };
  canDelete: boolean;
  canMove: boolean;
  /** Typed straight in and not read by offload yet. */
  filingAt: string | null;
}

export interface ContentPage {
  /** `ticked` only when the label's list asked, with `ticksFor`. */
  rows: (ContentRow & { ticked?: boolean })[];
  nextCursor: string | null;
}

/** The shared rule asks whether a row has a place; the API sends the place
 *  itself. One line, once, at the edge, exactly as the web does it. */
export const withPlaceId = (row: ContentRow): ContentRow => ({
  ...row,
  placeId: row.place?.id ?? null,
});

// ------------------------------------------------------------------- reads

/** 037. The list sends a thread's icon as `threadIcon` and `threadHue`: its
 *  `icon` is held at lasso for builds from before the icons existed. Read
 *  here, once, into the row every screen draws. */
type WireRow = Omit<ThreadRow, "hue"> & { threadIcon?: string; threadHue?: number };
type WireGroup = Omit<ThreadGroup, "threads"> & { threads: WireRow[] };

const drawn = (groups: WireGroup[]): ThreadGroup[] =>
  groups.map((group) => ({
    ...group,
    threads: group.threads.map(({ threadIcon, threadHue, ...row }) => ({ ...row, icon: threadIcon ?? row.icon, hue: threadHue ?? 1 })),
  }));

export async function fetchThreads(): Promise<ThreadGroup[]> {
  const { data } = await send<{ groups: WireGroup[] }>("/v1/threads");
  return data ? drawn(data.groups) : [];
}

export interface ThreadsPage {
  groups: ThreadGroup[];
  invitations: Invitation[];
  /** 028. What is not in a thread, or null when there is nothing to draw. */
  loose: LooseSummary | null;
  /** 2026-10-29. Newest first until a person drags one. */
  order: ThreadOrder;
}

/** 022. The list and the strips in one read, which is what My threads draws.
 *  028: and the group of what is not in a thread. */
export async function fetchThreadsAndInvitations(): Promise<ThreadsPage | null> {
  const { data } = await send<Partial<Omit<ThreadsPage, "groups">> & { groups?: WireGroup[] }>("/v1/threads");
  if (!data) return null;
  return {
    groups: drawn(data.groups ?? []),
    invitations: data.invitations ?? [],
    loose: data.loose ?? null,
    order: data.order ?? { sort: "newest", ids: [] },
  };
}

/** 2026-10-29. A drop sends the whole list as the person's order; the chip
 *  sends the sort alone, which keeps the list. */
export async function putThreadOrder(sort: ThreadSort, ids?: string[]): Promise<boolean> {
  const { status } = await send("/v1/threads/order", { method: "PATCH", ...body(ids ? { sort, ids } : { sort }) });
  return status >= 200 && status < 300;
}

/** My threads in its order, and whether there is nothing at all: the empty
 *  state is drawn only with no thread and nothing loose. */
export function myThreads(groups: ThreadGroup[], loose: LooseSummary | null, order: ThreadOrder): { threads: ThreadRow[]; empty: boolean } {
  const all = groups.flatMap((group) => group.threads);
  const threads = all.every((thread) => thread.createdAt) ? orderThreads(all as (ThreadRow & { createdAt: string })[], order.sort, order.ids) : all;
  return { threads, empty: threads.length === 0 && (loose?.count ?? 0) === 0 };
}

export async function fetchThread(id: string): Promise<ThreadBundle | null> {
  const { data } = await send<ThreadBundle>(`/v1/threads/${id}`);
  if (data) looks.set(data.id, { icon: data.icon, hue: data.hue });
  return data;
}

/** 037. The icon and hue of a thread this session has read, for the one place
 *  that names a thread by id with no read of its own: the composer's *In
 *  thread* chip, raised from a thread already on screen. */
const looks = new Map<string, { icon: string; hue: number }>();
onSignedOut(() => looks.clear());

export const threadLookOf = (id: string): { icon: string; hue: number } | undefined => looks.get(id);

/** 030. A point on a thread's map, as the server draws it: offload's own
 *  title and address, Google's id only for Directions, nothing Google named. */
export interface Point {
  key: string;
  source: "row" | "calendar";
  contentId: string | null;
  type: string;
  title: string;
  address: string | null;
  approximate: boolean;
  lat: number;
  lng: number;
  googlePlaceId: string | null;
  labelIds: string[];
  when: { at: string; endAt: string | null; allDay: boolean } | null;
  url: string | null;
  imageUrl: string | null;
  authorId: string | null;
  calendarName: string | null;
}

/** 030. One row, for the place sheet's Edit when the row is not on the page. */
export async function fetchOne(id: string): Promise<ContentRow | null> {
  const { data } = await send<ContentRow>(`/v1/content/${id}`);
  return data ? withPlaceId(data) : null;
}

/** 030. A thread's points. `pending` counts places being fetched again, and
 *  a reader that gets more than none reads once more a moment later. */
export async function fetchPoints(id: string): Promise<{ points: Point[]; pending: number } | null> {
  const { data } = await send<{ points: Point[]; pending: number }>(`/v1/threads/${id}/points`);
  return data;
}

export async function fetchThreadCalendars(id: string): Promise<ThreadCalendars | null> {
  const { data } = await send<ThreadCalendars>(`/v1/threads/${id}/calendars`);
  return data;
}

export async function setThreadCalendar(
  threadId: string,
  calendarId: string,
  picked: boolean
): Promise<ThreadCalendars | null> {
  const { data } = await send<ThreadCalendars>(`/v1/threads/${threadId}/calendars/${calendarId}`, {
    method: "PATCH",
    ...body({ picked }),
  });
  return data;
}

/** The events on the thread's calendars between two days, inclusive. */
/** Null when the read failed, so a month can be asked for again. */
export async function fetchThreadEvents(threadId: string, from: string, to: string): Promise<ThreadEvent[] | null> {
  const { data } = await send<{ events: ThreadEvent[] }>(`/v1/threads/${threadId}/events?from=${from}&to=${to}`);
  return data?.events ?? null;
}

export async function fetchContent(
  threadId: string,
  options: { cursor?: string; archived?: boolean; labels?: string[]; unlabelled?: boolean; ticksFor?: string } = {}
): Promise<ContentPage | null> {
  const query = new URLSearchParams();
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.archived) query.set("archived", "true");
  // 025. The filter bar's pick, read on the server because the list is paged.
  if (options.labels?.length) query.set("labels", options.labels.join(","));
  if (options.unlabelled) query.set("unlabelled", "true");
  if (options.ticksFor) query.set("ticksFor", options.ticksFor);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const { data } = await send<ContentPage>(`/v1/threads/${threadId}/content${suffix}`);
  if (!data) return null;
  return { ...data, rows: data.rows.map(withPlaceId) };
}

// ------------------------------------------------------------------ writes
//
// Each returns what the row was, so Undo is one more call with the old value
// and nothing has to be held across a screen.

const body = (value: unknown): RequestInit => ({ body: JSON.stringify(value) });

export async function completeContent(id: string, done: boolean): Promise<boolean> {
  const { status } = await send(`/v1/content/${id}/complete`, {
    method: "POST",
    ...body({ done }),
  });
  return status === 200;
}

/** Change a priority, which pins it so the planner leaves it alone. Returns
 *  what it was, so a drag is undone by the same call with the old number. */
export async function setPriority(
  id: string,
  priority: number
): Promise<{ previous: { priority: number; priorityPinned: boolean } } | null> {
  const { data } = await send<{ previous: { priority: number; priorityPinned: boolean } }>(
    `/v1/content/${id}/priority`,
    { method: "POST", ...body({ priority }) }
  );
  return data;
}

export async function setArchived(id: string, archived: boolean): Promise<boolean> {
  const { status } = await send(
    `/v1/content/${id}/${archived ? "archive" : "restore"}`,
    { method: "POST" }
  );
  return status === 200;
}

/** 044. Remove a wrong action from a PDF's row, or put it back. Author only on
 *  the server; restore refuses any url the PDF did not carry, so this can never
 *  add one. The url is the one already on the row, never composed here. */
export async function forgetAction(id: string, url: string): Promise<boolean> {
  const { status } = await send(`/v1/content/${id}/actions/forget`, { method: "POST", ...body({ url }) });
  return status === 200;
}

export async function restoreAction(id: string, url: string): Promise<boolean> {
  const { status } = await send(`/v1/content/${id}/actions/restore`, { method: "POST", ...body({ url }) });
  return status === 200;
}

/** 023. The nine fields a sheet may write. Absent leaves a field alone and
 *  null clears it, which is the one distinction the tool layer cannot make;
 *  what comes back is every previous value, so Undo is one request. */
export interface ContentPatch {
  title?: string;
  body?: string | null;
  dueAt?: string | null;
  occursAt?: string | null;
  occursEndAt?: string | null;
  allDay?: boolean;
  rrule?: string | null;
  isReminder?: boolean;
  /** 025. The row's labels as a full set. */
  labels?: string[];
  /** 042. The author's Remind me. Null leaves it alone, which is what Undo
   *  sends back for anybody else and for a thing with nothing to remind. */
  reminders?: Reminders;
}

export interface ContentSnapshot {
  title: string;
  body: string | null;
  dueAt: string | null;
  occursAt: string | null;
  occursEndAt: string | null;
  allDay: boolean;
  rrule: string | null;
  isReminder: boolean;
  labels: string[];
  /** 042. Null to anybody but the author, and on a thing with no label. */
  reminders: Reminders;
}

/** The refusals the route names; the screen is put back with one clause and
 *  never told why. */
export type EditRefusal = "bad_date" | "bad_rule" | "on_calendar";

export async function editContent(
  id: string,
  fields: ContentPatch
): Promise<{ previous: ContentSnapshot } | null> {
  const { data } = await send<{ previous: ContentSnapshot }>(
    `/v1/content/${id}`,
    { method: "PATCH", ...body(fields) }
  );
  return data;
}

export async function deleteContent(id: string): Promise<boolean> {
  const { data } = await send<{ deleted: boolean }>(`/v1/content/${id}`, {
    method: "DELETE",
  });
  return data?.deleted ?? false;
}

export async function moveContent(
  id: string,
  threadId: string
): Promise<{ previous: { threadId: string } } | null> {
  const { data } = await send<{ previous: { threadId: string } }>(
    `/v1/content/${id}/move`,
    { method: "POST", ...body({ threadId }) }
  );
  return data;
}

/** 2026-10-07. A thread made by hand, from the plus on My threads, with the
 *  name, icon and colour New thread showed. */
export async function createThread(input: { name: string; icon: string; hue: number; layout?: Layout }): Promise<{ id: string; name: string } | null> {
  const { data } = await send<{ thread: { id: string; name: string; icon: string; hue: number } }>("/v1/threads", {
    method: "POST",
    ...body(input),
  });
  if (!data) return null;
  looks.set(data.thread.id, { icon: data.thread.icon, hue: data.thread.hue });
  return { id: data.thread.id, name: data.thread.name };
}

/** 037. Edit thread's one write: the name, the icon and the hue, any of
 *  them. `previous` sent back whole is the Undo. */
export async function editThread(id: string, change: ThreadEdit): Promise<ThreadEdited | LayoutLabelsFull | null> {
  const sent = await send<ThreadEdited>(`/v1/threads/${id}`, {
    method: "PATCH",
    ...body(change),
  });
  // A layout switch refused for full labels: the one failure the caller tells
  // apart, so Save can say what to free and keep the sheet open (6.8).
  if (sent.status === 409 && sent.error === "layout_labels_full") {
    return { labelsFull: { needed: Number(sent.body?.needed ?? 0), free: Number(sent.body?.free ?? 0) } };
  }
  if (sent.data) looks.set(id, { icon: sent.data.thread.icon, hue: sent.data.thread.hue });
  return sent.data;
}

/** Thread layouts: stop the suggestion line for good on this thread (6.9). */
export async function dismissLayoutSuggestion(threadId: string): Promise<boolean> {
  const { status } = await send(`/v1/threads/${threadId}/layout-suggestion/dismiss`, { method: "POST" });
  return status === 200;
}

/** Thread layouts: mark the "someone switched this" heads-up seen, so it shows
 *  once (the server returns it only until this lands). */
export async function markLayoutSeen(threadId: string): Promise<boolean> {
  const { status } = await send(`/v1/threads/${threadId}/layout-seen`, { method: "POST" });
  return status === 200;
}

/** How the thread wants to look. Co-owned, like its name, and merged on the
 *  server, so sending one field leaves the others as they were. */
export async function setPreference(
  threadId: string,
  patch: { widgets?: string[] | null; hideDone?: boolean | null }
): Promise<boolean> {
  const { data } = await send<unknown>(`/v1/threads/${threadId}/preference`, {
    method: "PATCH",
    ...body(patch),
  });
  return data !== null;
}

/** Leave a thread, which deletes it when nobody else is in it.
 *
 *  `deleted` says which of the two happened, so the toast can say the true
 *  thing rather than always saying Deleted. */
export async function deleteThread(
  id: string
): Promise<{ left: boolean; deleted: boolean } | null> {
  const { data } = await send<{ left: boolean; deleted: boolean }>(
    `/v1/threads/${id}`,
    { method: "DELETE" }
  );
  return data;
}

export async function restoreThread(id: string): Promise<boolean> {
  const { status } = await send(`/v1/threads/${id}/restore`, { method: "POST" });
  return status === 200;
}

// ------------------------------------------------------------------- notes

/** The most a section heading's + will take. */
export const QUICK_ADD_CHARS = 500;

export { TYPED_ROW_PLACEHOLDER, typedAddress } from "./typed-row";

// ------------------------------------------------------- provisional rows
//
// A row drawn at the press, before the server has written it. It is the row
// the server is about to write, with a made-up id: the same words, the same
// type. The
// screen swaps the id for the real one when the write lands, and takes the
// row away with a word if it does not.

/** The row a quick add is about to be, drawn from the words alone. */
export function provisionalRow(
  text: string,
  type: "task" | "location" | "event",
  author: { accountId: string | null; displayName: string },
  day?: string,
): ContentRow {
  const now = new Date().toISOString();
  const address = typedAddress(text);
  return {
    id: provisionalId(),
    type,
    title: address ?? text,
    body: null,
    url: address,
    imageUrl: null,
    createdAt: now,
    archivedAt: null,
    doneAt: null,
    dueAt: null,
    // Noon UTC, as the server writes a bare day, so it reads back as the same
    // calendar day almost everywhere.
    occursAt: day ? `${day}T12:00:00.000Z` : null,
    occursEndAt: null,
    rrule: null,
    isReminder: false,
    onCalendar: false,
    priority: 0,
    priorityPinned: false,
    labels: [],
    place: null,
    location: null,
    placeId: null,
    seriesRef: null,
    allDay: day !== undefined,
    photo: null,
    author: { ...author, isYou: true },
    canDelete: true,
    canMove: true,
    filingAt: null,
  };
}

/** The note a typed sentence is about to be. */
export function provisionalNote(text: string, authorId: string | null): Note {
  return {
    id: provisionalId(),
    labels: [],
    text,
    body: null,
    origin: "stated",
    authorId,
    authorIsMember: true,
    muted: false,
    occursAt: null,
    occursEndAt: null,
    dueAt: null,
    placeId: null,
    priority: 50,
    allDay: false,
    rrule: null,
    writtenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    supersededAt: null,
  };
}

/** Type something straight into a thread, without going through the composer.
 *  The row is written exactly as typed, with the type the section gives it. */
export async function quickAdd(
  threadId: string,
  text: string,
  section: string,
  /** The rail's own day: the heading they pressed + on. */
  options?: { day?: string },
): Promise<{ id: string; kind: "content" | "note" } | null> {
  const { data } = await send<{ id: string; kind: "content" | "note" }>(
    `/v1/threads/${threadId}/quick-add`,
    { method: "POST", ...body({ text, section, ...options }) }
  );
  return data;
}

/** Write one. **It always lands.** 008 had a 409 at ten and the screen said
 *  so; there is no cap now, so the only refusal left is a sentence too long to
 *  be one. */
export type AddedNote = { note: Note } | { tooLong: true } | null;

export async function addNote(threadId: string, text: string): Promise<AddedNote> {
  const { status, data } = await send<{ note: Note }>(
    `/v1/threads/${threadId}/notes`,
    { method: "POST", ...body({ text }) }
  );
  if (status === 413) return { tooLong: true };
  return data;
}

export async function editNote(
  id: string,
  text: string,
  noteBody?: string | null
): Promise<{ note: Note; previous: string } | null> {
  const { data } = await send<{ note: Note; previous: string }>(
    `/v1/notes/${id}`,
    { method: "PATCH", ...body(noteBody === undefined ? { text } : { text, body: noteBody }) }
  );
  return data;
}

export async function deleteNote(id: string): Promise<boolean> {
  const { data } = await send<{ deleted: boolean }>(`/v1/notes/${id}`, {
    method: "DELETE",
  });
  return data?.deleted ?? false;
}

export async function restoreNote(id: string): Promise<boolean> {
  const { status } = await send(`/v1/notes/${id}/restore`, { method: "POST" });
  return status === 200;
}

/** Move a note within its section. The same scale as content and the same
 *  reversible shape; it never touches when the note was written. */
export async function setNotePriority(
  id: string,
  priority: number
): Promise<{ previous: { priority: number } } | null> {
  const { data } = await send<{ previous: { priority: number } }>(
    `/v1/notes/${id}/priority`,
    { method: "POST", ...body({ priority }) }
  );
  return data;
}

export async function muteNote(id: string, muted: boolean): Promise<boolean> {
  const { status } = await send(`/v1/notes/${id}/mute`, {
    method: "POST",
    ...body({ muted }),
  });
  return status === 200;
}

/** What the daily job folded. Read, not worked with: there is no restore. */
export async function foldedNotes(
  threadId: string,
  cursor?: string | null
): Promise<{ notes: Note[]; cursor: string | null } | null> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data } = await send<{ notes: Note[]; cursor: string | null }>(
    `/v1/threads/${threadId}/notes/folded${query}`
  );
  return data;
}
