// What a link in a reply may point at, attacked rather than assumed.
//
// Separate from `markup.test.ts` because these are one thing: the gate that
// decides a href is inside offload. That gate was wrong, and the way it was
// wrong is worth keeping in front of whoever changes it next.
//
// **A URL parser strips tab, carriage return and newline from anywhere in a URL
// before it interprets it.** So a href whose second character is a tab is not
// the path it looks like: every browser reads `/<tab>/evil.example` as
// `//evil.example`, a protocol relative reference, and navigates to somebody
// else's host keeping this one's scheme. It passed all three prefix checks that
// used to guard this, because it starts with exactly one slash.
//
// That is reachable rather than theoretical. A row somebody else wrote in a
// shared thread can contain a link, the answering prompt asks for quotes to be
// exact, and the reply draws it as a real styled link inside offload's own
// bubble. Phishing in the product's voice is the worst thing this package could
// produce, which is why the gate now refuses anything a parser would rewrite.
//
// The characters are built with `String.fromCharCode` on purpose: written
// literally they are invisible in a diff and in a review, which is most of how
// this class of bug survives.

import { describe, expect, it } from "vitest";
import { inlines } from "@offload/markup";

const TAB = String.fromCharCode(9);
const NEWLINE = String.fromCharCode(10);
const VERTICAL_TAB = String.fromCharCode(11);
const FORM_FEED = String.fromCharCode(12);
const CARRIAGE_RETURN = String.fromCharCode(13);
const NUL = String.fromCharCode(0);
const DELETE = String.fromCharCode(127);

describe("a link is refused when a URL parser would read it as somewhere else", () => {
  const hostile: [string, string][] = [
    ["tab", `/${TAB}/evil.example`],
    ["carriage return", `/${CARRIAGE_RETURN}/evil.example`],
    ["newline", `/${NEWLINE}/evil.example`],
    ["vertical tab", `/${VERTICAL_TAB}/evil.example`],
    ["form feed", `/${FORM_FEED}/evil.example`],
    ["nul", `/${NUL}/evil.example`],
    ["delete", `/${DELETE}/evil.example`],
    ["a control character further in", `/settings/${TAB}/evil.example`],
    ["leading space", " /settings/apps"],
    ["trailing space", "/settings/apps "],
    ["climbing out of the app", "/../../evil"],
    ["climbing from inside", "/threads/../../evil"],
    ["climbing with encoded dots, which a browser decodes", "/threads/%2e%2e/settings"],
    ["climbing with encoded capitals", "/threads/%2E%2E/settings"],
    ["an encoded single dot segment", "/threads/%2E/x"],
    ["half encoded dots", "/threads/.%2e/settings"],
  ];

  for (const [name, href] of hostile) {
    it(`refuses ${name}`, () => {
      const parsed = inlines(`[click here](${href})`);
      expect(
        parsed.every((piece) => piece.kind === "text"),
        `it made a link out of ${JSON.stringify(href)}`,
      ).toBe(true);
    });
  }

  it("still takes an ordinary path", () => {
    expect(inlines("[apps](/settings/apps)")[0]).toEqual({
      kind: "link",
      text: "apps",
      href: "/settings/apps",
    });
  });

  it("takes a thread link, which is the other one offload writes", () => {
    expect(inlines("[Lisbon trip](/threads/01a08cd4)")[0]).toMatchObject({
      kind: "link",
      href: "/threads/01a08cd4",
    });
  });

  it("takes an encoded dot inside a segment, which is no dot segment", () => {
    expect(inlines("[x](/threads/a%2Eb)")[0]).toMatchObject({ kind: "link", href: "/threads/a%2Eb" });
  });

  it("takes a space inside the path, which is encoded rather than stripped", () => {
    // Not the same class. A parser percent encodes this and the origin does not
    // move, so refusing it would be superstition rather than defence.
    expect(inlines("[x](/threads/my thread)")[0]).toMatchObject({ kind: "link" });
  });
});

describe("a line of unmatched markers cannot hang the screen", () => {
  it("parses a pathological line without going quadratic", () => {
    // A search that fails cannot succeed from a later position, so the absence
    // is remembered. Without that, every unmatched bracket rescanned the whole
    // remainder: 48,000 characters took two and a half seconds, on the thread
    // that draws the screen, from text derived from what somebody dumped.
    //
    // **The assertion is the runner's own timeout rather than a stopwatch.** A
    // quadratic parser takes long enough here to fail the suite outright, and a
    // measured bound would be a flake on a busy machine.
    const line = "[a(".repeat(16000);
    expect(inlines(line).map((piece) => piece.text).join("")).toBe(line);
  });

  it("does the same for unmatched emphasis", () => {
    const line = "**".repeat(16000) + "x";
    expect(inlines(line).map((piece) => piece.text).join("")).toBe(line);
  });
});
