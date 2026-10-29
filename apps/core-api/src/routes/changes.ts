// 048. The live connection: `GET /v1/changes`.
//
// One server-sent event stream per open client, saying that something it may
// be showing changed, never what. The screens read again through the reads
// they already use. `live/hub.ts` decides who hears what; this holds the
// socket, re-checks the session, and ends.

import type { App } from "../app.js";
import { currentAccountId } from "../auth/current-account.js";
import { attach } from "../live/hub.js";
import { STREAM_SESSION_MS, openEventStream, refuseOrigin } from "./event-stream.js";

/** Then the client reconnects, which makes every open screen read again.
 *  Twice the message stream's five minutes, since a reconnect here costs every
 *  screen a read where that one costs one message; jittered by a fifth either
 *  way so the streams opened after a deploy do not all end, and all read, in
 *  the same second. */
const LIFETIME_MS = 600_000;

export async function changeRoutes(app: App): Promise<void> {
  app.get("/v1/changes", async (request, reply) => {
    if (refuseOrigin(request, reply)) return;
    const accountId = await currentAccountId(request);
    if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

    const opened = Date.now();
    let closed = false;
    let sent = 0;
    let detach: (() => void) | null = null;
    let clock: ReturnType<typeof setInterval> | undefined;
    let lifetime: ReturnType<typeof setTimeout> | undefined;

    const finish = (): void => {
      if (closed) return;
      closed = true;
      detach?.();
      clearInterval(clock);
      clearTimeout(lifetime);
      if (!reply.raw.writableEnded) reply.raw.end();
      // One line when it ends, never one per event: a line per change would
      // be an activity record in the host's logs, and so would an info line
      // at every open, so that one is debug.
      request.log.info({ accountId, lived: Date.now() - opened, events: sent }, "live stream closed");
    };
    request.raw.on("close", finish);

    openEventStream(request, reply);
    // A socket that dies mid-write emits on the response; unhandled, that is
    // an uncaught exception on a process serving everybody else.
    reply.raw.on("error", finish);

    const write = (chunk: string): void => {
      if (closed || reply.raw.writableEnded) return;
      try {
        reply.raw.write(chunk);
      } catch {
        finish();
      }
    };

    request.log.debug({ accountId }, "live stream opened");
    // With data: a browser dispatches no event whose data is empty.
    write("event: ready\ndata: {}\n\n");

    // The session on a clock, because a stream makes no request for Better
    // Auth to refuse: this is the window in which a signed out, disabled or
    // deleted account's stream ends. And a comment frame, so an idle proxy
    // does not drop a stream that is waiting for something to happen.
    clock = setInterval(() => {
      void currentAccountId(request)
        .catch(() => null)
        .then((still) => {
          if (still !== accountId) return finish();
          write(": keep-alive\n\n");
        });
    }, STREAM_SESSION_MS);
    lifetime = setTimeout(finish, LIFETIME_MS * (0.8 + Math.random() * 0.4));

    try {
      detach = await attach(accountId, {
        send: (changes) => {
          sent += 1;
          write(`event: changes\ndata: ${JSON.stringify(changes)}\n\n`);
        },
        close: finish,
      });
      // The socket went while the hub was listening.
      if (closed) detach();
    } catch {
      // Not listening: end it, and the client comes back and reads again.
      finish();
    }
  });
}
