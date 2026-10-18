// Sending a dump and waiting for the answer.
//
// Two ways to the same answer, on purpose. The stream is the fast path and the
// plain fetch is the one that cannot fail to arrive: a browser that slept, lost
// its connection, or hit a proxy that closed an idle stream still gets the
// answer by asking for it. The stream is an optimisation over polling, and the
// fallback is what makes it safe to be one.

import { MAX_PHOTO_BYTES, answerPollMs, isFinal, isPdf } from "@offload/widgets";
import { reach } from "./threads";
import { timeZoneHeader } from "./time-zone";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export type MessageState =
  | "queued"
  | "seen"
  | "answered"
  | "failed"
  /** Content landed, the reply describes it, and offload did not finish. The
   *  composer offers Finish. */
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
  /** 019. On a calendar answer's response: the proposal the tap turned into,
   *  when the calendar needed the person's say-so, drawn on their own turn. */
  waiting?: WaitingOn | null;
}

/** A thread a turn actually wrote to. From the content rows it produced, not
 *  from parsing the reply, so a link can never point somewhere offload did not
 *  file anything. */
export interface TouchedThread {
  id: string;
  name: string;
  /** 037. As the thread is now, not as it was when the turn ran. */
  icon: string;
  hue: number;
}

/** One read from an answer: a thread, and the rows it holds.
 *
 *  Grouped by the server, in the order it read them. Two subjects is two
 *  results, never one blended list, because which trip is which is most of the
 *  answer. */
export interface FoundResult {
  threadId: string;
  /** 028. Null for what is not in a thread, which the result never names. */
  threadName: string | null;
  /** 037. Null with the name. */
  threadIcon: string | null;
  threadHue: number | null;
  /** The read hit its page. The tail becomes the thread rather than a Show more
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
  field: "date" | "span" | "time" | "tag" | "country" | "thread";
  text: string;
  options: { label: string; kind: "value" | "plain" }[];
  ordinal: number;
}

export interface Answer {
  state: MessageState;
  reply: string | null;
  /** 020, 041. The message's files as the server has them now. */
  photos?: PhotoOnWire[];
  threads?: TouchedThread[];
  sources?: Source[];
  /** 025. The labels the turn applied, in order, for the footer's marks. */
  labels?: { id: string; name: string; colour: number }[];
  /** 017. What offload is doing, on a turn still in flight. Null once settled. */
  step?: string | null;
  /** 018. The question this turn asked back, while it is open. */
  question?: QuestionOnWire | null;
  /** A calendar write offload proposed and nobody has answered yet. Only ever
   *  set on a write that reaches somebody else: guests, or a calendar marked
   *  shared. A write nobody learns about just happens, with the ordinary Undo. */
  waiting?: WaitingOn | null;
  /** Every thread whose contents the turn changed, a superset of `threads`.
   *  A move's source is here and not there: the screen has to reload it, and a
   *  pill saying the dump went there would be untrue. */
  changed?: string[];
  /** 028. Filed something, loose or not: what draws Done. */
  filed?: boolean;
  /** What an answer showed. Empty for a dump, which files rather than answers.
   *
   *  Resolved by the server every time it is read, so a row ticked or deleted
   *  elsewhere is never stale inside an old answer. */
  found?: FoundResult[];
  /** 021. The voice note on the message, with its transcript once written.
   *  Only ever on a read of the message; the stream carries the transcript
   *  as its own event. */
  voice?: VoiceOnWire | null;
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

/** Send it. The server stores it before anything else, so a resolved promise
 *  means the dump is safe even if nothing ever answers it. */
/** @param threadId The thread on screen, if any. A filing default, not a
 *  destination: the server checks membership and the model is told the words
 *  override it. */
/** @param photos 020. The photos uploaded ahead of this message, claimed by it. */
/** 019 a calendar write, 022 a share, drawn by kind. */
export interface WaitingOn {
  id: string;
  because: string;
  kind: "calendar" | "share";
  /** What a calendar proposal would do, so the control can say it. */
  action?: "create" | "edit" | "delete";
}

/** @param mentions 022. Who an @ picked; the server keeps only accepted connections.
 *  @param labels 025. What a # picked on a thread: a label by id, or a name to make. */
export async function sendDump(
  text: string,
  clientKey: string,
  threadId?: string,
  photos?: { blobIds: string[]; viaShare?: boolean },
  mentions: { accountId: string; name: string }[] = [],
  labels: ({ id: string } | { name: string })[] = [],
): Promise<Sent> {
  const response = await fetch(`${API}/v1/dumps`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", ...timeZoneHeader() },
    body: JSON.stringify({
      text,
      clientKey,
      ...(threadId ? { threadId } : {}),
      ...(photos?.blobIds.length ? { blobIds: photos.blobIds, viaShare: Boolean(photos.viaShare) } : {}),
      ...(mentions.length ? { mentions } : {}),
      ...(threadId && labels.length ? { labels } : {}),
    }),
  });

