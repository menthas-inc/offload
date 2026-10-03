// 033 First run, three screens: the decisions the flow makes, as functions,
// since these tests render nothing. AC-1, AC-2, AC-3, AC-7, AC-15.

import { describe, expect, it } from "vitest";
import { afterYou, autoAdvance, bringCards, firstStep, introNext, SCENE_MS } from "../lib/firstRun";
import { INTRO, INTRO_DUMPS } from "../lib/gate";

describe("033 the flow", () => {
  it("starts on the intro, or on the name alone for an account that finished first run before names", () => {
    expect(firstStep({ replay: false, nameOnly: false })).toBe("intro");
    expect(firstStep({ replay: true, nameOnly: false })).toBe("intro");
    expect(firstStep({ replay: false, nameOnly: true })).toBe("you");
  });

  it("draws only the cards that apply, Mail, Calendar, Notifications", () => {
    expect(bringCards({ mailAvailable: true, calendarOffer: true, notifications: "ask" })).toEqual([
      "mail",
      "calendar",
      "notifications",
    ]);
    // An Apple hidden email, a connector that is off or already connected, a
    // permission already decided or a surface with none.
    expect(bringCards({ mailAvailable: false, calendarOffer: true, notifications: "decided" })).toEqual(["calendar"]);
    expect(bringCards({ mailAvailable: true, calendarOffer: false, notifications: "unsupported" })).toEqual(["mail"]);
  });

  it("skips Bring things in when nothing on it applies", () => {
    const none = bringCards({ mailAvailable: false, calendarOffer: false, notifications: "decided" });
    expect(none).toEqual([]);
    expect(afterYou(none)).toBe("today");
    expect(afterYou(["notifications"])).toBe("bring");
  });
});

describe("033 the intro", () => {
  it("is three scenes with the decided copy, looping after the third", () => {
    expect(INTRO.map((scene) => scene.title)).toEqual([
      "offload keeps track for you",
      "Everything lands in threads",
      "Send it any way",
    ]);
    expect(INTRO[2]!.line).toBe("Type it, say it, snap a photo, or forward the email.");
    expect([0, 1, 2].map(introNext)).toEqual([1, 2, 0]);
    expect(SCENE_MS).toBe(9600);
  });

  it("advances by itself only without reduced motion and without a screen reader", () => {
    expect(autoAdvance({ reduceMotion: false, screenReader: false })).toBe(true);
    expect(autoAdvance({ reduceMotion: true, screenReader: false })).toBe(false);
    expect(autoAdvance({ reduceMotion: false, screenReader: true })).toBe(false);
  });

  it("files four dumps, alternating between the two threads", () => {
    expect(INTRO_DUMPS.map(([text]) => text)).toEqual([
      "Ana can only travel the 14th to the 17th",
      "matte black, 30cm",
      "€214 for the flights",
      "4 more shelf brackets",
    ]);
    expect(INTRO_DUMPS.map(([, thread]) => thread)).toEqual([0, 1, 0, 1]);
  });
});
