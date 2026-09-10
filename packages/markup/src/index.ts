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

const STRONG = /\*\*([^*\n]+)\*\*/;
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/;

/** Whether a link may point here.
 *
 *  A path inside the product, and nothing else. Not `//host`, which a browser
 *  reads as a protocol-relative URL to somewhere else entirely, and not a
 *  backslash, which some parsers normalise into one. */
function addressable(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\");
}

/** One line of text into its inline pieces.
 *
 *  Left to right, taking whichever of the two markers comes first, so `**a**`
 *  inside a link label and a link inside emphasis both resolve the same way on
 *  every surface rather than depending on which pass ran first. */
export function inlines(line: string): Inline[] {
  const out: Inline[] = [];
  let rest = line;

  while (rest.length > 0) {
    const strong = STRONG.exec(rest);
    const link = LINK.exec(rest);
    const at = Math.min(strong?.index ?? Infinity, link?.index ?? Infinity);

    if (at === Infinity) break;

    const first = (strong?.index ?? Infinity) <= (link?.index ?? Infinity) ? "strong" : "link";
    const match = first === "strong" ? strong! : link!;

    if (at > 0) out.push({ kind: "text", text: rest.slice(0, at) });

    if (first === "strong") {
      out.push({ kind: "strong", text: match[1]! });
    } else if (addressable(match[2]!)) {
      out.push({ kind: "link", text: match[1]!, href: match[2]! });
    } else {
      // Somewhere offload does not own. Kept exactly as written, which is the
      // failure direction that cannot be used against anybody.
      out.push({ kind: "text", text: match[0]! });
    }

    rest = rest.slice(at + match[0]!.length);
  }

  if (rest.length > 0) out.push({ kind: "text", text: rest });
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
  return blocks.slice(0, MAX_BLOCKS);
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
