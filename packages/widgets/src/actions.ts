// 050. Found actions: what a dump says that one tap can act on, a link to
// open, a number to call, an address to write to. The agent gathers them and
// the model picks; these are the rules every surface applies again, at the
// write, at the read and before anything opens, because a stored row can be
// stale and a client cannot trust what it was sent.
//
// The same rules live in the agent's `found.py`, and both are held to
// `actions.fixtures.json` so the two languages cannot drift.

import { hostForAction } from "./threads.js";

export type ActionKind = "open" | "call" | "email";

// A plus and 8 to 15 digits, nothing else: no `*`, `#`, `,`, `;`, `p`, `w`, no
// percent escape, so nothing can be dialled before or after the number itself.
const TEL = /^tel:\+\d{8,15}$/;
// One plain address. No `?`, `&`, `,`, `%`, whitespace or control character, so
// a `bcc`, a `body` or a second recipient cannot ride along into the draft.
const MAILTO = /^mailto:[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/;

/** Whether a stored action's destination may be drawn and opened. */
export function isActionUrl(url: string | null | undefined): url is string {
  if (!url || url.length > 2048) return false;
  if (/^https?:\/\//i.test(url)) return hostForAction(url) !== null;
  if (url.startsWith("tel:")) return TEL.test(url);
  if (url.startsWith("mailto:")) return url.length <= 7 + 254 && MAILTO.test(url);
  return false;
}

export function actionKind(url: string | null | undefined): ActionKind | null {
  if (!isActionUrl(url)) return null;
  return url.startsWith("tel:") ? "call" : url.startsWith("mailto:") ? "email" : "open";
}

/** What the pill or the confirm shows: a link's host, a number grouped when it
 *  is North American and otherwise as stored, an address as stored.
 *  shortcut: other countries' numbers show ungrouped; add a numbering library
 *  if people find them hard to read. */
export function shownDestination(url: string | null | undefined): string | null {
  const kind = actionKind(url);
  if (kind === null) return null;
  if (kind === "open") return hostForAction(url);
  if (kind === "email") return url!.slice("mailto:".length);
  const digits = url!.slice("tel:+".length);
  return /^1\d{10}$/.test(digits)
    ? `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
    : `+${digits}`;
}

/** A label says what the tap does and never where it goes, so the only
 *  destination on screen is the one computed from the action itself: no
 *  scheme, no address, no host, no number, and no en or em dash (044 allowed
 *  the ASCII hyphen and still does). */
export function labelOk(label: string | null | undefined): boolean {
  // Look-alike dots (one-dot leader, fullwidth, ideographic) fold to "." first,
  // so `paypal\u2024com` is the host it pretends not to be.
  const text = (label ?? "").normalize("NFKC").replace(/[\u3002\uff61]/g, ".").trim();
  if (text.length < 1 || text.length > 24) return false;
  if (/[‐-―−]/.test(text)) return false;
  if (/[a-z][a-z0-9+.-]*:\S/i.test(text)) return false;
  if (text.includes("@")) return false;
  if (/[\w-]+\.[a-z]{2,}/i.test(text)) return false;
  if (/\p{Nd}(?:[\s.()-]?\p{Nd}){3,}/u.test(text)) return false;
  return true;
}