  if (response.status === 413) {
    const body = (await response.json()) as { maxChars: number };
    throw new DumpTooLong(body.maxChars);
  }
  if (response.status === 409) throw new UnknownBlob();
  if (response.status === 429) throw new DailyLimit();
  if (!response.ok) throw new Error(`dump failed: ${response.status}`);
  return (await response.json()) as Sent;
}

/** 020. The server no longer holds one of the message's uploads: an hour
 *  passed unsent and the sweep took it. The composer forgets what landed
 *  and uploads again on Retry. */
export class UnknownBlob extends Error {
  constructor() {
    super("unknown_blob");
  }
}

// ---------------------------------------------------------------- 020, photos

/** A photo on a person's message, as the server sends it, or a PDF (041).
 *  `ready` is whether the renditions exist yet; until they do the thumbnail
 *  draws the glyph. A photo has its dimensions; a PDF its pages and whether
 *  its clean copy exists to be opened. */
export interface PhotoOnWire {
  blobId: string;
  kind: "image" | "pdf";
  name: string | null;
  width?: number;
  height?: number;
  pages?: number;
  openable?: boolean;
  /** 041. A PDF the server could not make safe: it will never open. */
  unreadable?: boolean;
  ready: boolean;
  /** This device only, never from the wire: the file as an object URL, for
   *  the moment between the send and the renditions. */
  localUrl?: string;
}

/** What the product takes. Checked by extension too, because a browser
 *  reports an empty type for HEIC. */
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const PHOTO_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

export function isPhoto(file: File): boolean {
  return PHOTO_TYPES.has(file.type.toLowerCase()) || (file.type === "" && PHOTO_EXTENSIONS.test(file.name));
}

/** Why a photo or a PDF was refused on the device, or null when it may go.
 *  The one line each is the failure table's. A locked PDF is the server's to
 *  find. */
export function refuseFile(file: File): "too_big" | "not_a_photo" | null {
  if (!isPhoto(file) && !isPdf(file)) return "not_a_photo";
  if (file.size > MAX_PHOTO_BYTES) return "too_big";
  return null;
}

/** The name a chip shows: the file's own, or "Photo", "Photo 2", "PDF",
 *  "PDF 2" counting the draft's unnamed ones of its kind. A browser names a
 *  pasted image `image.png`, which is an identifier and not a name. */
export function draftName(file: File, current: { kind: "image" | "pdf"; named: boolean }[]): string {
  const own = file.name && !/^image\.(png|jpe?g|webp|gif|heic|heif)$/i.test(file.name) ? file.name : "";
  if (own) return own;
  const kind = isPdf(file) ? "pdf" : "image";
  const n = current.filter((one) => one.kind === kind && !one.named).length;
  const word = kind === "pdf" ? "PDF" : "Photo";
  return n === 0 ? word : `${word} ${n + 1}`;
}

/** 036. Which ceiling a 429 on an upload was: everything kept, or the day's.
 *  A body that cannot be read is the day's, as every 429 was before. */
async function overLimit(response: Response): Promise<"storage_full" | "daily_limit"> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return body?.error === "storage_full" ? "storage_full" : "daily_limit";
}

export class PhotoRefused extends Error {
  constructor(
    readonly reason: "too_big" | "not_a_photo" | "locked_pdf" | "daily_limit" | "storage_full" | "unavailable",
  ) {
    super(reason);
  }
}

/** Upload one photo, ahead of the dump that will claim it. Idempotent on the
 *  client key, which belongs to the draft until it sends. */
