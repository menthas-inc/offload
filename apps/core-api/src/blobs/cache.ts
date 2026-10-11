// How long a client may keep a picture it read: a rendition or a mark.
//
// A browser keeps it in its own HTTP cache, which the web relies on: a mark
// never changes and is drawn on every list, and a rendition is kept for
// minutes. The phones fetch the same bytes into a folder of their own, which
// they forget when a session ends, and their HTTP stack keeps a second copy
// that nothing on the phone can clear: iOS's URLCache has no handle from
// JavaScript. On 2026-10-11 a phone showed a deleted account's photo to the
// next one, so that second copy is refused.
//
// A browser says it is one in `Sec-Fetch-Dest`, which every current browser
// sends on every request and no page can set; the phones' native stacks never
// send it. Anything that does not say so gets `no-store`, so the failure is a
// browser that fetches again, never a phone that keeps a copy. The rule stays
// that way round: a positive rule would have to name every client that may
// keep a copy, and a client nobody named would keep one.
//
// The answer depends on that header, so it is named in `Vary`, added to
// whatever is there already (CORS puts `Origin` there): a cache between a
// phone and the API that holds a browser's answer must not hand it to a phone.

import type { FastifyReply, FastifyRequest } from "fastify";

export function pictureCache(request: FastifyRequest, reply: FastifyReply, browser: string): void {
  reply.header("Cache-Control", request.headers["sec-fetch-dest"] ? browser : "private, no-store");
  const vary = reply.getHeader("vary");
  reply.header("Vary", vary ? `${String(vary)}, Sec-Fetch-Dest` : "Sec-Fetch-Dest");
}
