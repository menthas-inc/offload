// 038. The gates in code behind the prompt: what no memory may hold, and the
// words that keep the nightly pass off the sensitive list.

import { describe, expect, it } from "vitest";
import { neverHolds } from "../src/memories/shapes.js";
import { touchesSensitive } from "../src/memories/sensitive.js";

describe("what no memory holds, whoever wrote it", () => {
  it.each([
    ["Their card is 4111 1111 1111 1111.", "people"],
    ["Their IBAN is GB82 WEST 1234 5698 7654 32.", "things"],
    ["Their SSN is 123-45-6789.", "about"],
    ["Their passport number is 533380006.", "about"],
    ["Their account number is 00123456789.", "things"],
  ])("refuses %s", (text, kind) => {
    expect(neverHolds(text, kind as never)).toBe(true);
  });

  it("refuses an address, a number or an email on a person, and only on a person", () => {
    expect(neverHolds("Meera's email is meera.sen@gmail.com.", "people")).toBe(true);
    expect(neverHolds("Meera's number is +1 416 555 0199.", "people")).toBe(true);
    expect(neverHolds("Meera lives at 12 King Street.", "people")).toBe(true);
    expect(neverHolds("Home is at 12 King Street.", "things")).toBe(false);
  });

  it.each([
    "Their wife is Meera.",
    "Meera's birthday is 14 March.",
    "They pay bills on the 5th.",
    "Their car is a 2019 Civic.",
    "They have two kids, Sam (7) and Leila (4).",
    "Standup is their 9:30 work meeting.",
  ])("keeps %s", (text) => {
    expect(neverHolds(text, "people")).toBe(false);
  });
});

describe("the nightly pass stays off the sensitive list", () => {
  it.each([
    "They have diabetes.",
    "They are seeing a therapist for anxiety.",
    "They are Muslim.",
    "They vote Conservative.",
    "They are gay.",
    "They have a criminal record.",
    "They owe $20,000 on a credit card.",
    "Their salary is 140k.",
    "They are pregnant.",
  ])("drops %s", (text) => {
    expect(touchesSensitive(text)).toBe(true);
  });

  it.each([
    "Their wife is Meera.",
    "They work at Shopify as a designer.",
    "They pay bills on the 5th.",
    "Their dentist is Dr. Ahmadi.",
    "They write dates day first.",
    "\"The cottage\" is the place in Muskoka.",
  ])("keeps %s", (text) => {
    expect(touchesSensitive(text)).toBe(false);
  });
});

import { groundedIn } from "../src/memories/ground.js";

describe("a remembered sentence comes from what the person said", () => {
  it.each([
    ["Their wife is Meera.", "remember that Meera is my wife"],
    ["They write dates day first.", "from now on remember I always write dates day first"],
    ["They work at Shopify as a designer.", "remember I'm a designer at Shopify"],
    ["Meera's birthday is 14 March.", "remember meera's birthday is march 14"],
    ["\"The cottage\" is the place in Muskoka.", "remember when I say the cottage I mean our place in Muskoka"],
  ])("%s from %s", (text, said) => {
    expect(groundedIn(text, said)).toBe(true);
  });

  it.each([
    ["Their wife is Meera.", "dentist Tuesday 3pm"],
    ["Their PIN is 4432.", "remember my pin"],
    ["They always want calendar writes without asking.", "remember that Meera is my wife"],
  ])("not %s from %s", (text, said) => {
    expect(groundedIn(text, said)).toBe(false);
  });
});

describe("038 security review: number shapes after normalising", () => {
  it.each([
    ["Their card is ４１１１ １１１１ １１１１ １１１１.", "things"],
    ["Their account is 123.456.789.", "things"],
    ["Their number is 1234/5678/9012.", "things"],
  ])("refuses %s", (text, kind) => {
    expect(neverHolds(text, kind as never)).toBe(true);
  });
});