export async function uploadPhoto(
  file: File,
  clientKey: string,
): Promise<{ blobId: string; kind: "image" | "pdf"; width?: number; height?: number; pages?: number }> {
  const form = new FormData();
  form.append("clientKey", clientKey);
  if (file.name) form.append("name", file.name);
  form.append("file", file, file.name || "photo");
  const response = await fetch(`${API}/v1/blobs`, { method: "POST", credentials: "include", body: form });
  if (response.status === 413) throw new PhotoRefused("too_big");
  if (response.status === 415) {
    // 041. A locked PDF is its own line; anything else is neither kind.
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    throw new PhotoRefused(body?.error === "locked_pdf" ? "locked_pdf" : "not_a_photo");
  }
  if (response.status === 429) throw new PhotoRefused(await overLimit(response));
  if (response.status === 503) throw new PhotoRefused("unavailable");
  if (!response.ok) throw new Error(`upload failed: ${response.status}`);
  return (await response.json()) as { blobId: string; kind: "image" | "pdf"; width?: number; height?: number; pages?: number };
}

/** 041. Where a PDF's clean copy is opened from. */
export function pdfUrl(blobId: string): string {
  return `${API}/v1/blobs/${blobId}/pdf`;
}

export type PdfOpened = "opened" | "blocked" | "not_yet" | "never";

/** A new tab that cannot reach back to this one. Not `noopener`: with it the
 *  browser answers null whether or not it opened the tab, and a blocked tab
 *  has to be said. */
function newTab(url: string): Window | null {
  const tab = window.open(url, "_blank");
  if (tab) tab.opener = null;
  return tab;
}

/** 041. Open a PDF in the browser's own viewer, in a new tab, called inside
 *  the click so no pop-up blocker takes it: the browser fetches it with the
 *  session cookie, nothing is fetched first. */
export function openPdf(pdf: { blobId: string; openable?: boolean; unreadable?: boolean }): PdfOpened {
  if (pdf.unreadable) return "never";
  if (!pdf.openable) return "not_yet";
  return newTab(pdfUrl(pdf.blobId)) ? "opened" : "blocked";
}

/** 041. Retry for a PDF that was not there yet: the tab is opened in the
 *  click, blank, and sent to the PDF once the server says it has the clean
 *  copy, or closed. */
export async function retryPdf(blobId: string): Promise<PdfOpened> {
  const tab = newTab("");
  if (!tab) return "blocked";
  try {
    const res = await fetch(pdfUrl(blobId), { method: "HEAD", credentials: "include" });
    if (res.ok) {
      tab.location.replace(pdfUrl(blobId));
      return "opened";
    }
  } catch {
    // Offline reads as not there yet, with the same Retry.
  }
  tab.close();
  return "not_yet";
}

/** 041. Open a PDF and, when it did not open, say so with the way forward:
 *  Retry, except for one that has no clean copy and never will. */
export function openPdfSaying(
  pdf: { blobId: string; openable?: boolean; unreadable?: boolean },
  say: (text: string, retry?: () => void) => void,
): void {
  const report = (result: PdfOpened): void => {
    if (result === "opened") return;
    if (result === "never") return say("Can't open this one.");
    say(result === "blocked" ? "Did not open." : "Not here yet.", () => void retryPdf(pdf.blobId).then(report));
  };
  report(openPdf(pdf));
}

/** 041. A settled turn's files as the server now has them, keeping the
 *  device's own copy of a photo for the moment before its rendition draws. A
 *  PDF learns here whether its clean copy exists. With no files on the answer
 *  every photo is ready, as 020 has it: renditions are made before the model
 *  reads them. */
export function settledPhotos(
  sent: PhotoOnWire[] | undefined,
  answered: PhotoOnWire[] | undefined,
): PhotoOnWire[] | undefined {
  return sent?.map((photo) => {
    const fresh = answered?.find((one) => one.blobId === photo.blobId);
    if (!fresh) return { ...photo, ready: true };
    return photo.localUrl ? { ...fresh, localUrl: photo.localUrl } : fresh;
  });
}

/** Where a rendition is read from. The session cookie reaches the API on its
 *  own origin, so an `<img>` needs `crossOrigin="use-credentials"` and
 *  nothing else. */
export function photoUrl(blobId: string, rendition: "thumb" | "large"): string {
  return `${API}/v1/blobs/${blobId}/${rendition}`;
}

