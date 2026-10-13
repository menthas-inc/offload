// Sending a dump from a phone, and waiting for the answer.
//
// **The phone polls where the web streams.** `EventSource` is not in the React
// Native runtime, and the web's own `dump.ts` already calls the plain fetch
// "the one that cannot fail to arrive" and the stream "an optimisation over
// polling". So the phones ship on the thing the optimisation was optimising,
// and gain the stream when a polyfill is worth its weight.
//
// Numbers rather than "bounded", because nothing polls this route today: the
// web asks once per stream reconnect, the server is `pg_notify`-driven, and
// there is no rate limiter to catch an interval set too tight.

import { File } from "expo-file-system";
import { API_URL, send, upload } from "./api";
import { failed } from "./log";

export type MessageState =
  | "queued"
  | "seen"
  | "answered"
  | "failed"
  /** offload stopped by accident. The composer offers Finish. */
  | "partial"
  /** Somebody stopped it. The composer offers nothing, because offering to undo
   *  their own decision is the product arguing with them. */
  | "cancelled";

export interface Sent {
  messageId: string;
  conversationId: string;
  state: MessageState;
  /** The undo unit. Carried from the send so the toast never has to ask. */
  turnId: string;
  /** 018. On an answer's response: the turn's second question, now on the
   *  answering message, so it appears without a reload. */
  question?: QuestionOnWire | null;
  /** 018. On an answer's response: the thread the answer changed. */
  threads?: TouchedThread[];
  /** On a calendar answer's response: the tap put the event on a calendar,
   *  which is Done even when the row's thread has no pill. */
  filed?: boolean;
  /** 019. On a calendar answer's response: the write that waits for them. */
  waiting?: WaitingOn | null;
}

/** A thread a turn actually wrote to, from the content rows it produced rather
 *  than from parsing the reply, so a link can never point somewhere offload did
 *  not file anything. */
export interface TouchedThread {
  id: string;
  name: string;
  /** 037. As the thread is now, not as it was when the turn ran. */
  icon: string;
  hue: number;
}

/** A calendar write offload proposed and nobody has answered yet.
 *
 *  Only ever set on a write that reaches somebody else: guests, or a calendar
 *  the person has marked shared. A write nobody learns about just happens and
 *  carries the ordinary Undo instead. */
export interface WaitingOn {
  id: string;
  /** Who finds out, in the words the screen shows. */
  because: string;
  /** 019 a calendar write, 022 a share. The control's label and the line
   *  under it are drawn by kind. */
  kind: "calendar" | "share";
  /** What a calendar proposal would do, so the control can say it. */
  action?: "create" | "edit" | "delete";
}

/** One read from an answer: a thread, and the rows it holds.
 *
 *  Grouped by the server in the order it read them. Two subjects is two
 *  results, never one blended list, because which trip is which is most of the
 *  answer. */
export interface FoundResult {
  threadId: string;
  /** 028. Null for what is not in a thread, which no surface names. */
  threadName: string | null;
  /** 037. Null with the name. */
  threadIcon: string | null;
  threadHue: number | null;
  /** The read hit its page. The tail becomes the thread rather than a control
   *  that would expand into rows nobody fetched. */
  truncated: boolean;
  rows: FoundRow[];
}

export interface FoundRow {
  contentId: string;
  threadId: string;
  threadName: string | null;
  type: string;
  title: string;
  body: string | null;
  done: boolean;
  /** 2026-10-13. The row's dates, so rows that share a title can be told
   *  apart: the card draws them under the title. */
  dueAt: string | null;
  occursAt: string | null;
  occursEndAt: string | null;
  allDay: boolean;
  rrule: string | null;
  /** 020. The row's photo, when it has one. */
  /** 020, 041. The row's photo or PDF. */
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
}

/** 016. Where a fact in a turn came from. Two fields, and the omissions are the
 *  point: a provider's citation also carries the page's title and a quoted
 *  excerpt, and both are written by whoever owns the page. */
export interface Source {
  domain: string;
  url: string;
}

/** 018. A question offload asked back, while it is open. Labels and kinds
 *  only: the values stay on the server and an index goes back. */
export interface QuestionOnWire {
  id: string;
  field: "date" | "span" | "time" | "tag" | "country" | "thread" | "calendar" | "person";
  text: string;
  options: { label: string; kind: "value" | "plain" }[];
  ordinal: number;
}

