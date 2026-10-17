// What offload is allowed to write, and what a reply is allowed to draw.
//
// **A parser, not a markdown library, and the difference is the point.** Every
// markdown package is a superset of what anybody wants: raw HTML passthrough,
// images, tables, autolinking. A reply is written by a model that has just read
// rows other people wrote, so the honest question is not "which library" but
// "what may a reply contain at all", and that is a list short enough to write
// down. Anything not on it stays as the characters somebody typed.
//
// **No HTML, ever, on any surface.** This returns a tree the client draws with
// its own components. Nothing here produces a string that a browser parses, so
// there is no sanitiser to keep correct and no `dangerouslySetInnerHTML` for a
// later change to reintroduce.
//
// **Links are internal only.** An external URL in a reply is a phishing surface
// with the product's own voice around it, and the text it would be built from
// can come from a row somebody else wrote (SEC-1). A link may address a screen
// offload owns and nothing else; anything else stays literal, so the worst a
// hostile row achieves is printing its own characters.
//
// One package rather than one copy per client, for the reason `@offload/widgets`
// exists: two surfaces reading the same reply differently is a drift problem
// with a date on it.

/** Inline pieces. Deliberately three: text, emphasis, and a way to somewhere. */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "link"; text: string; href: string };

/** Block pieces. A paragraph, the two kinds of list, and a quote.
 *
 *  `lines` on a paragraph rather than one string, because a single newline is a
 *  line break somebody meant and a blank line is a new paragraph. Collapsing
 *  both loses an address or a set of hours that was written to be read down. */
export type Block =
  | { kind: "paragraph"; lines: Inline[][] }
  | { kind: "bullets"; items: Inline[][] }
  | { kind: "numbers"; items: Inline[][] }
  | { kind: "quote"; lines: Inline[][] };

/** How many blocks a reply may have.
 *
 *  offload writes short. This is not a layout constraint, it is what stops a
 *  reply becoming a document: past this the model is writing an essay and the
 *  answer belongs on a screen rather than in a bubble. Anything beyond the cap
 *  is kept, as the paragraphs it already was, so nothing a person said is ever
 *  dropped for being long. */
export const MAX_BLOCKS = 12;

/** Items drawn in one list before the rest run on as a paragraph. */
export const MAX_ITEMS = 10;

/** What a backslash may hide, and why there is one at all.
 *
 *  **Content contains these characters.** A calendar really is named `P**B`,
 *  and a row somebody wrote can hold an asterisk or a bracket for its own
 *  reasons. Without an escape the model has no way to say "these two asterisks
 *  are part of the name" and a name turns half a sentence bold, or worse,
 *  swallows it. The model already writes `\*`, correctly, so this is the half
 *  that was missing rather than a new idea.
 *
 *  Only the characters that mean something here. A backslash before anything
 *  else is a backslash, because somebody writing a Windows path should see it. */
const ESCAPABLE = new Set(["*", "[", "]", "(", ")", ">", "-", "\\", "`"]);

/** Whether a link may point here.
 *
 *  A path inside the product, and nothing else.
 *
 *  **Prefix matching against a URL is not safe on its own, and this is why.**
 *  A URL parser strips tab, carriage return and newline from anywhere in a URL
 *  before it interprets it, so `/<tab>/evil.example` is not the path it looks
 *  like: every browser reads it as `//evil.example`, a protocol-relative
 *  reference, and navigates to somebody else's host keeping this one's scheme.
 *  It passed all three checks that used to be here, because it starts with one
 *  slash and the second character is a tab.
 *
 *  That is reachable. A row somebody else wrote in a shared thread can contain
 *  a link, the prompt asks for quotes to be exact, and the reply renders it as
 *  a real styled link inside offload's own bubble. Phishing in the product's
 *  own voice is the worst thing this file could produce.
 *
 *  So: nothing a parser would strip or normalise may be in the string at all,
 *  and what is left has to look like a path from the first character to the
 *  last. Deliberately string work rather than `new URL`, which is a polyfill of
 *  varying completeness on React Native and would make this depend on the
 *  runtime it happens to be drawn in. */
