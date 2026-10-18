// What a reply may contain, and what it may never contain.
//
// The parser is shared by both clients, so this is the file that stops them
// disagreeing about what offload wrote. It lives here because web already runs
// pure-logic tests and the package has no test runner of its own; if a third
// caller appears, it moves.
//
// The half that matters most is the refusals. A reply is written by a model
// that has just read rows other people wrote, so every case below asking what
// happens to something hostile is asking what a stranger can put on somebody
// else's screen (SEC-1).

import { describe, expect, it } from "vitest";
import {
  MAX_BLOCKS,
  MAX_ITEMS,
  inlines,
  isPlain,
  isRich,
  parse,
  plainText,
} from "@offload/markup";

describe("plain text stays plain", () => {
  it("parses an ordinary reply to one paragraph", () => {
    const blocks = parse("Filed to Lisbon trip.");
    expect(blocks).toEqual([
      { kind: "paragraph", lines: [[{ kind: "text", text: "Filed to Lisbon trip." }]] },
    ]);
    expect(isPlain(blocks)).toBe(true);
  });

  it("says a richer reply is not plain, so a client can skip the work", () => {
    expect(isPlain(parse("- one\n- two"))).toBe(false);
    expect(isPlain(parse("**Two** left."))).toBe(false);
  });

  it("never returns nothing, whatever it was handed", () => {
    expect(parse("")).toHaveLength(1);
    expect(parse("   \n  \n")).toHaveLength(1);
  });
});

describe("the four things a reply may say", () => {
  it("emphasises a word", () => {
    expect(inlines("**Two** left.")).toEqual([
      { kind: "strong", text: "Two" },
      { kind: "text", text: " left." },
    ]);
  });

  it("keeps a single newline as a break somebody meant", () => {
    // An address or a set of hours is written to be read down. Collapsing this
    // to one line is the thing a naive renderer gets wrong.
    const blocks = parse("Rua do Século 12\nLisbon");
    expect(blocks).toEqual([
      {
        kind: "paragraph",
        lines: [
          [{ kind: "text", text: "Rua do Século 12" }],
          [{ kind: "text", text: "Lisbon" }],
        ],
      },
    ]);
  });

  it("starts a new paragraph on a blank line", () => {
    expect(parse("One.\n\nTwo.")).toHaveLength(2);
  });

  it("reads both kinds of list, and a quote", () => {
    expect(parse("- one\n- two")[0]).toMatchObject({ kind: "bullets" });
    expect(parse("* one\n* two")[0]).toMatchObject({ kind: "bullets" });
    expect(parse("1. one\n2. two")[0]).toMatchObject({ kind: "numbers" });
    expect(parse("> what they wrote")[0]).toMatchObject({ kind: "quote" });
  });

  it("does not let a paragraph swallow the list under it", () => {
    const blocks = parse("Three left.\n- one\n- two");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "bullets"]);
  });
});

describe("a link may address offload and nowhere else", () => {
  it("takes an internal path", () => {
    expect(inlines("Check [connected apps](/settings/apps).")).toEqual([
      { kind: "text", text: "Check " },
      { kind: "link", text: "connected apps", href: "/settings/apps" },
      { kind: "text", text: "." },
    ]);
  });

  for (const hostile of [
    "[click here](https://evil.example/login)",
    "[click here](http://evil.example)",
    "[click here](//evil.example)",
    "[click here](javascript:alert(1))",
    "[click here](data:text/html,<script>alert(1)</script>)",
    "[click here](/\\evil.example)",
  ]) {
    it(`refuses ${hostile.slice(12, 40)} and keeps it as characters`, () => {
      // **The failure direction that cannot be used against anybody.** An
      // external link in a reply is a phishing surface wearing the product's
      // voice, and the words in it can come from a row a stranger wrote. Left
      // as text, the worst it achieves is printing itself.
      const parsed = inlines(hostile);
      expect(parsed.every((piece) => piece.kind === "text")).toBe(true);
      expect(parsed.map((p) => p.text).join("")).toBe(hostile);
    });
  }

  it("never produces anything a browser would parse as markup", () => {
    const parsed = parse("<script>alert(1)</script>\n<img src=x onerror=alert(1)>");
    const text = parsed
      .flatMap((b) => (b.kind === "paragraph" || b.kind === "quote" ? b.lines : b.items))
      .flatMap((line) => line.map((piece) => piece.text))
      .join("");
    // It comes back as the characters it was. There is no HTML path at all:
    // the client draws this tree with its own components.
    expect(text).toContain("<script>");
    expect(parsed.every((b) => b.kind === "paragraph")).toBe(true);
  });
});

describe("a reply cannot become a document", () => {
  it("caps the blocks it will draw, and runs what is past the cap on as one paragraph", () => {
    const long = Array.from({ length: MAX_BLOCKS + 6 }, (_, i) => `Line ${i}.`).join("\n\n");
    const blocks = parse(long);
    expect(blocks).toHaveLength(MAX_BLOCKS);
    expect(blocks.at(-1)).toMatchObject({ kind: "paragraph" });
    expect(plainText(long)).toContain(`Line ${MAX_BLOCKS + 5}.`);
  });

  it("keeps the end of a list long enough to pass the block cap", () => {
    const items = Array.from({ length: 25 }, (_, i) => `- item ${i + 1}`).join("\n");
    expect(parse(items).length).toBeLessThanOrEqual(MAX_BLOCKS);
    expect(plainText(items)).toContain("item 25");
  });

  it("keeps what overflows a list rather than dropping it", () => {
    // Dropping would be offload quietly deciding somebody did not need to know.
    const items = Array.from({ length: MAX_ITEMS + 3 }, (_, i) => `- item ${i}`).join("\n");
    const blocks = parse(items);
    expect(blocks[0]).toMatchObject({ kind: "bullets" });
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(MAX_ITEMS);
    expect(blocks.slice(1).every((b) => b.kind === "paragraph")).toBe(true);
    expect(plainText(items)).toContain(`item ${MAX_ITEMS + 2}`);
  });
});