// ---------------------------------------------------------------- 021, a voice note

/** The voice note on a person's message, as the server sends it. The bars
 *  and the length are there from the send; the transcript once offload has
 *  listened. `text` on the message stays the typed words. */
export interface VoiceOnWire {
  blobId: string;
  durationMs: number;
  waveform: number[];
  transcript: string | null;
  transcribed: boolean;
  /** This device only, never from the wire: the recording as an object URL,
   *  for the moment between the send and the server's copy. */
  localUrl?: string;
}

export { WAVEFORM_BARS } from "@offload/widgets";

export class VoiceRefused extends Error {
  constructor(readonly reason: "too_big" | "not_a_voice_note" | "daily_limit" | "storage_full" | "unavailable") {
    super(reason);
  }
}

/** Upload one voice note, ahead of the dump that will claim it. Idempotent
 *  on the client key, which belongs to the draft until it sends. */
export async function uploadVoice(
  audio: Blob,
  clientKey: string,
  durationMs: number,
  waveform: number[],
): Promise<{ blobId: string }> {
  const form = new FormData();
  form.append("clientKey", clientKey);
  form.append("durationMs", String(durationMs));
  form.append("waveform", JSON.stringify(waveform));
  form.append("file", audio, "voice-note");
  const response = await fetch(`${API}/v1/blobs/audio`, { method: "POST", credentials: "include", body: form });
  if (response.status === 413) throw new VoiceRefused("too_big");
  if (response.status === 415 || response.status === 400) throw new VoiceRefused("not_a_voice_note");
  if (response.status === 429) throw new VoiceRefused(await overLimit(response));
  if (response.status === 503) throw new VoiceRefused("unavailable");
  if (!response.ok) throw new Error(`upload failed: ${response.status}`);
  return (await response.json()) as { blobId: string };
}

/** Where a voice note is heard from: the bytes as they arrived, to the
 *  dumper's session, with Range. An `<audio>` needs `crossOrigin="use-credentials"`. */
export function voiceUrl(blobId: string): string {
  return `${API}/v1/blobs/${blobId}/audio`;
}

/** Ask once. The fallback, and the thing the stream is an optimisation over. */
export async function fetchAnswer(messageId: string): Promise<Answer | null> {
  const response = await reach(`${API}/v1/messages/${messageId}`, {
    credentials: "include",
  });
  if (!response) return null;
  // A captive portal answers 200 with a page: no answer, not a throw.
  const body = (await response.json().catch(() => null)) as {
    state: MessageState;
    reply: string | null;
    threads?: TouchedThread[];
    sources?: Source[];
    labels?: { id: string; name: string; colour: number }[];
    step?: string | null;
    changed?: string[];
    /** 028. Filed something, loose or not: what draws Done. */
    filed?: boolean;
    waiting?: WaitingOn | null;
    found?: FoundResult[];
    voice?: VoiceOnWire | null;
    photos?: PhotoOnWire[];
  } | null;
  if (!body) return null;
  return {
    state: body.state,
    reply: body.reply,
    threads: body.threads ?? [],
    sources: body.sources ?? [],
    labels: body.labels ?? [],
    step: body.step ?? null,
    changed: body.changed ?? [],
    filed: body.filed ?? false,
    waiting: body.waiting ?? null,
    found: body.found ?? [],
    voice: body.voice ?? null,
    // 041. The message's files as the server has them now.
    ...(body.photos ? { photos: body.photos } : {}),
  };
}

/** Wait for the answer over the stream, and fall back to asking.
 *
 *  Returns a cancel function. The caller cancels on unmount, which matters more
 *  than it looks: an EventSource left open holds a connection the server is
 *  paying to keep alive, and React in development mounts twice.
 */
