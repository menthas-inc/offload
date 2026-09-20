// The device's time zone, from the request.
//
// **A header, not a field, so it is one line per client rather than one per
// call site.** Every request that can reach the model (a dump, a typed or
// tapped answer, a row typed into a thread) carries `X-Time-Zone` from the
// client's fetch wrapper, and the routes that write the message or the job
// read it here. The account has no time zone of its own yet; when it does,
// that is the fallback and this stays the device's word.
//
// **Checked against ICU, never stored as sent.** The value goes into a prompt
// and into `at time zone` in a query, so it is the one string on a request
// that is both model input and SQL input. An unknown name is dropped rather
// than refused: the request is still a good dump, and UTC is what every
// message before this had. Checked by asking ICU to format with it rather
// than against `supportedValuesOf`, whose list is the canonical names only:
// Chrome on some platforms still answers `Asia/Calcutta`, which ICU accepts
// and the canonical list does not carry.

import type { FastifyRequest } from "fastify";

export const TIME_ZONE_HEADER = "x-time-zone";

/** ICU's word on the name, cached because the same few names come every
 *  request. */
const known = new Map<string, boolean>();

export function isTimeZone(value: string): boolean {
  if (value.length === 0 || value.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(value)) return false;
  let ok = known.get(value);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      ok = true;
    } catch {
      ok = false;
    }
    if (known.size < 1000) known.set(value, ok);
  }
  return ok;
}

/** The header's IANA name when ICU knows it, else null. */
export function timeZoneOf(request: FastifyRequest): string | null {
  const raw = request.headers[TIME_ZONE_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  return isTimeZone(value) ? value : null;
}