describe("plainText, for anywhere that cannot draw", () => {
  it("strips the markers and keeps the words", () => {
    expect(plainText("**Two** left in [Lisbon](/threads/1).")).toBe("Two left in Lisbon.");
  });

  it("flattens a list into a sentence", () => {
    expect(plainText("Two left.\n- Book the flat\n- Find a restaurant")).toBe(
      "Two left. Book the flat Find a restaurant",
    );
  });
});

describe("content contains these characters, so a backslash has to mean something", () => {
  // **Found by driving the real app.** A calendar is genuinely named `P**B`.
  // The model escaped it correctly, as `P\*\*B`, and the parser did not
  // understand escapes, so a reply about it printed the backslashes and the
  // name never went bold. Every other reply on the screen looked right, which
  // is why it read as the renderer being broken rather than one name being
  // unusual.
  it("renders a name that contains asterisks", () => {
    expect(inlines("One calendar, **P\\*\\*B**, filing into EU with fam.")).toEqual([
      { kind: "text", text: "One calendar, " },
      { kind: "strong", text: "P**B" },
      { kind: "text", text: ", filing into EU with fam." },
    ]);
  });

  it("keeps an escaped marker as a character rather than a marker", () => {
    expect(inlines("2 \\* 3 is six")).toEqual([{ kind: "text", text: "2 * 3 is six" }]);
    expect(inlines("\\[not a link\\](/settings)")).toEqual([
      { kind: "text", text: "[not a link](/settings)" },
    ]);
  });

  it("does not let an escaped marker close an emphasis early", () => {
    // The bug in the regular expression this replaced: it could not skip an
    // escaped marker while looking for the closing one.
    expect(inlines("**a \\* b** rest")).toEqual([
      { kind: "strong", text: "a * b" },
      { kind: "text", text: " rest" },
    ]);
  });

  it("leaves a lone backslash alone", () => {
    // Somebody writing a path should see it. Only the characters that mean
    // something here are escapable.
    expect(inlines("C:\\Users\\behrooz")).toEqual([
      { kind: "text", text: "C:\\Users\\behrooz" },
    ]);
  });

  it("leaves an unclosed marker as characters", () => {
    expect(inlines("2 ** 3")).toEqual([{ kind: "text", text: "2 ** 3" }]);
    expect(inlines("a [label without a target")).toEqual([
      { kind: "text", text: "a [label without a target" },
    ]);
  });

  it("still refuses an external link even when the label is escaped", () => {
    const parsed = inlines("[click \\* here](https://evil.example)");
    expect(parsed.every((p) => p.kind === "text")).toBe(true);
  });
});

describe("isRich, which is what a bubble asks before it draws", () => {
  it("is false for the reply almost every reply is", () => {
    expect(isRich("Filed to Lisbon trip.")).toBe(false);
  });

  it("is true for anything a bubble cannot hug", () => {
    // A bubble shrink-wraps, which takes its width from the longest unbroken
    // line. For a list that width comes from the first line and everything
    // wrapping afterwards is drawn against the edge of it.
    expect(isRich("Three connected:\n- one\n- two")).toBe(true);
    expect(isRich("**Two** left.")).toBe(true);
    expect(isRich("Rua do Século 12\nLisbon")).toBe(true);
  });
});

describe("a stray marker cannot assert emphasis nobody wrote", () => {
  // Seen on a real phone. A calendar is named P**B, the model wrote it plainly
  // that time, and the line ended up with three markers. The first two paired
  // around whatever sat between them: "PB, **writable, files into** EU with
  // fam**". The reply emphasised the wrong words and left a marker hanging.
  it("leaves an odd number of markers as characters", () => {
    const line = "PB**, writable, files into EU with fam";
    expect(inlines(line)).toEqual([{ kind: "text", text: line }]);
  });

  it("does not pair markers across an unescaped name", () => {
    const line = "P**B, writable, files into** EU with fam**";
    const parsed = inlines(line);
    expect(parsed.every((p) => p.kind === "text")).toBe(true);
    expect(parsed.map((p) => p.text).join("")).toBe(line);
  });

  it("still emphasises when they balance", () => {
    expect(inlines("**Two** left, **three** found")).toEqual([
      { kind: "strong", text: "Two" },
      { kind: "text", text: " left, " },
      { kind: "strong", text: "three" },
      { kind: "text", text: " found" },
    ]);
  });

  it("counts an escaped marker as data, not as a marker", () => {
    // The escaped pair is not a marker, so the two real ones still balance.
    expect(inlines("**P\\*\\*B** files into EU with fam")).toEqual([
      { kind: "strong", text: "P**B" },
      { kind: "text", text: " files into EU with fam" },
    ]);
  });

  it("leaves a link alone on a line whose emphasis does not balance", () => {
    // Balance governs emphasis only. A link has its own delimiters and its own
    // refusal, and one stray asterisk should not take the way out of a reply.
    expect(inlines("PB** see [apps](/settings/apps)")).toEqual([
      { kind: "text", text: "PB** see " },
      { kind: "link", text: "apps", href: "/settings/apps" },
    ]);
  });
});
