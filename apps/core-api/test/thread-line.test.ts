// The line under a thread's name in My threads (2026-09-29). It says what is
// in the thread and who with, and nothing obvious: not "you", and not a bare
// total that counts ticked-off rows and says nothing about what they are.

import { describe, expect, it } from "vitest";
import { threadLine } from "../src/threads/line.js";

describe("the thread line", () => {
  it("names the two biggest kinds, largest first", () => {
    expect(threadLine({ task: 15, link: 3, event: 1 }, [])).toBe("15 to do, 3 links");
  });

  it("says one of a kind in the singular, and a lone kind alone", () => {
    expect(threadLine({ link: 1 }, [])).toBe("1 link");
    expect(threadLine({ link: 8 }, [])).toBe("8 links");
  });

  it("counts photos and screenshots together", () => {
    expect(threadLine({ image: 2, screenshot: 1 }, [])).toBe("3 photos");
  });

  it("keeps a fixed order between kinds with the same count", () => {
    expect(threadLine({ link: 2, task: 2 }, [])).toBe("2 to do, 2 links");
  });

  it("gives a shared thread one kind and the people, by first name", () => {
    expect(threadLine({ task: 6, link: 2 }, ["Ana Duarte"])).toBe("6 to do, with Ana");
    expect(threadLine({ task: 6 }, ["Ana Duarte", "Tom Reilly"])).toBe("6 to do, with Ana and Tom");
    expect(threadLine({ task: 6 }, ["Ana Duarte", "Tom Reilly", "Mia Fell"])).toBe("6 to do, with Ana and 2 more");
  });

  it("says only who with when there is nothing yet, and nothing at all alone", () => {
    expect(threadLine({}, ["Ana Duarte"])).toBe("with Ana");
    expect(threadLine({}, [])).toBe("");
    expect(threadLine({ task: 0 }, [])).toBe("");
  });

  it("never says you, thing or a bare total", () => {
    const line = threadLine({ task: 1, voice: 1 }, []);
    expect(line).toBe("1 to do, 1 voice note");
    expect(line).not.toMatch(/you|thing/);
  });
});
