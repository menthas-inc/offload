// Sending a dump and waiting for the answer.
//
// Two ways to the same answer, on purpose. The stream is the fast path and the
// plain fetch is the one that cannot fail to arrive: a browser that slept, lost
// its connection, or hit a proxy that closed an idle stream still gets the
// answer by asking for it. The stream is an optimisation over polling, and the
// fallback is what makes it safe to be one.

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
}

/** A thread a turn actually wrote to. From the content rows it produced, not
 *  from parsing the reply, so a link can never point somewhere offload did not
 *  file anything. */
export interface TouchedThread {
  id: string;
  name: string;
}

/** One read from an answer: a thread, and the rows it holds.
 *
 *  Grouped by the server, in the order it read them. Two subjects is two
 *  results, never one blended list, because which trip is which is most of the
 *  answer. */
export interface FoundResult {
  threadId: string;
  threadName: string;
  /** The read hit its page. The tail becomes the thread rather than a Show more
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
  threads?: TouchedThread[];
  sources?: Source[];
  /** 017. What offload is doing, on a turn still in flight. Null once settled. */
  step?: string | null;
  /** 018. The question this turn asked back, while it is open. */
  question?: QuestionOnWire | null;
  /** A calendar write offload proposed and nobody has answered yet. Only ever
   *  set on a write that reaches somebody else: guests, or a calendar marked
   *  shared. A write nobody learns about just happens, with the ordinary Undo. */
  waiting?: { id: string; because: string } | null;
  /** Every thread whose contents the turn changed, a superset of `threads`.
   *  A move's source is here and not there: the screen has to reload it, and a
   *  pill saying the dump went there would be untrue. */
  changed?: string[];
  /** What an answer showed. Empty for a dump, which files rather than answers.
   *
   *  Resolved by the server every time it is read, so a row ticked or deleted
   *  elsewhere is never stale inside an old answer. */
  found?: FoundResult[];
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
export async function sendDump(
  text: string,
  clientKey: string,
  threadId?: string,
  photos?: { blobIds: string[]; viaShare?: boolean },
): Promise<Sent> {
  const response = await fetch(`${API}/v1/dumps`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text,
      clientKey,
      ...(threadId ? { threadId } : {}),
      ...(photos?.blobIds.length ? { blobIds: photos.blobIds, viaShare: Boolean(photos.viaShare) } : {}),
    }),
  });

  if (response.status === 413) {
    const body = (await response.json()) as { maxChars: number };
    throw new DumpTooLong(body.maxChars);
  }
  if (response.status === 409) throw new UnknownBlob();
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

/** A photo on a person's message, as the server sends it. `ready` is whether
 *  the renditions exist yet; until they do the thumbnail draws the glyph. */
export interface PhotoOnWire {
  blobId: string;
  name: string | null;
  width: number;
  height: number;
  ready: boolean;
  /** This device only, never from the wire: the file as an object URL, for
   *  the moment between the send and the renditions. */
  localUrl?: string;
}

/** Per message, and the server holds the same number. */
export const MAX_PHOTOS = 10;
/** Per photo. The server holds the same number and refuses by bytes. */
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
/** What the product takes. Checked by extension too, because a browser
 *  reports an empty type for HEIC. */
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const PHOTO_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

export function isPhoto(file: File): boolean {
  return PHOTO_TYPES.has(file.type.toLowerCase()) || (file.type === "" && PHOTO_EXTENSIONS.test(file.name));
}

/** Why a photo was refused on the device, or null when it may go. The one
 *  line each is the failure table's. */
export function refusePhoto(file: File): "too_big" | "not_a_photo" | null {
  if (!isPhoto(file)) return "not_a_photo";
  if (file.size > MAX_PHOTO_BYTES) return "too_big";
  return null;
}

export class PhotoRefused extends Error {
  constructor(readonly reason: "too_big" | "not_a_photo" | "daily_limit" | "unavailable") {
    super(reason);
  }
}

/** Upload one photo, ahead of the dump that will claim it. Idempotent on the
 *  client key, which belongs to the draft until it sends. */
export async function uploadPhoto(
  file: File,
  clientKey: string,
): Promise<{ blobId: string; width: number; height: number }> {
  const form = new FormData();
  form.append("clientKey", clientKey);
  if (file.name) form.append("name", file.name);
  form.append("file", file, file.name || "photo");
  const response = await fetch(`${API}/v1/blobs`, { method: "POST", credentials: "include", body: form });
  if (response.status === 413) throw new PhotoRefused("too_big");
  if (response.status === 415) throw new PhotoRefused("not_a_photo");
  if (response.status === 429) throw new PhotoRefused("daily_limit");
  if (response.status === 503) throw new PhotoRefused("unavailable");
  if (!response.ok) throw new Error(`upload failed: ${response.status}`);
  return (await response.json()) as { blobId: string; width: number; height: number };
}

/** Where a rendition is read from. The session cookie reaches the API on its
 *  own origin, so an `<img>` needs `crossOrigin="use-credentials"` and
 *  nothing else. */
export function photoUrl(blobId: string, rendition: "thumb" | "large"): string {
  return `${API}/v1/blobs/${blobId}/${rendition}`;
}

