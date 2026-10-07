// What a condition alert says. Every condition `alerts.ts` can open has its
// own words, so no owner is mailed the fallback for one it knows about.

import { describe, expect, it } from "vitest";
import { env } from "../src/env.js";
import { renderAlert } from "../src/health/mail.js";

describe("the review_code_old alert", () => {
  const opened = renderAlert({ alert: "condition", condition: "review_code_old", state: "opened" }, null);
  const cleared = renderAlert({ alert: "condition", condition: "review_code_old", state: "cleared" }, null);

  it("says it is about a review code, opened and cleared", () => {
    expect(opened.subject).not.toBe("Something needs a look");
    expect(opened.slots.headline).toMatch(/review code/i);
    expect(cleared.slots.headline).toMatch(/review code/i);
    expect(cleared.slots.headline).not.toBe(opened.slots.headline);
  });

  it("opens the review codes on the Waitlist page", () => {
    expect(opened.slots.buttonUrl).toBe(`${env.WEB_URL}/admin/waitlist`);
    expect(opened.slots.buttonLabel).toBe("Open Waitlist");
  });

  it("carries no dash", () => {
    const dashes = String.fromCharCode(0x2013, 0x2014);
    for (const { subject, slots } of [opened, cleared]) {
      expect([...dashes].some((dash) => (subject + slots.headline + slots.body).includes(dash))).toBe(false);
    }
  });
});
