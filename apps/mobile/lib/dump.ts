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
  /** 019. On a calendar answer's response: the write that waits for them. */
  waiting?: WaitingOn | null;
}

/** A thread a turn actually wrote to, from the content rows it produced rather
 *  than from parsing the reply, so a link can never point somewhere offload did
 *  not file anything. */
export interface TouchedThread {
  id: string;
  name: string;
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
}

/** One read from an answer: a thread, and the rows it holds.
 *
 *  Grouped by the server in the order it read them. Two subjects is two
 *  results, never one blended list, because which trip is which is most of the
 *  answer. */
export interface FoundResult {
  threadId: string;
  threadName: string;
  /** The read hit its page. The tail becomes the thread rather than a control
   *  that would expand into rows nobody fetched. */
  truncated: boolean;
  rows: FoundRow[];
}

export interface FoundRow {
  contentId: string;
  threadId: string;
  threadName: string;
  type: string;
  title: string;
  body: string | null;
  done: boolean;
  /** 020. The row's photo, when it has one. */
  photo: { blobId: string; width: number; height: number; ready: boolean } | null;
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
  threads: TouchedThread[];
  sources: Source[];
  /** 017. What offload is doing, on a turn still in flight. Null once settled. */
  step: string | null;
  /** 018. The question this turn asked back, while it is open. */
  question: QuestionOnWire | null;
  /** Every thread whose contents the turn changed, a superset of `threads`.
   *  A move's source is here and not there: the screen has to reload it, and a
   *  pill saying the dump went there would be untrue. */
  changed: string[];
  waiting?: WaitingOn | null;
  /** What an answer showed. Empty on a dump, which files rather than answers.
   *
   *  Resolved by the server on every read, so a row ticked or deleted elsewhere
   *  is never stale inside a reply from last week. */
  found?: FoundResult[];
}

export interface TailMessage {
  id: string;
  role: "person" | "offload";
  text: string | null;
  /** 020. Empty on every reply. */
  photos?: PhotoOnWire[];
  state: MessageState;
  turnId: string;
  waiting?: WaitingOn | null;
  question?: QuestionOnWire | null;
  found?: FoundResult[];
  /** Where the turn filed, and where a fact in it came from. The footer's whole
   *  content, and a reload used to drop all of it. */
  threads?: TouchedThread[];
  sources?: Source[];
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
export async function sendDump(
  text: string,
  clientKey: string,
  threadId?: string,
  photos?: { blobIds: string[]; viaShare?: boolean },
): Promise<Sent | null> {
  const { status, data } = await send<Sent>("/v1/dumps", {
    method: "POST",
    body: JSON.stringify({
      text,
      clientKey,
      ...(threadId ? { threadId } : {}),
      ...(photos?.blobIds.length ? { blobIds: photos.blobIds, viaShare: Boolean(photos.viaShare) } : {}),
    }),
  });
  if (status === 413) throw new DumpTooLong(0);
  if (status === 409) throw new UnknownBlob();
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

/** A photo on a person's message, as the server sends it. `ready` is whether
 *  the renditions exist yet; until they do the thumbnail draws the glyph. */
export interface PhotoOnWire {
  blobId: string;
  name: string | null;
  width: number;
  height: number;
  ready: boolean;
  /** This device only, never from the wire: the file's uri, for the moment
   *  between the send and the renditions. */
  localUri?: string;
}

/** Per message, and the server holds the same number. */
export const MAX_PHOTOS = 10;
/** Per photo. The server holds the same number and refuses by bytes. */
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

/** What the product takes. A picker reports a MIME type most of the time and
 *  an extension the rest, so both are read. */
const PHOTO_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);
const PHOTO_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

export type PhotoRefusal = "too_big" | "not_a_photo" | "daily_limit" | "unavailable";

export function refusePhoto(file: { type: string | null; name: string; size: number | null }): "too_big" | "not_a_photo" | null {
  const type = (file.type ?? "").toLowerCase();
  const looksLikeOne = PHOTO_TYPES.has(type) || (!type && PHOTO_EXTENSIONS.test(file.name));
  if (!looksLikeOne) return "not_a_photo";
  if (file.size !== null && file.size > MAX_PHOTO_BYTES) return "too_big";
  return null;
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
): Promise<{ blobId: string; width: number; height: number }> {
  const form = new FormData();
  form.append("clientKey", clientKey);
  form.append("name", file.name);
  // Expo 57's fetch is the WinterCG one and takes a real `File` as a part;
  // React Native's old `{ uri, name, type }` shape is refused with
  // "Unsupported FormDataPart implementation", which is what the first send
  // from a Pixel got. `File` here is expo-file-system's, a Blob over the
  // uri, read as the request streams.
  form.append("file", new File(file.uri) as unknown as Blob, file.name || "photo");
  const { status, data } = await upload<{ blobId: string; width: number; height: number }>("/v1/blobs", form);
  if (status === 413) throw new PhotoRefused("too_big");
  if (status === 415) throw new PhotoRefused("not_a_photo");
  if (status === 429) throw new PhotoRefused("daily_limit");
  if (status === 503) throw new PhotoRefused("unavailable");
  if (!data) throw new Error(`upload failed: ${status}`);
  return data;
}

/** Where a rendition is read from. The session travels as a header, which
 *  `Image` takes on its source. */
export function photoUrl(blobId: string, rendition: "thumb" | "large"): string {
  return `${API_URL}/v1/blobs/${blobId}/${rendition}`;
}

/** Ask once. */
export async function fetchAnswer(messageId: string): Promise<Answer | null> {
  const { data } = await send<{
    state: MessageState;
    reply: string | null;
    threads?: TouchedThread[];
    sources?: Source[];
    step?: string | null;
    changed?: string[];
    waiting?: WaitingOn | null;
    question?: QuestionOnWire | null;
    // **The rows, which this used to drop on the floor.** `awaitAnswer` is the
    // only way an open app learns its turn is done, so leaving `found` out of
    // the parsed shape meant every answer rendered its sentence and none of its
    // rows. It looked like the server finding nothing, and it came back after a
    // force quit because the cold start reads `fetchCurrent` instead.
    found?: FoundResult[];
  }>(`/v1/messages/${messageId}`);
  if (!data) return null;
  return {
    state: data.state,
    reply: data.reply,
    threads: data.threads ?? [],
    sources: data.sources ?? [],
    step: data.step ?? null,
    changed: data.changed ?? [],
    waiting: data.waiting ?? null,
    question: data.question ?? null,
    found: data.found ?? [],
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
  onStep?: (step: string | null) => void
): { cancel: () => void; now: () => void } {
  let done = false;
  let misses = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let said: string | null = null;

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
export async function fetchCurrent(): Promise<TailMessage[]> {
  const { data } = await send<{ messages: TailMessage[] }>("/v1/conversations/current");
  return data?.messages ?? [];
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