export interface Answer {
  state: MessageState;
  reply: string | null;
  /** 020, 041. The message's files as the server has them now. */
  photos?: PhotoOnWire[];
  threads: TouchedThread[];
  sources: Source[];
  /** 025. The labels the turn applied, in order, for the footer's marks. */
  labels?: { id: string; name: string; colour: number }[];
  /** 017. What offload is doing, on a turn still in flight. Null once settled. */
  step: string | null;
  /** 018. The question this turn asked back, while it is open. */
  question: QuestionOnWire | null;
  /** Every thread whose contents the turn changed, a superset of `threads`.
   *  A move's source is here and not there: the screen has to reload it, and a
   *  pill saying the dump went there would be untrue. */
  changed: string[];
  /** 028. Filed something, loose or not: what draws Done. */
  filed?: boolean;
  waiting?: WaitingOn | null;
  /** What an answer showed. Empty on a dump, which files rather than answers.
   *
   *  Resolved by the server on every read, so a row ticked or deleted elsewhere
   *  is never stale inside a reply from last week. */
  found?: FoundResult[];
  /** 021. The voice note on the message, with its transcript once written.
   *  The poll reads it every tick, so the bubble draws the words the moment
   *  they exist, ahead of the reply. */
  voice?: VoiceOnWire | null;
}

/** 021. The voice note on a person's message, as the server sends it. The
 *  bars and the length are there from the send; the transcript once offload
 *  has listened. `text` on the message stays the typed words. */
export interface VoiceOnWire {
  blobId: string;
  durationMs: number;
  waveform: number[];
  transcript: string | null;
  transcribed: boolean;
  /** This device only, never from the wire: the recording's file, for the
   *  moment between the send and the server's copy. */
  localUri?: string;
}

export interface TailMessage {
  id: string;
  role: "person" | "offload";
  text: string | null;
  /** 020. Empty on every reply. */
  photos?: PhotoOnWire[];
  /** 021. Null on every reply and on any message without one. */
  voice?: VoiceOnWire | null;
  /** 026. A forwarded email's subject; null on everything else. */
  mail?: { subject: string; note: string } | null;
  state: MessageState;
  turnId: string;
  /** When it was sent; the thirty minute rule reads the last one after a
   *  cold start. Absent from an API older than 30 September 2026. */
  createdAt?: string;
  waiting?: WaitingOn | null;
  question?: QuestionOnWire | null;
  found?: FoundResult[];
  /** Where the turn filed, and where a fact in it came from. The footer's whole
   *  content, and a reload used to drop all of it. */
  /** 028. Filed something, loose included: what draws Done after a reload. */
  filed?: boolean;
  threads?: TouchedThread[];
  sources?: Source[];
  /** 025. On the person's message: what the turn applied. */
  labels?: { id: string; name: string; colour: number }[];
}

/** The day's model budget is spent (security review 2026-09-22, M6). The
 *  words go back to the composer and the line says so. */
export class DailyLimit extends Error {
  constructor() {
    super("daily_limit");
  }
}

export class DumpTooLong extends Error {
  constructor(readonly maxChars: number) {
    super("too long");
  }
}

/** How long the answer is worth waiting for, and how hard.
 *
 *  A second while the turn is live, which is what the web used before
 *  `pg_notify` and is comfortably inside how long a turn takes. After twenty
 *  misses it slows to five, because a turn still unanswered after twenty
 *  seconds is not about to be answered in the next one. */
const QUICK_MS = 1000;
const SLOW_MS = 5000;
const MISSES_BEFORE_SLOWING = 20;

const isFinal = (state: MessageState): boolean =>
  state === "answered" ||
  state === "partial" ||
  state === "failed" ||
  // 017. A stopped turn is over. Without this the poll would keep asking about
  // a turn nobody is working on, which is the one thing pressing Stop was
  // meant to end.
  state === "cancelled";

/** Send it. The server stores it before anything else, so a resolved promise
 *  means the dump is safe even if nothing ever answers it. */
/** @param threadId The thread on screen, if any. A filing default, not a
 *  destination: the server checks membership and the prompt lets the words
 *  override it. */
/** @param photos 020. The photos uploaded ahead of this message, claimed by it. */
/** @param mentions 022. Who an @ picked. The server keeps only accepted
 *  connections; the rest are dropped there, words intact. */
