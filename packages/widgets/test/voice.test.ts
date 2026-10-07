// A memory about the account holder is stored the way the memory pass writes
// it, about them, and read back to the person it is about, to them.

import { describe, expect, it } from "vitest";
import { shownText, storedText, toSecondPerson, toThirdPerson } from "../src/voice.js";

describe("toSecondPerson", () => {
  it("speaks the two real memories to the person", () => {
    expect(toSecondPerson("They are allergic to penicillin.")).toBe("You are allergic to penicillin.");
    expect(toSecondPerson("They share a calendar with Behrooz.")).toBe("You share a calendar with Behrooz.");
  });

  it("rewrites every form, keeping a capital where there was one", () => {
    expect(toSecondPerson("Their sister is Sara, and they call her on Sundays.")).toBe(
      "Your sister is Sara, and you call her on Sundays."
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

describe("F4: an object them is somebody else", () => {
  it("leaves them as them, and the account holder is still you", () => {
    expect(toSecondPerson("They pay their rent to Jo and text them the receipt.")).toBe(
      "You pay your rent to Jo and text them the receipt."
    );
    expect(toSecondPerson("Their landlord is Jo and they pay them on the 1st.")).toBe(
      "Your landlord is Jo and you pay them on the 1st."
    );
  });

  it("round trips, without turning a shown them into anything else", () => {
    for (const stored of [
      "They pay their rent to Jo and text them the receipt.",
      "Their landlord is Jo and they pay them on the 1st.",
    ]) {
      expect(toThirdPerson(toSecondPerson(stored))).toBe(stored);
    }
    expect(toThirdPerson("You text them the receipt.")).toBe("They text them the receipt.");
  });
});

describe("F4: a memory typed in the first person", () => {
  it("is stored about the person and shown to them", () => {
    expect(toThirdPerson("I'm allergic to penicillin.")).toBe("They're allergic to penicillin.");
    expect(toSecondPerson(toThirdPerson("I'm allergic to penicillin."))).toBe("You're allergic to penicillin.");
    expect(toSecondPerson(toThirdPerson("My sister is Sara."))).toBe("Your sister is Sara.");
  });

  it("agrees the verb, and maps every form", () => {
    expect(toThirdPerson("I am vegetarian and I was in Lisbon.")).toBe("They are vegetarian and they were in Lisbon.");
    expect(toThirdPerson("I've been, I’d go back and I'll say so.")).toBe("They've been, they’d go back and they'll say so.");
    expect(toThirdPerson("Sara calls me. The red bike is mine. I cook for myself.")).toBe(
      "Sara calls them. The red bike is theirs. They cook for themselves."
    );
    expect(toThirdPerson("Behrooz and I share a calendar. MY bike.")).toBe("Behrooz and they share a calendar. THEIR bike.");
  });

  it("leaves a word that only contains one alone, and a mine that is a place", () => {
    expect(toThirdPerson("Myra and Imogen visit me.")).toBe("Myra and Imogen visit them.");
    expect(toThirdPerson("I work in a mine.")).toBe("They work in a mine.");
    expect(toThirdPerson("I drive the I-95, i.e. south.")).toBe("They drive the I-95, i.e. south.");
    expect(toThirdPerson("i'm left handed.")).toBe("They're left handed.");
  });
});

describe("F4: what the editor shows and what it stores", () => {
  it("shows the stored text spoken to the person", () => {
    expect(shownText("They are allergic to penicillin.")).toBe("You are allergic to penicillin.");
  });

  it("an unedited memory stores exactly what was loaded", () => {
    const loaded = "They  share a calendar with Meera.";
    expect(storedText(loaded, shownText(loaded))).toBe(loaded);
    expect(storedText(loaded, "You share a calendar with Meera.\n")).toBe(loaded);
  });

  it("an edited one stores the third person, on one line", () => {
    expect(storedText("Their wife is Meera.", "You call  your\nmother Maman. ")).toBe("They call their mother Maman.");
    expect(storedText(null, "I'm allergic to penicillin.")).toBe("They're allergic to penicillin.");
  });

  it("a memory with no pronoun, edited, is stored about the person", () => {
    expect(storedText("Lives in Berlin.", "I live in Berlin.")).toBe("They live in Berlin.");
    expect(storedText("Vegetarian.", "I am vegetarian.")).toBe("They are vegetarian.");
    expect(storedText("Allergic to penicillin.", "You are allergic to penicillin.")).toBe(
      "They are allergic to penicillin.",
    );
  });

  it("a memory that already said you is saved as typed", () => {
    const loaded = "They want you to answer in Farsi.";
    expect(storedText(loaded, "They want you to answer in  English.")).toBe("They want you to answer in English.");
  });
});