function addressable(href: string): boolean {
  // Anything a URL parser removes rather than rejects. Tab, CR and LF are the
  // dangerous three; the rest of C0 and DEL have no business here either.
  if (/[\u0000-\u001F\u007F]/.test(href)) return false;
  // Leading and trailing spaces are stripped the same way, so a href with them
  // is not the href it appears to be.
  if (href !== href.trim()) return false;
  if (!href.startsWith("/")) return false;
  // `//host` is another origin. `/\host` is the same thing after a backslash
  // is normalised, which some parsers do.
  if (href.startsWith("//") || href.startsWith("/\\")) return false;
  // No climbing. It cannot leave the app, since there is no filesystem under a
  // route, but a link that resolves somewhere other than where it reads is the
  // same class of surprise this function exists to refuse.
  if (href.split("/").includes("..")) return false;
  // A browser decodes `%2e%2e` into `..` before it resolves the path, but only
  // as a whole segment: `a%2Eb` is a name, not a climb.
  const path = href.split(/[?#]/)[0]!;
  if (path.split("/").some((segment) => [".", ".."].includes(segment.replace(/%2e/gi, ".")))) return false;
  // An encoded slash or backslash keeps `%2e%2e%2fadmin` one segment here, and
  // anything that decodes the path before resolving it would climb.
  if (/%2f|%5c/i.test(path)) return false;
  return true;
}

/** Read one line, character by character, so an escape is understood.
 *
 *  A scanner rather than a regular expression, and the reason is exactly the
 *  escape: a pattern that has to skip `\*` while matching `**` is unreadable
 *  and was wrong. This is longer and says what it does.
 */
export function inlines(line: string): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  let i = 0;

  // **Emphasis applies only when the markers balance.**
  //
  // Content contains these characters and the model is not reliably going to
  // escape them. A calendar named `P**B` written plainly leaves three `**` on
  // the line, so the first two pair around whatever happens to sit between
  // them: "PB, **writable, files into** EU with fam**". The reply then asserts
  // emphasis nobody wrote, over the wrong words, and a stray marker at the end.
  //
  // An odd count means at least one marker is part of somebody's data, and
  // there is no way to tell which. So the line keeps all of them as characters.
  // It reads a little worse and it cannot say something wrong, which is the
  // trade every other decision in this file makes too.
  const marks = (): number => {
    let count = 0;
    for (let at = 0; at < line.length; at += 1) {
      if (line[at] === "\\") {
        at += 1;
        continue;
      }
      if (line.startsWith("**", at)) {
        count += 1;
        at += 1;
      }
    }
    return count;
  };
  const balanced = marks() % 2 === 0;

  const flush = (): void => {
    if (buffer.length > 0) out.push({ kind: "text", text: buffer });
    buffer = "";
  };

  /** The next unescaped occurrence of `marker`, or -1.
   *
   *  **The absence is remembered, and that is not an optimisation.** A search
   *  that reaches the end of the line without finding its marker will do the
   *  same from any later position, because nothing ahead has changed. Without
   *  the note, a line of unmatched brackets makes every one of them scan the
   *  whole remainder: 48,000 characters took two and a half seconds, on the
   *  thread that draws the screen, from text derived from what somebody dumped.
   *  With it each marker is looked for once. */
  const absent = new Set<string>();
  const find = (marker: string, from: number): number => {
    if (absent.has(marker)) return -1;
    for (let at = from; at < line.length; at += 1) {
      if (line[at] === "\\") {
        at += 1;
        continue;
      }
      if (line.startsWith(marker, at)) return at;
    }
    absent.add(marker);
    return -1;
  };

  /** A run with its escapes resolved, for use as a label or a bold word. */
  const unescaped = (raw: string): string => {
    let text = "";
    for (let at = 0; at < raw.length; at += 1) {
      const here = raw[at]!;
      const next = raw[at + 1];
      if (here === "\\" && next !== undefined && ESCAPABLE.has(next)) {
        text += next;
        at += 1;
        continue;
      }
      text += here;
    }
    return text;
  };

  while (i < line.length) {
    const here = line[i]!;
    const next = line[i + 1];

    if (here === "\\" && next !== undefined && ESCAPABLE.has(next)) {
      buffer += next;
      i += 2;
      continue;
    }

    if (balanced && here === "*" && next === "*") {
      const close = find("**", i + 2);
      if (close > i + 2) {
        flush();
        out.push({ kind: "strong", text: unescaped(line.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    }

    if (here === "[") {
      const closeLabel = find("]", i + 1);
      if (closeLabel > 0 && line[closeLabel + 1] === "(") {
        const closeHref = find(")", closeLabel + 2);
        if (closeHref > 0) {
          const label = unescaped(line.slice(i + 1, closeLabel));
          const href = unescaped(line.slice(closeLabel + 2, closeHref));
          flush();
          if (addressable(href)) {
            out.push({ kind: "link", text: label, href });
          } else {
            // Somewhere offload does not own. Kept as the characters it was,
            // which is the failure direction that cannot be used against
            // anybody.
            out.push({ kind: "text", text: line.slice(i, closeHref + 1) });
          }
          i = closeHref + 1;
          continue;
        }
      }
    }

    buffer += here;
    i += 1;
  }

  flush();
  return out.length > 0 ? out : [{ kind: "text", text: "" }];
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

/** A reply into the blocks a client draws.
 *
 *  Plain text parses to one paragraph, which is what almost every reply is and
 *  is why nothing here has to be opted into. */
export function parse(text: string): Block[] {
  const blocks: Block[] = [];
  // Normalised first, because a model writes whichever newline it likes and a
  // stray carriage return would end up inside a line as an invisible character.
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const collect = (
      pattern: RegExp,
    ): string[] => {
      const items: string[] = [];
      while (i < lines.length) {
        const match = pattern.exec(lines[i]!);
        if (!match) break;
        items.push(match[1]!);
        i += 1;
      }
      return items;
    };

    if (BULLET.test(line)) {
      const items = collect(BULLET);
      blocks.push({ kind: "bullets", items: items.slice(0, MAX_ITEMS).map(inlines) });
      // Past the cap the rest are still said, as a paragraph, because dropping
      // them would be offload quietly deciding somebody did not need to know.
      for (const extra of items.slice(MAX_ITEMS)) {
        blocks.push({ kind: "paragraph", lines: [inlines(extra)] });
      }
      continue;
    }

    if (NUMBER.test(line)) {
      const items = collect(NUMBER);
      blocks.push({ kind: "numbers", items: items.slice(0, MAX_ITEMS).map(inlines) });
      for (const extra of items.slice(MAX_ITEMS)) {
        blocks.push({ kind: "paragraph", lines: [inlines(extra)] });
      }
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted = collect(QUOTE);
      blocks.push({ kind: "quote", lines: quoted.map(inlines) });
      continue;
    }

    // A run of ordinary lines. Each newline inside it is a break somebody meant,
    // and the run ends at a blank line or at the first line that is a list or a
    // quote, so a paragraph never swallows the block below it.
    const paragraph: string[] = [];
    while (i < lines.length) {
      const next = lines[i]!;
      if (next.trim() === "") break;
      if (BULLET.test(next) || NUMBER.test(next) || QUOTE.test(next)) break;
      paragraph.push(next.trim());
      i += 1;
    }
    blocks.push({ kind: "paragraph", lines: paragraph.map(inlines) });
  }

  if (blocks.length === 0) return [{ kind: "paragraph", lines: [[{ kind: "text", text }]] }];
  if (blocks.length <= MAX_BLOCKS) return blocks;
  // Past the cap, the rest run on as one last paragraph rather than being dropped.
  const rest = blocks
    .slice(MAX_BLOCKS - 1)
    .flatMap((block) => (block.kind === "bullets" || block.kind === "numbers" ? block.items : block.lines));
  return [...blocks.slice(0, MAX_BLOCKS - 1), { kind: "paragraph", lines: rest }];
}

/** Whether a reply uses anything beyond one plain paragraph.
 *
 *  A client can skip the richer drawing entirely for the common case, which is
 *  most replies, without either surface deciding for itself what counts. */
export function isPlain(blocks: readonly Block[]): boolean {
  if (blocks.length !== 1) return false;
  const only = blocks[0]!;
  if (only.kind !== "paragraph" || only.lines.length !== 1) return false;
  return only.lines[0]!.every((piece) => piece.kind === "text");
}

/** Whether this reply needs more than one line of plain text.
 *
 *  **A bubble has to know before it draws.** A bubble shrink-wraps its content,
 *  which is right for a sentence and wrong for a list: the width comes out of
 *  the first line and everything that wraps afterwards runs outside it. So the
 *  container asks this and stretches instead of hugging.
 *
 *  Here rather than in each client, because both of them have the same bubble
 *  and would otherwise each decide what "rich" means. */
export function isRich(text: string): boolean {
  return !isPlain(parse(text));
}

/** The reply with its markers removed, for anywhere that cannot draw them.
 *
 *  A notification, a widget, an accessibility label. Without this each of those
 *  grows its own stripper and they disagree about what a link looks like. */
export function plainText(text: string): string {
  return parse(text)
    .flatMap((block) =>
      block.kind === "bullets" || block.kind === "numbers" ? block.items : block.lines,
    )
    .map((line) => line.map((piece) => piece.text).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// A session's device in words, for the "Signed in on" list on both surfaces.
export { byDevice, describeDevice, type DeviceSessions } from "./device.js";