export function awaitAnswer(
  messageId: string,
  onAnswer: (answer: Answer) => void,
  /** 017. What offload is doing, on a turn still in flight. */
  onStep?: (step: string | null) => void,
  /** 021. The transcript, the moment it is written, ahead of the reply. */
  onTranscript?: (text: string) => void,
): () => void {
  let done = false;
  let misses = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const settle = (answer: Answer): void => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    source.close();
    onAnswer(answer);
  };

  const source = new EventSource(`${API}/v1/messages/${messageId}/stream`, {
    withCredentials: true,
  });

  source.addEventListener("done", (event) => {
    settle(JSON.parse((event as MessageEvent).data) as Answer);
  });

  source.addEventListener("failed", (event) => {
    const body = JSON.parse((event as MessageEvent).data) as { voice?: VoiceOnWire | null };
    settle({ state: "failed", reply: null, voice: body.voice ?? null });
  });

  // 017. The one event that does not settle the stream. The server can send the
  // same line twice if something else woke its loop, and the client draws a step
  // rather than appending one, so a repeat is a no-op on screen.
  source.addEventListener("step", (event) => {
    if (done) return;
    const { text } = JSON.parse((event as MessageEvent).data) as { text: string };
    onStep?.(text);
  });

  // 021. Drawn, not appended: the server sends it on every wake after it is
  // written, so a repeat is a no-op on screen.
  source.addEventListener("transcript", (event) => {
    if (done) return;
    const { text } = JSON.parse((event as MessageEvent).data) as { text: string };
    onTranscript?.(text);
  });

  // A closed stream is not an answer, and it is not a failure either. The
  // server bounds every stream to five minutes so the session gets rechecked,
  // which means a perfectly healthy wait ends in `error` regularly. Asking is
  // the only way to tell the two apart.
  const ask = (): void => {
    // A throw is a miss like any other, or the poll would never ask again.
    void fetchAnswer(messageId).catch(() => null).then((answer) => {
      if (done) return;
      if (answer && isFinal(answer.state)) {
        settle(answer);
        return;
      }
      // 017. The reconnect path also catches the current step up, which is what
      // AC-6 asks for: the stream is the fast route and this is the one that
      // survives a dropped socket. 021: and the transcript, the same way.
      if (answer) {
        onStep?.(answer.step ?? null);
        if (answer.voice?.transcribed) onTranscript?.(answer.voice.transcript ?? "");
      }
      // Still thinking: the browser reconnects the EventSource on its own,
      // unless a reconnect was refused, which closes it for good. Then this
      // asks on the phones' cadence until the turn settles.
      if (source.readyState === EventSource.CLOSED) {
        misses += 1;
        timer = setTimeout(ask, answerPollMs(misses));
      }
    });
  };
  source.addEventListener("error", () => {
    if (done) return;
    ask();
  });

  return () => {
    done = true;
    clearTimeout(timer);
    source.close();
  };
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
  /** What an Undo would reverse. The whole turn, not this row. */
  turnId: string;
  /** When it was sent, for the thirty minute window. */
  createdAt?: string;
  /** **The server has always sent both of these.** They were missing from this
   *  type, so the composer's hydration was written without them and a reload
   *  dropped an answer's rows on the floor and left a waiting reply with
   *  nothing to answer it. The phones showed the same answer with its rows,
   *  which is what made it a web bug rather than a server one. */
  found: FoundResult[];
  waiting: WaitingOn | null;
  question?: QuestionOnWire | null;
  /** Where the turn filed, and where a fact in it came from: the footer's whole
   *  content. Added the day the footer was, because a reload dropped all three
   *  and this endpoint has now been the place a reload loses something three
   *  times. */
  threads: TouchedThread[];
  /** 028. Filed something, loose included: what draws Done after a reload. */
  filed?: boolean;
  sources: Source[];
  /** 025. On the person's message: what the turn applied. */
  labels: { id: string; name: string; colour: number }[];
}

/** 018. Answer a question by option. Null when the server refused it: the
 *  question is closed, answered elsewhere, or gone, and the chips simply go.
 *  The envelope is a dump's, so the composer waits for a country re-run the
 *  way it waits for anything else. */
export async function answerQuestion(
  id: string,
  option: number,
): Promise<{ status: number; sent: Sent | null }> {
  try {
    const response = await fetch(`${API}/v1/questions/${id}/answer`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", ...timeZoneHeader() },
      body: JSON.stringify({ option }),
    });
    if (!response.ok) return { status: response.status, sent: null };
    return { status: response.status, sent: (await response.json()) as Sent };
  } catch {
    // Offline, or the request never left. Not a refusal: the chips stay and
    // the line offers the retry.
    return { status: 0, sent: null };
  }
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

/** 027. Today's Answer, heard by the composer, which is nobody's child: load
 *  the current conversation again and take the focus. */
