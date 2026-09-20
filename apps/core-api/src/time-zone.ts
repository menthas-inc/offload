// The device's time zone, from the request.
//
// **A header, not a field, so it is one line per client rather than one per
// call site.** Every request that can reach the model (a dump, a typed or
// tapped answer, a row typed into a thread) carries `X-Time-Zone` from the
// client's fetch wrapper, and the routes that write the message or the job
// read it here. The account has no time zone of its own yet; when it does,
// that is the fallback and this stays the device's word.
//
// **Resolved by ICU, never stored as sent.** The value goes into a prompt
// and into `at time zone` in a query, so it is the one string on a request
// that is both model input and SQL input. What is kept is the name ICU
// resolves the header to, held to the same alphabet: `US/Pacific-New`
// becomes `America/Los_Angeles`, `utc` becomes `UTC`, and `+0500`, which ICU
// accepts and resolves to `+05:00`, fails the alphabet and is dropped, which
// is right because Postgres would read that sign the other way. An unknown
// name is dropped rather than refused: the request is still a good dump, and
// UTC is what every message before this had. Resolved by asking ICU rather
// than checked against `supportedValuesOf`, whose list is the canonical names
// only: Chrome on some platforms still answers `Asia/Calcutta`, which ICU
// accepts and the canonical list does not carry.

import type { FastifyRequest } from "fastify";

export const TIME_ZONE_HEADER = "x-time-zone";

const SHAPE = /^[A-Za-z0-9_+\-/]{1,64}$/;

/** ICU's word on each name, cached because the same few names come every
 *  request. Capped, so an authenticated flood of junk names costs a lookup
 *  per request and no memory. */
const resolved = new Map<string, string | null>();

/** The IANA name ICU resolves this to, or null when it is not one. */
export function resolveTimeZone(value: string): string | null {
  if (!SHAPE.test(value)) return null;
  let name = resolved.get(value);
  if (name === undefined) {
    try {
      const found = new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
      name = SHAPE.test(found) ? found : null;
    } catch {
      name = null;
    }
    if (resolved.size < 1000) resolved.set(value, name);
  }
  return name;
}

/** The header's IANA name as ICU resolves it, else null. */
export function timeZoneOf(request: FastifyRequest): string | null {
  const raw = request.headers[TIME_ZONE_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  return resolveTimeZone(value);
}
