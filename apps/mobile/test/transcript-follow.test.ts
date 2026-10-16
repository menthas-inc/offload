import { describe, expect, it } from "vitest";
import { atEnd, sentBy } from "../lib/transcript-follow";

// The owner, 2026-10-16: the thinking row sometimes sat half under the
// composer, most often after a photo, and had to be scrolled to. The
// transcript was scrolled to its end once per new turn, before a photo or the
// row had its height. It now follows its end whenever its content grows,
// while the reader is there, and holds still while they have scrolled away.
describe("atEnd", () => {
  it("is at the end when the last of the content shows", () => {
    expect(atEnd({ offset: 400, layout: 600, content: 1000, inset: 0 })).toBe(true);
  });

  it("is not while the reader has scrolled up", () => {
    expect(atEnd({ offset: 100, layout: 600, content: 1000, inset: 0 })).toBe(false);
  });

  it("counts the keyboard's inset: a last turn behind the keyboard is not the end", () => {
    expect(atEnd({ offset: 400, layout: 600, content: 1000, inset: 336 })).toBe(false);
    expect(atEnd({ offset: 736, layout: 600, content: 1000, inset: 336 })).toBe(true);
  });

  it("allows a scroll that stops a little short", () => {
    expect(atEnd({ offset: 380, layout: 600, content: 1000, inset: 0 })).toBe(true);
  });

  it("is at the end of a conversation shorter than the screen", () => {
    expect(atEnd({ offset: 0, layout: 600, content: 600, inset: 0 })).toBe(true);
  });
});

describe("sentBy", () => {
  const you = (id: string) => ({ id, from: "you" as const });
  const them = (id: string) => ({ id, from: "offload" as const });

  it("is true when the person sent something", () => {
    expect(sentBy(1, [you("a"), them("b"), you("c")])).toBe(true);
  });

  it("is false for a reply from offload", () => {
    expect(sentBy(1, [you("a"), them("b")])).toBe(false);
  });

  it("is false when a sent turn only changes its id from the provisional one", () => {
    expect(sentBy(1, [you("real")])).toBe(false);
  });
});
