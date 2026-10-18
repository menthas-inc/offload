// A thread's rows as both clients draw them: a link's domain, a span of the
// day, and a row drawn at the press before the server has written it.

// The package compiles without the DOM library; both clients have `URL`.
declare const URL: new (url: string) => { hostname: string };

/** The registrable domain of a URL, for a row that is a link.
 *
 *  The same string the source chip shows, and for the same reason: it is the
 *  part a person recognises, and it is ours rather than the page's. A title is
 *  written by whoever owns the page; a domain is not.
 *
 *  Null rather than a guess when it cannot be parsed, so a row never claims to
 *  be somewhere it is not. */
export function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

const PROVISIONAL = "provisional:";

/** An id for a row that only this screen knows about yet. */
export function provisionalId(): string {
  return `${PROVISIONAL}${Math.random().toString(36).slice(2, 10)}`;
}

/** Whether a row is one this screen made up. Such a row offers nothing: no
 *  tick, no tools, no link, because there is nothing on the server to act on. */
export function isProvisional(id: string): boolean {
  return id.startsWith(PROVISIONAL);
}

/** What a section's + writes, mirroring the server's own table. A sentence
 *  with no widget type to start as is a note. */
export function startsAs(section: string): "task" | "location" | "event" | null {
  switch (section) {
    case "todo":
      return "task";
    case "timeline":
      return "event";
    default:
      return null;
  }
}

/** A span of the day in the kit's shape: the meridiem once, on the end, so
 *  the time column stays even, and "to" between, never a dash. */
export function rangeOf(startIso: string, endIso: string | null): string {
  const format = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const clock = (iso: string, meridiem: boolean) =>
    format
      .formatToParts(new Date(iso))
      .filter((part) => meridiem || part.type !== "dayPeriod")
      .map((part) => (part.type === "dayPeriod" ? part.value.toLowerCase() : part.value))
      .join("")
      .replace(/\s+(am|pm)$/, "$1")
      .trim();
  return endIso ? `${clock(startIso, false)} to ${clock(endIso, true)}` : clock(startIso, true);
}