export async function sendDump(
  text: string,
  clientKey: string,
  threadId?: string,
  photos?: { blobIds: string[]; viaShare?: boolean },
  mentions: { accountId: string; name: string }[] = [],
  /** 025. What a # picked on a thread: a label by id, or a name to make. */
  labels: ({ id: string } | { name: string })[] = [],
): Promise<Sent | null> {
  const { status, data } = await send<Sent>("/v1/dumps", {
    method: "POST",
    body: JSON.stringify({
      text,
      clientKey,
      ...(threadId ? { threadId } : {}),
      ...(photos?.blobIds.length ? { blobIds: photos.blobIds, viaShare: Boolean(photos.viaShare) } : {}),
      ...(mentions.length ? { mentions } : {}),
      ...(threadId && labels.length ? { labels } : {}),
    }),
  });
  if (status === 413) throw new DumpTooLong(0);
  if (status === 409) throw new UnknownBlob();
  if (status === 429) throw new DailyLimit();
  return data;
}

// ---------------------------------------------------------------- 020, photos

/** The server no longer holds one of the message's uploads: an hour passed
 *  unsent and the sweep took it. The composer forgets what landed and
 *  uploads again on Retry. */
export class UnknownBlob extends Error {
  constructor() {
    super("unknown_blob");
  }
}

/** A photo on a person's message, as the server sends it, or a PDF (041).
 *  `ready` is whether the renditions exist yet; until they do the thumbnail
 *  draws the glyph. A PDF has its pages, whether its clean copy can be
 *  opened, and whether it never will be. */
export interface PhotoOnWire {
  blobId: string;
  kind: "image" | "pdf";
  name: string | null;
  width?: number;
  height?: number;
  pages?: number;
  openable?: boolean;
  unreadable?: boolean;
  ready: boolean;
  /** This device only, never from the wire: the file's uri, for the moment
   *  between the send and the renditions. */
  localUri?: string;
}

/** Per message, photos and PDFs together, and the server holds the same
 *  number. */
export const MAX_PHOTOS = 10;
/** 041. Per message, inside the ten. */
export const MAX_PDFS = 2;
/** Per photo. The server holds the same number and refuses by bytes. */
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

/** What the product takes. A picker reports a MIME type most of the time and
 *  an extension the rest, so both are read. */
const PHOTO_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);
const PHOTO_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

export type PhotoRefusal = "too_big" | "not_a_photo" | "locked_pdf" | "daily_limit" | "storage_full" | "unavailable";

/** 041. A PDF by its type, or by its name when the picker gives no type. The
 *  server reads the bytes; this only spares a request. */
export function isPdf(file: { type: string | null; name: string | null }): boolean {
  const type = (file.type ?? "").toLowerCase();
  // Mail and several Android providers hand a .pdf over as bytes of no type;
  // the server reads the bytes either way.
  return type === "application/pdf" || ((type === "" || type === "application/octet-stream") && /\.pdf$/i.test(file.name ?? ""));
}

/** Why a photo or a PDF was refused on the device, or null when it may go.
 *  A locked PDF is the server's to find. */
export function refuseFile(file: { type: string | null; name: string; size: number | null }): "too_big" | "not_a_photo" | null {
  const type = (file.type ?? "").toLowerCase();
  const looksLikeOne = PHOTO_TYPES.has(type) || (!type && PHOTO_EXTENSIONS.test(file.name)) || isPdf(file);
  if (!looksLikeOne) return "not_a_photo";
  if (file.size !== null && file.size > MAX_PHOTO_BYTES) return "too_big";
  return null;
}

/** 041. Which of the incoming files a draft holding `current` takes: ten in
 *  all, two of them PDFs, in the order given, and the line for what it left. */
export function takeFiles<T extends { type: string | null; name: string | null }>(
  current: { kind: "image" | "pdf" }[],
  incoming: T[],
): { taken: T[]; line: "Ten at a time." | "Two PDFs at a time." | null } {
  let room = MAX_PHOTOS - current.length;
  let pdfRoom = MAX_PDFS - current.filter((one) => one.kind === "pdf").length;
  const taken: T[] = [];
  let line: "Ten at a time." | "Two PDFs at a time." | null = null;
  for (const one of incoming) {
    if (room <= 0) {
      line ??= "Ten at a time.";
      continue;
    }
    if (isPdf(one)) {
      if (pdfRoom <= 0) {
        line ??= "Two PDFs at a time.";
        continue;
      }
      pdfRoom--;
    }
    room--;
    taken.push(one);
  }
  return { taken, line };
}

