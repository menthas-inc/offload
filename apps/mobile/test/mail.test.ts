// 026. Mail on the phones: first run's card (033), the Mail page's words, and an
// email's Activity row (AC-15, AC-17, AC-18, AC-19, AC-20).

import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", () => ({
  send: () => Promise.resolve({ status: 200, data: null }),
  fetchActivity: () => Promise.resolve(null),
  markActivitySeen: () => Promise.resolve(),
}));

const gate = await import("../lib/gate");
const activity = await import("../lib/activity");

describe("033 Bring it all in's Mail card (replaces 026 AC-20's step)", () => {
  it("names the address between the two halves of its line", () => {
    expect(gate.BRING.mail.title).toBe("Forward emails to offload");
    expect(gate.BRING.mail.line("jo@hey.com").join("")).toBe(
      "Send anything to over@to.offload.club from jo@hey.com and it is filed.",
    );
  });
});

describe("the Mail page (AC-18, AC-19)", () => {
  it("names the address, the card, and the two lines", () => {
    expect(gate.MAIL_ADDRESS).toBe("over@to.offload.club");
    expect(gate.MAIL_CARD_PATH).toBe("/offload.vcf");
    expect(gate.mailLines("jo@hey.com")).toEqual([
      ["From jo@hey.com", "Forward an email from jo@hey.com and it's filed like anything else you dump. Mail from any other address isn't accepted."],
      ["Forward by hand", "Automatic forwarding rules don't work yet."],
    ]);
    expect(gate.MAIL_RELAY_NOTE).toBe("You signed in with an address Apple keeps private, so mail you forward can't be matched to you.");
  });
});

describe("an email's row in Activity (AC-15, AC-17)", () => {
  const base = {
    id: "a1", kind: "mail" as const, sent: false, reason: "design" as const, title: "t", body: null, send: null,
    threadId: null, contentId: null, memberId: null, requestId: null, undoable: false, undone: false,
    occurredAt: "2026-09-30T10:00:00.000Z", messageId: "m1",
  };
  it("opens the thread it filed into, or Today where the email is", () => {
    expect(activity.glyphOf(base)).toBe("mail");
    expect(activity.doorOf({ ...base, mailOutcome: "filed", contentId: "c1", threadId: "t1" })).toEqual({ pathname: "/threads/[id]", params: { id: "t1" } });
    expect(activity.doorOf({ ...base, mailOutcome: "filed" })).toEqual({ pathname: "/today" });
    expect(activity.doorOf({ ...base, mailOutcome: "asked" })).toEqual({ pathname: "/today" });
    expect(activity.doorOf({ ...base, mailOutcome: "nothing" })).toEqual({ pathname: "/today" });
  });
  it("opens an open question in the conversation that asked, and nothing once it closed", async () => {
    const resume = vi.fn(() => Promise.resolve(true));
    expect(await activity.openQuestion({ ...base, mailOutcome: "asked", questionId: null }, resume)).toBe(false);
    expect(resume).not.toHaveBeenCalled();
    expect(await activity.openQuestion({ ...base, mailOutcome: "asked", questionId: "q1" }, resume)).toBe(true);
    expect(resume).toHaveBeenCalledOnce();
  });
  it("opens the Mail page for a refused email, and nothing for the cap", () => {
    expect(activity.doorOf({ ...base, mailOutcome: "refused", messageId: null })).toEqual({ pathname: "/settings/[page]", params: { page: "mail" } });
    expect(activity.doorOf({ ...base, mailOutcome: "over_limit", messageId: null })).toBeNull();
  });
});
