// What may be sent to Google to put a place on a map (030).
//
// **The one gate in front of Google, and it refuses rather than guesses.**
// Google's terms forbid sending it any end user's personal information, and
// Google keeps what it receives to improve its own products. A place's name
// is not personal; a street address, a flat number, a phone number or a
// person's home often is. So a query leaves only if it looks like the name of
// a public place and nothing else, and a real place that happens to have a
// number in it (*Terminal 2*) loses its point. That is the price of a filter
// that never has to be right about what a string means.
//
// Every source goes through here: a saved place's name, an event's location,
// a place name read from a page, and a calendar entry's location written by
// somebody else. The callers do not each decide.

import { createHmac } from "node:crypto";

/** Long enough for any place name, short enough that a paragraph is not one.
 *  The same bound a location's title already has (006). */
export const PLACE_QUERY_CHARS = 120;

/** Words that name a call, or a place that is not one. Whole words only, so
 *  *Zoomarine* is a place and *Zoom* is not. */
const NO_PLACE = /\b(zoom|google meet|meet|teams|webex|whereby|jitsi|online|phone|call|tbc|tbd)\b/i;

/** A possessive at the end of a word: somebody's home, by name. Either
 *  apostrophe, since phones type the curly one. */
const POSSESSIVE = /\p{L}['’]s\b/u;

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** The query to send, or null when nothing may be sent.
 *
 *  Tidied first (NFC, control characters out, whitespace collapsed), then
 *  refused for: a line break, an empty or overlong string, any digit, an `@`,
 *  a web address, a possessive, or a call or no-place word. */
export function placeQuery(raw: string): string | null {
  if (/[\r\n]/.test(raw)) return null;
  const q = raw.normalize("NFC").replace(CONTROL, "").replace(/\s+/g, " ").trim();
  if (q.length === 0 || q.length > PLACE_QUERY_CHARS) return null;
  if (/\p{Nd}/u.test(q)) return null;
  if (q.includes("@")) return null;
  if (q.includes("://") || /^www\./i.test(q)) return null;
  if (POSSESSIVE.test(q)) return null;
  if (NO_PLACE.test(q)) return null;
  return q;
}

/** The query cache's key: a keyed hash, so a copy of the table is not a
 *  dictionary of places people mentioned. Lowercased and whitespace collapsed
 *  first, so two spellings of one phrase are one entry. The pepper lives in
 *  the environment, never in the database. */
export function queryKey(q: string, pepper: string): string {
  if (!pepper) throw new Error("PLACE_HASH_PEPPER is not set");
  const normalised = q.trim().toLowerCase().replace(/\s+/g, " ");
  return createHmac("sha256", pepper).update(normalised).digest("hex");
}