/** The name a chip shows: the file's own, or "Photo", "Photo 2", "PDF",
 *  "PDF 2" counting the draft's unnamed ones of its kind. */
export function draftName(
  file: { type: string | null; name: string | null },
  current: { kind: "image" | "pdf"; named: boolean }[],
): string {
  if (file.name) return file.name;
  const kind = isPdf(file) ? "pdf" : "image";
  const n = current.filter((one) => one.kind === kind && !one.named).length;
  const word = kind === "pdf" ? "PDF" : "Photo";
  return n === 0 ? word : `${word} ${n + 1}`;
}

/** 041. A settled turn's files as the server now has them, keeping the
 *  device's own copy of a photo for the moment before its rendition draws. A
 *  PDF learns here whether its clean copy exists. With no files on the answer
 *  every photo is ready, as 020 has it. */
export function settledPhotos(
  sent: PhotoOnWire[] | undefined,
  answered: PhotoOnWire[] | undefined,
): PhotoOnWire[] {
  return (sent ?? []).map((photo) => {
    const fresh = answered?.find((one) => one.blobId === photo.blobId);
    if (!fresh) return { ...photo, ready: true };
    return photo.localUri ? { ...fresh, localUri: photo.localUri } : fresh;
  });
}

/** 041. A long name clipped in the middle, so its end, which is usually what
 *  tells two PDFs apart, survives. */
export function clipMiddle(name: string, max = 20): string {
  if (name.length <= max) return name;
  const tail = Math.ceil((max - 1) / 2);
  return `${name.slice(0, max - 1 - tail)}…${name.slice(name.length - tail)}`;
}

/** 036. Which ceiling a 429 on an upload was: everything kept, or the day's.
 *  No code is the day's, as every 429 was before. */
function overLimit(error: string | undefined): "storage_full" | "daily_limit" {
  return error === "storage_full" ? "storage_full" : "daily_limit";
}

export class PhotoRefused extends Error {
  constructor(readonly reason: PhotoRefusal) {
    super(reason);
  }
}

/** Upload one photo, ahead of the dump that will claim it. Idempotent on the
 *  client key, which belongs to the draft until it sends. */
export async function uploadPhoto(
  file: { uri: string; name: string; type: string | null },
  clientKey: string,
): Promise<{ blobId: string; kind: "image" | "pdf"; width?: number; height?: number; pages?: number }> {
  const form = new FormData();
  form.append("clientKey", clientKey);
  form.append("name", file.name);
  // Expo 57's fetch is the WinterCG one and takes a real `File` as a part;
  // React Native's old `{ uri, name, type }` shape is refused with
  // "Unsupported FormDataPart implementation", which is what the first send
  // from a Pixel got. `File` here is expo-file-system's, a Blob over the
  // uri, read as the request streams.
  form.append("file", new File(file.uri) as unknown as Blob, file.name || "photo");
  const { status, data, error } = await upload<{
    blobId: string;
    kind: "image" | "pdf";
    width?: number;
    height?: number;
    pages?: number;
  }>("/v1/blobs", form);
  if (status === 413) throw new PhotoRefused("too_big");
  // 041. A locked PDF is its own line.
  if (status === 415) throw new PhotoRefused(error === "locked_pdf" ? "locked_pdf" : "not_a_photo");
  if (status === 429) throw new PhotoRefused(overLimit(error));
  if (status === 503) throw new PhotoRefused("unavailable");
  if (!data) throw new Error(`upload failed: ${status}`);
  return data;
}

/** Where a rendition is read from. The session travels as a header, which
 *  `Image` takes on its source. */
export function photoUrl(blobId: string, rendition: "thumb" | "large"): string {
  return `${API_URL}/v1/blobs/${blobId}/${rendition}`;
}

// ---------------------------------------------------------------- 021, a voice note

/** The recorders stop themselves here, and the server refuses past it. */
export const MAX_VOICE_MS = 600_000;
/** Bars over the whole note. The server holds the same number. */
export const WAVEFORM_BARS = 32;

