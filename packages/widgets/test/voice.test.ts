// A memory about the account holder is stored the way the memory pass writes
// it, about them, and read back to the person it is about, to them.

import { describe, expect, it } from "vitest";
import { toSecondPerson, toThirdPerson } from "../src/voice.js";

describe("toSecondPerson", () => {
  it("speaks the two real memories to the person", () => {
    expect(toSecondPerson("They are allergic to penicillin.")).toBe("You are allergic to penicillin.");
    expect(toSecondPerson("They share a calendar with Behrooz.")).toBe("You share a calendar with Behrooz.");
  });

  it("rewrites every form, keeping a capital where there was one", () => {
    expect(toSecondPerson("Their sister is Sara, and she calls them on Sundays.")).toBe(
      "Your sister is Sara, and she calls you on Sundays."
    );
    expect(toSecondPerson("The red bike is theirs.")).toBe("The red bike is yours.");
    expect(toSecondPerson("They cook for themselves. Themself too.")).toBe("You cook for yourself. Yourself too.");
  });

  it("rewrites the contractions, with either apostrophe", () => {
    expect(toSecondPerson("They're vegetarian.")).toBe("You're vegetarian.");
    expect(toSecondPerson("They've been to Lisbon, they'd go back and they'll say so.")).toBe(
      "You've been to Lisbon, you'd go back and you'll say so."
    );
    expect(toSecondPerson("They’re left handed.")).toBe("You’re left handed.");
  });

  it("leaves a word that only contains one alone", () => {
    expect(toSecondPerson("Theirry is their brother.")).toBe("Theirry is your brother.");
    expect(toSecondPerson("Mathem and Theyla visit.")).toBe("Mathem and Theyla visit.");
  });

  it("leaves a memory that already says you as it is", () => {
    expect(toSecondPerson("They want you to answer in Farsi.")).toBe("They want you to answer in Farsi.");
  });
});

describe("toThirdPerson", () => {
  it("is the stored form of what the person reads", () => {
    expect(toThirdPerson("You are allergic to penicillin.")).toBe("They are allergic to penicillin.");
    expect(toThirdPerson("Sara calls you on Sundays.")).toBe("Sara calls them on Sundays.");
    expect(toThirdPerson("Your sister asks you to call.")).toBe("Their sister asks them to call.");
    expect(toThirdPerson("You're vegetarian.")).toBe("They're vegetarian.");
  });

  it("round trips", () => {
    for (const stored of [
      "They are allergic to penicillin.",
      "They share a calendar with Behrooz.",
      "Their sister is Sara, and she calls them on Sundays.",
      "The red bike is theirs.",
      "They cook for themselves.",
      "They're vegetarian, and they've been to Lisbon.",
      "Behrooz picks them up from work.",
      "Theirry is their brother.",
    ]) {
      expect(toThirdPerson(toSecondPerson(stored))).toBe(stored);
    }
  });
});