export const RESUME_COMPOSER = "offload:resume-composer";

/** 027. Make the conversation that asked a question the current one, so a
 *  question only typing answers can be answered from Today. A 404 is a
 *  question already closed. */
export async function resumeQuestion(id: string): Promise<"ok" | "gone" | "failed"> {
  try {
    const response = await fetch(`${API}/v1/questions/${id}/resume`, { method: "POST", credentials: "include" });
    if (response.ok) return "ok";
    return response.status === 404 ? "gone" : "failed";
  } catch {
    return "failed";
  }
}

/** The current conversation, so a reload does not look like a fresh account.
 *
 *  Without this the composer came up empty every time and AC-1's promise, that
 *  a dump sent before losing connectivity is there on next load, was true of
 *  the database and false of the product. */
export async function fetchCurrent(): Promise<TailMessage[]> {
  const response = await reach(`${API}/v1/conversations/current`, {
    credentials: "include",
  });
  if (!response) return [];
  const body = (await response.json()) as { messages: TailMessage[] };
  return body.messages;
}

/** Take back a whole turn: what you dumped, what offload filed, and what it
 *  said about it.
 *
 *  All three, because a reply saying "Added to Flat admin" that survives its
 *  own undo is a false sentence sitting permanently in the conversation. */
/** Stop a turn that is taking too long. 017.
 *
 *  **Fire and forget, deliberately.** AC-8 puts the screen back on the press and
 *  not on the reply: a stop that waits for a round trip looks broken on exactly
 *  the connection where somebody most wants to stop something.
 *
 *  Nothing is undone. Everything filed before the press stays filed, and Undo is
 *  the thing that reverses it.
 */
export async function cancelTurn(turnId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API}/v1/turns/${turnId}/cancel`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { stopped: boolean };
    return body.stopped;
  } catch {
    return false;
  }
}

/** False when the Undo did not land; otherwise the words of any memories it
 *  could not put back for want of room, usually none. */
export async function undoTurn(turnId: string): Promise<false | string[]> {
  const response = await reach(`${API}/v1/turns/${turnId}/undo`, {
    method: "POST",
    credentials: "include",
  });
  if (!response) return false;
  const body = (await response.json()) as { undone: boolean; stayed?: string[] };
  return body.undone && (body.stayed ?? []);
}

/** Finish a turn that stopped partway.
 *
 *  Not a re-send. The dump is still where it was and some of it is already
 *  filed; this asks offload to do the rest, and returns the same envelope a
 *  new dump does so the composer waits for it the same way. */
export async function resumeDump(messageId: string): Promise<Sent | "daily_limit" | "not_finishable" | "failed"> {
  const response = await fetch(`${API}/v1/dumps/${messageId}/resume`, {
    method: "POST",
    credentials: "include",
  }).catch(() => null);
  if (response?.status === 429) return "daily_limit";
  // Finished, or resumed from another device, since this screen drew it. A
  // 404 is gone for good, so it asks what the turn is now rather than Retry.
  if (response?.status === 409 || response?.status === 404) return "not_finishable";
  const sent = response?.ok ? ((await response.json().catch(() => null)) as Sent | null) : null;
  return sent ?? "failed";
}

/** End the current conversation, because somebody closed the composer.
 *
 *  Fire and forget on purpose. Closing the chat is instant on screen and must
 *  stay that way; if this request never lands, the worst case is that the next
 *  dump joins the conversation somebody put away, which is exactly what
 *  happened before it existed. Nothing waits on it and nothing is undone if it
 *  fails. */
export async function endConversation(): Promise<void> {
  try {
    await fetch(`${API}/v1/conversations/current/end`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Offline, or the tab is going away. Neither is worth a message: the
    // screen has already done the thing the person asked for.
  }
}

/** Answer a calendar write offload proposed but did not make.
 *
 *  Nothing has reached Google until this returns: the server runs the outward
 *  test again against live state, because a calendar can be shared in the
 *  minutes somebody takes to decide. */
export async function answerPending(
  id: string,
  answer: "confirm" | "decline"
): Promise<boolean> {
  try {
    const response = await fetch(`${API}/api/calendar/pending/${id}/${answer}`, {
      method: "POST",
      credentials: "include",
    });
    return response.ok;
  } catch {
    return false;
  }
}