export class VoiceRefused extends Error {
  constructor(readonly reason: "too_big" | "not_a_voice_note" | "daily_limit" | "storage_full" | "unavailable") {
    super(reason);
  }
}

/** Upload one voice note, ahead of the dump that will claim it. Idempotent
 *  on the client key, which belongs to the draft until it sends. */
export async function uploadVoice(
  uri: string,
  clientKey: string,
  durationMs: number,
  waveform: number[],
): Promise<{ blobId: string }> {
  const form = new FormData();
  form.append("clientKey", clientKey);
  form.append("durationMs", String(durationMs));
  form.append("waveform", JSON.stringify(waveform));
  form.append("file", new File(uri) as unknown as Blob, "voice-note.m4a");
  const { status, data, error } = await upload<{ blobId: string }>("/v1/blobs/audio", form);
  if (status === 413) throw new VoiceRefused("too_big");
  if (status === 415 || status === 400) throw new VoiceRefused("not_a_voice_note");
  if (status === 429) throw new VoiceRefused(overLimit(error));
  if (status === 503) throw new VoiceRefused("unavailable");
  if (!data) throw new Error(`upload failed: ${status}`);
  return data;
}

/** Where a voice note is heard from: the bytes as they arrived, to the
 *  dumper's session. Fetched with the session into a cache file and played
 *  from there, since a native player carries no header (020's lesson). */
export function voiceUrl(blobId: string): string {
  return `${API_URL}/v1/blobs/${blobId}/audio`;
}

/** Ask once. */
export async function fetchAnswer(messageId: string): Promise<Answer | null> {
  const { data } = await send<{
    state: MessageState;
    reply: string | null;
    threads?: TouchedThread[];
    sources?: Source[];
    labels?: { id: string; name: string; colour: number }[];
    step?: string | null;
    changed?: string[];
    filed?: boolean;
    waiting?: WaitingOn | null;
    question?: QuestionOnWire | null;
    // **The rows, which this used to drop on the floor.** `awaitAnswer` is the
    // only way an open app learns its turn is done, so leaving `found` out of
    // the parsed shape meant every answer rendered its sentence and none of its
    // rows. It looked like the server finding nothing, and it came back after a
    // force quit because the cold start reads `fetchCurrent` instead.
    found?: FoundResult[];
    voice?: VoiceOnWire | null;
    photos?: PhotoOnWire[];
  }>(`/v1/messages/${messageId}`);
  if (!data) return null;
  return {
    state: data.state,
    reply: data.reply,
    threads: data.threads ?? [],
    sources: data.sources ?? [],
    labels: data.labels ?? [],
    step: data.step ?? null,
    changed: data.changed ?? [],
    filed: data.filed ?? false,
    waiting: data.waiting ?? null,
    question: data.question ?? null,
    found: data.found ?? [],
    voice: data.voice ?? null,
    // 041. The message's files as the server has them now.
    ...(data.photos ? { photos: data.photos } : {}),
  };
}

/** 018. Answer a question by option. Null when the server refused it: the
 *  question is closed, answered elsewhere, or gone, and the chips simply go.
 *  The envelope is a dump's, so the sheet waits for a country re-run the way
 *  it waits for anything else. */
export async function answerQuestion(
  id: string,
  option: number,
): Promise<{ status: number; sent: Sent | null }> {
  const { status, data } = await send<Sent>(`/v1/questions/${id}/answer`, {
    method: "POST",
    body: JSON.stringify({ option }),
  });
  return { status, sent: data };
}

/** 018. What the composer says while a question is open. A question with
 *  nothing to offer but the way out is answered by typing, and the
 *  placeholder is the invitation. Example first, no preamble: all three lines
 *  overran a 266px field at 390pt, and what each lost was its example. */
export function invitation(question: QuestionOnWire): string {
  const typedOnly = question.options.every((o) => o.kind === "plain");
  if (!typedOnly) return question.text;
  switch (question.field) {
    case "span":
      return "Which dates? e.g. Sept 12th at 5pm";
    case "date":
      return "By when? e.g. Sept 30th";
    case "time":
      return "Which day and time? e.g. Friday at 5pm";
    default:
      return question.text;
  }
}

/** Wait for the answer by asking, and stop asking when there is one.
 *
 *  Returns a cancel function, which the caller calls on unmount and when the
 *  app backgrounds. A poll left running behind a lock screen is a request every
 *  second that nobody is waiting for.
 */