/** Ask once. The fallback, and the thing the stream is an optimisation over. */
export async function fetchAnswer(messageId: string): Promise<Answer | null> {
  const response = await fetch(`${API}/v1/messages/${messageId}`, {
    credentials: "include",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    state: MessageState;
    reply: string | null;
    threads?: TouchedThread[];
    sources?: Source[];
    step?: string | null;
    changed?: string[];
    waiting?: { id: string; because: string } | null;
    found?: FoundResult[];
  };
  return {
    state: body.state,
    reply: body.reply,
    threads: body.threads ?? [],
    sources: body.sources ?? [],
    step: body.step ?? null,
    changed: body.changed ?? [],
    waiting: body.waiting ?? null,
    found: body.found ?? [],
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
): () => void {
  let done = false;

  const settle = (answer: Answer): void => {
    if (done) return;
    done = true;
    source.close();
    onAnswer(answer);
  };

  const source = new EventSource(`${API}/v1/messages/${messageId}/stream`, {
    withCredentials: true,
  });

  source.addEventListener("done", (event) => {
    settle(JSON.parse((event as MessageEvent).data) as Answer);
  });

  source.addEventListener("failed", () => {
    settle({ state: "failed", reply: null });
  });

  // 017. The one event that does not settle the stream. The server can send the
  // same line twice if something else woke its loop, and the client draws a step
  // rather than appending one, so a repeat is a no-op on screen.
  source.addEventListener("step", (event) => {
    if (done) return;
    const { text } = JSON.parse((event as MessageEvent).data) as { text: string };
    onStep?.(text);
  });

  // A closed stream is not an answer, and it is not a failure either. The
  // server bounds every stream to five minutes so the session gets rechecked,
  // which means a perfectly healthy wait ends in `error` regularly. Asking is
  // the only way to tell the two apart.
  source.addEventListener("error", () => {
    if (done) return;
    void fetchAnswer(messageId).then((answer) => {
      if (!answer) return;
      if (
        answer.state === "answered" ||
        answer.state === "partial" ||
        answer.state === "failed" ||
        // 017. A stopped turn is over. Without this the reconnect loop would
        // keep asking about a turn nobody is working on.
        answer.state === "cancelled"
      )
        settle(answer);
      // 017. The reconnect path also catches the current step up, which is what
      // AC-6 asks for: the stream is the fast route and this is the one that
      // survives a dropped socket.
      else onStep?.(answer.step ?? null);
      // Still thinking: the browser reconnects the EventSource on its own.
    });
  });

  return () => {
    done = true;
    source.close();
  };
}

export interface TailMessage {
  id: string;
  role: "person" | "offload";
  text: string | null;
  /** 020. Empty on every reply. */
  photos?: PhotoOnWire[];
  state: MessageState;
  /** What an Undo would reverse. The whole turn, not this row. */
  turnId: string;
  /** **The server has always sent both of these.** They were missing from this
   *  type, so the composer's hydration was written without them and a reload
   *  dropped an answer's rows on the floor and left a waiting reply with
   *  nothing to answer it. The phones showed the same answer with its rows,
   *  which is what made it a web bug rather than a server one. */
  found: FoundResult[];
  waiting: { id: string; because: string } | null;
  question?: QuestionOnWire | null;
  /** Where the turn filed, and where a fact in it came from: the footer's whole
   *  content. Added the day the footer was, because a reload dropped all three
   *  and this endpoint has now been the place a reload loses something three
   *  times. */
  threads: TouchedThread[];
  sources: Source[];
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
      headers: { "content-type": "application/json" },
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
 *  placeholder is the invitation. */
export function invitation(question: QuestionOnWire): string {
  const typedOnly = question.options.every((o) => o.kind === "plain");
  if (!typedOnly) return question.text;
  switch (question.field) {
    case "span":
      return "Which dates? Type them, like 10 to 12 October";
    case "date":
      return "By when? Type a day, like 30 September";
    case "time":
      return "Which day and time? Type them, like Friday at 10";
    default:
      return question.text;
  }
}

/** The current conversation, so a reload does not look like a fresh account.
 *
 *  Without this the composer came up empty every time and AC-1's promise, that
 *  a dump sent before losing connectivity is there on next load, was true of
 *  the database and false of the product. */
export async function fetchCurrent(): Promise<TailMessage[]> {
  const response = await fetch(`${API}/v1/conversations/current`, {
    credentials: "include",
  });
  if (!response.ok) return [];
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

export async function undoTurn(turnId: string): Promise<boolean> {
  const response = await fetch(`${API}/v1/turns/${turnId}/undo`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) return false;
  const body = (await response.json()) as { undone: boolean };
  return body.undone;
}

/** Finish a turn that stopped partway.
 *
 *  Not a re-send. The dump is still where it was and some of it is already
 *  filed; this asks offload to do the rest, and returns the same envelope a
 *  new dump does so the composer waits for it the same way. */
export async function resumeDump(messageId: string): Promise<Sent | null> {
  const response = await fetch(`${API}/v1/dumps/${messageId}/resume`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) return null;
  return (await response.json()) as Sent;
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
