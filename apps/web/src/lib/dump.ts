// Sending a dump and waiting for the answer.
//
// Two ways to the same answer, on purpose. The stream is the fast path and the
// plain fetch is the one that cannot fail to arrive: a browser that slept, lost
// its connection, or hit a proxy that closed an idle stream still gets the
// answer by asking for it. The stream is an optimisation over polling, and the
// fallback is what makes it safe to be one.

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export type MessageState = "queued" | "seen" | "answered" | "failed";

export interface Sent {
  messageId: string;
  conversationId: string;
  state: MessageState;
}

export interface Answer {
  state: MessageState;
  reply: string | null;
}

export class DumpTooLong extends Error {
  constructor(readonly maxChars: number) {
    super("too long");
  }
}

/** Send it. The server stores it before anything else, so a resolved promise
 *  means the dump is safe even if nothing ever answers it. */
export async function sendDump(text: string, clientKey: string): Promise<Sent> {
  const response = await fetch(`${API}/v1/dumps`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, clientKey }),
  });

  if (response.status === 413) {
    const body = (await response.json()) as { maxChars: number };
    throw new DumpTooLong(body.maxChars);
  }
  if (!response.ok) throw new Error(`dump failed: ${response.status}`);
  return (await response.json()) as Sent;
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
  };
  return { state: body.state, reply: body.reply };
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

  // A closed stream is not an answer, and it is not a failure either. The
  // server bounds every stream to five minutes so the session gets rechecked,
  // which means a perfectly healthy wait ends in `error` regularly. Asking is
  // the only way to tell the two apart.
  source.addEventListener("error", () => {
    if (done) return;
    void fetchAnswer(messageId).then((answer) => {
      if (!answer) return;
      if (answer.state === "answered" || answer.state === "failed")
        settle(answer);
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
  state: MessageState;
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
