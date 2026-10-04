// The landing page, one scroll (handoff/APPLY-2026-10-04-landing.md).
//
// Google's OAuth review opens offload.club signed out and reads the page: what
// offload is, and that it connects to Google Calendar and why. So the test is
// what a reader with no JavaScript gets: the markup the server sends, with
// every step's words in it and none of them hidden.

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: Landing } = await import("../src/app/(marketing)/page");
const html = renderToStaticMarkup(<Landing />);
const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const source = (path: string) => readFileSync(`${process.cwd()}/src/${path}`, "utf8");

const STEPS = [
  [
    "What it is",
    "Send it. offload files it.",
    "offload is a place to put down what is on your mind: notes, links, photos and voice notes. It reads each one and files it into a thread, one for each thing you are keeping track of.",
  ],
  ["Getting things in", "Send it as is", "Type it, say it, snap it, or forward it."],
  [
    "Threads",
    "Everything lands in threads",
    "Related things gather in one thread. Share it, and plan it with the people in it.",
  ],
  [
    "Google Calendar",
    "Works with your Google Calendar",
    "Connect your Google Calendar and offload can show what is on it and add or change events when you ask.",
  ],
] as const;

describe("the landing page, as the server sends it", () => {
  it("keeps the hero: the name, the sentence and the waitlist", () => {
    expect(html).toMatch(/<h1[^>]*>.*offload.*for you.*<\/h1>/s);
    expect(text).toContain("Dump whatever is cluttering your mind, and offload sorts it for you.");
    expect(text).toContain("Join the waitlist");
    expect(text).toContain("See how it works");
  });

  it("says what offload is and why it connects to Google Calendar, verbatim", () => {
    for (const [kicker, heading, body] of STEPS) {
      expect(text).toContain(kicker);
      expect(html).toContain(`>${heading}</h2>`);
      expect(text).toContain(body);
    }
    expect(text).toContain(
      "You select which calendars offload may use, and you can disconnect in Settings at any time.",
    );
    expect(html).toMatch(/<a[^>]*href="\/privacy"[^>]*>How offload handles your calendar<\/a>/);
  });

  it("closes on the waitlist again", () => {
    expect(html).toContain(">offload keeps track for you</h2>");
    expect(text).toContain(
      "offload is invite only for now. Join the waitlist and we will email you when your account is ready to use.",
    );
    expect(html.match(/<form/g)).toHaveLength(2);
    // Two forms, one page: an id may not repeat.
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("hides none of the story's words: no aria-hidden and no display none around a step", () => {
    const story = html.slice(html.indexOf("data-landing-story"), html.indexOf("data-landing-end"));
    for (const [, heading, body] of STEPS) {
      expect(story).toContain(heading);
      expect(story).toContain(body);
    }
    // The drawings are decoration and may be hidden from a reader; the text
    // column of a step may not, and nothing is display:none.
    for (const step of story.split("data-step=").slice(1)) {
      const words = step.slice(0, step.indexOf("data-drawing"));
      expect(words).not.toContain("aria-hidden");
    }
    expect(story).not.toMatch(/display:\s*none/);
    expect(story).not.toMatch(/\shidden=/);
  });

  it("names privacy and terms in the footer, and signs in from the header", () => {
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/sign-in"');
  });

  it("is written without a dash", () => {
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("the calendar sentence claims no more than the privacy page", () => {
  it("says show, add and change, which /privacy says too", () => {
    const privacy = source("app/(marketing)/privacy/page.tsx").replace(/\s+/g, " ");
    expect(privacy).toMatch(/calendar/i);
    expect(privacy).toMatch(/\badd/i);
    expect(privacy).toMatch(/\bchange/i);
    expect(text).not.toMatch(/delete[^.]*calendar|calendar[^.]*delete/i);
  });
});

describe("the frame's scroll mode", () => {
  it("is asked for by the landing page alone, and the documents stay pinned", () => {
    expect(source("app/(marketing)/page.tsx")).toContain("<Screen scroll>");
    expect(source("app/(marketing)/privacy/page.tsx")).toContain('atmosphere="pinned"');
    expect(source("app/(marketing)/terms/page.tsx")).toContain('atmosphere="pinned"');
  });

  it("draws the atmosphere in scroll mode with no per-wash turbulence", () => {
    const atmosphere = source("components/Atmosphere.tsx");
    expect(atmosphere).toContain('mode === "scroll"');
    expect(atmosphere).toContain("uniform float hue;uniform float zm;");
    const css = source("components/atmosphere.module.css");
    const scroll = css.slice(css.indexOf(".atmosphere.scroll"));
    expect(scroll).not.toContain("url(#atmo");
  });
  // A custom property on the frame is inherited by every element of the page,
  // so writing one per scroll frame restyles and repaints the whole document:
  // 500ms of style and 240ms of paint in a six second scroll, measured. The
  // numbers go on the elements that read them.
  it("writes the scroll position on the elements that read it, never on the frame", () => {
    const progress = source("components/ScrollProgress.tsx");
    expect(progress).not.toContain("frame.style.setProperty");
    expect(progress).toContain("[data-scroll-cue]");
    expect(html).toContain("data-scroll-cue");
  });

  it("draws the film at most thirty times a second however fast the scroll", () => {
    const atmosphere = source("components/Atmosphere.tsx");
    expect(atmosphere).toContain("SCROLL_FILM_INTERVAL_MS = 33");
    expect(atmosphere).toContain("now - lastDraw >= SCROLL_FILM_INTERVAL_MS");
  });
});