export function awaitAnswer(
  messageId: string,
  onAnswer: (answer: Answer) => void,
  /** 017. What offload is doing, on the ticks before the answer lands. Called
   *  with null when the line is cleared, so a step never outlives the work. */
  onStep?: (step: string | null) => void,
  /** 021. The transcript, on the tick that first finds it, ahead of the reply. */
  onTranscript?: (text: string) => void,
): { cancel: () => void; now: () => void } {
  let done = false;
  let misses = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let said: string | null = null;
  let heard = false;

  const stop = (): void => {
    done = true;
    if (timer) clearTimeout(timer);
  };

  const ask = async (): Promise<void> => {
    if (done) return;
    const answer = await fetchAnswer(messageId);
    if (done) return;

    if (answer && isFinal(answer.state)) {
      stop();
      onAnswer(answer);
      return;
    }

    // **Only on a change.** The poll asks every second and the step changes
    // two to five times a turn, so reporting every tick would be a state
    // update per second for a string that is usually the same one.
    const step = answer?.step ?? null;
    if (step !== said) {
      said = step;
      onStep?.(step);
    }
    // 021. Once: the words do not change after they are written.
    if (!heard && answer?.voice?.transcribed) {
      heard = true;
      onTranscript?.(answer.voice.transcript ?? "");
    }

    misses += 1;
    timer = setTimeout(
      () => void ask(),
      misses >= MISSES_BEFORE_SLOWING ? SLOW_MS : QUICK_MS
    );
  };

  void ask();

  return {
    cancel: stop,
    /** Ask right now rather than at the next tick. Called when the app comes
     *  back to the foreground: the answer may have landed while the poll was
     *  stopped, and waiting a full interval to notice is a visible delay
     *  between offload finishing and the screen saying so. */
    now: () => {
      if (done) return;
      if (timer) clearTimeout(timer);
      misses = 0;
      void ask();
    },
  };
}

/** The current conversation, so reopening the app does not look like a fresh
 *  account. */
/** The current conversation's messages, or null when nothing answered: signed
 *  out, offline, or refused, which the caller asks again about. */
export async function fetchCurrent(): Promise<TailMessage[] | null> {
  const { data } = await send<{ messages: TailMessage[] }>("/v1/conversations/current");
  return data ? (data.messages ?? []) : null;
}

/** Take back a whole turn: what you dumped, what offload filed, and what it
 *  said about it. */
export async function undoTurn(turnId: string): Promise<boolean> {
  const { data } = await send<{ undone: boolean }>(`/v1/turns/${turnId}/undo`, {
    method: "POST",
  });
  return data?.undone ?? false;
}

/** Stop a turn that is taking too long. 017.
 *
 *  **Fire and forget, deliberately.** AC-8 puts the screen back on the press and
 *  not on the reply: a stop that waits for a round trip looks broken on exactly
 *  the connection where somebody most wants to stop something. The caller has
 *  already cleared its own state by the time this resolves, and the return value
 *  is here for a test rather than for a screen.
 *
 *  Nothing is undone. Everything filed before the press stays filed, and Undo is
 *  the thing that reverses it.
 */
export async function cancelTurn(turnId: string): Promise<boolean> {
  const { data } = await send<{ state: MessageState; stopped: boolean }>(
    `/v1/turns/${turnId}/cancel`,
    { method: "POST" }
  );
  return data?.stopped ?? false;
}

/** Finish a turn that stopped partway.
 *
 *  Not a re-send. The dump is still where it was and some of it is already
 *  filed; this asks offload to do the rest. */
export async function resumeDump(messageId: string): Promise<Sent | null> {
  const { data } = await send<Sent>(`/v1/dumps/${messageId}/resume`, { method: "POST" });
  return data;
}

/** End the current conversation, because somebody closed the sheet.
 *
 *  Fire and forget on purpose. Closing is instant on screen and must stay that
 *  way; if this never lands, the worst case is that the next dump joins the
 *  conversation somebody put away, which is what happened before it existed. */
export async function endConversation(): Promise<void> {
  try {
    await send<{ ended: boolean }>("/v1/conversations/current/end", { method: "POST" });
  } catch (error) {
    // A phone that was offline when somebody tidied the screen. The close has
    // already happened and there is nothing to say about it.
    failed("conversation.end", error);
  }
}
