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

/** 044. The host to show before a PDF's action opens, so a tap reveals where it
 *  leads before anything loads.
 *
 *  Computed on the client from the parsed URL, never a string the server
 *  composed: the full host in ASCII (`URL` returns punycode), with userinfo,
 *  path and query gone, control and bidirectional characters stripped, and the
 *  end kept when it is long, because the registrable domain sits at the end and
 *  the bait is a long prefix. So `https://lufthansa.com@evil.ru/` shows
 *  `evil.ru`, `lufthansa.com.evil.ru` shows itself whole, and a mixed-script
 *  look-alike shows its `xn--` form. Null when the URL will not parse or is not
 *  http(s): nothing is shown and nothing opens. Not an eTLD+1, which would need
 *  a public-suffix list whose extraction is its own spoofing surface (DEV-3). */
const HOST_CLIP = 30;

export function hostForAction(url: string | null | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  // C0 and C1 control characters and the bidirectional overrides, stripped so a
  // host cannot repaint itself as another. `URL` rejects most, this is the belt.
  host = host.replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, "").toLowerCase();
  if (!host) return null;
  if (host.length <= HOST_CLIP) return host;
  return host.slice(0, 2) + "…" + host.slice(host.length - (HOST_CLIP - 3));
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
