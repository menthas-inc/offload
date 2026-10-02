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

/** Somebody's home, by name. A possessive in any apostrophe a phone types
 *  (straight, curly, modifier), the plural form (*the Silvas'*), and the
 *  shapes this product's languages use instead: *casa da Ana*, *chez Ana*,
 *  *bei Ana*. */
const POSSESSIVE = /\p{L}['’ʼ]s\b|\p{L}s['’ʼ](?=\s|$)|\bcasa d[aeo]s?\s|\bchez\s|\bbei\s/iu;

/** A street with no number is still an address. Refused only when the street
 *  word leads, as addresses are written, so *Baker Street* the name passes and
 *  *Rua da Saudade* does not. */
const STREET = /^(rua|r\.|avenida|av\.?|travessa|tv\.?|calçada|largo|praça|estrada|street|st\.|road|rd\.?|lane|ln\.?|drive|dr\.?|boulevard|blvd\.?|way)(\s|$)/iu;

/** A web address with no scheme and no `www.`: a dot, then two to six letters
 *  ending a word (*around.co*). */
const BARE_HOST = /\.\p{L}{2,6}\b/u;

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** The query to send, or null when nothing may be sent.
 *
 *  Tidied first (NFKC, control characters out, whitespace collapsed), then
 *  refused for: a line break, an empty or overlong string, any digit, an `@`
 *  or a `/`, a web address with or without `www.`, a possessive, a leading
 *  street word, or a call or no-place word. **A filter, not a guarantee**: a
 *  bare person's name with none of those marks passes, and the privacy page
 *  says what this does rather than what it hopes to catch. */
export function placeQuery(raw: string): string | null {
  if (/[\r\n]/.test(raw)) return null;
  // NFKC, so a full-width or compatibility digit is a digit.
  const q = raw.normalize("NFKC").replace(CONTROL, "").replace(/\s+/g, " ").trim();
  if (q.length === 0 || q.length > PLACE_QUERY_CHARS) return null;
  if (/\p{N}/u.test(q)) return null;
  if (q.includes("@") || q.includes("/")) return null;
  if (/^www\./i.test(q) || BARE_HOST.test(q)) return null;
  if (POSSESSIVE.test(q)) return null;
  if (STREET.test(q)) return null;
  if (NO_PLACE.test(q)) return null;
  return q;
}

/** The query cache's key: a keyed hash, so a copy of the table is not a
 *  dictionary of places people mentioned. Lowercased and whitespace collapsed
 *  first, so two spellings of one phrase are one entry. The pepper lives in
 *  the environment, never in the database. */
export function queryKey(q: string, pepper: string): string {
  return keyed("lookup", q, pepper);
}

/** A calendar event's fingerprint of the location it last looked up, so an
 *  unchanged location is not looked up twice without keeping a second copy of
 *  somebody else's words. Its own domain, so it can never be joined to the
 *  query cache's key. */
export function calendarKey(text: string, pepper: string): string {
  return keyed("calendar", text, pepper);
}

function keyed(domain: string, text: string, pepper: string): string {
  if (!pepper) throw new Error("PLACE_HASH_PEPPER is not set");
  const normalised = text.trim().toLowerCase().replace(/\s+/g, " ");
  return createHmac("sha256", pepper).update(`${domain}|${normalised}`).digest("hex");
}
