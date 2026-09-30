// @vitest-environment happy-dom
//
// 026. Where the address lives on the web: the Mail block in Connected apps
// (AC-18, AC-19).

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MailBlock, MAIL_ADDRESS } from "../src/components/MailBlock";

afterEach(() => {
  document.body.innerHTML = "";
});

async function render(email: string, mailAvailable: boolean, onCopied = vi.fn()) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<MailBlock email={email} mailAvailable={mailAvailable} onCopied={onCopied} />));
  return { host, onCopied };
}

describe("the Mail block (AC-18, AC-19)", () => {
  it("shows the address, the sign-in address and how it works", async () => {
    const { host } = await render("jo@hey.com", true);
    const text = host.textContent ?? "";
    expect(MAIL_ADDRESS).toBe("over@to.offload.club");
    expect(text).toContain("over@to.offload.club");
    expect(text).toContain("Forward an email from jo@hey.com and it's filed like anything else you dump.");
    expect(text).toContain("Mail from any other address isn't accepted.");
    expect(text).toContain("Automatic forwarding rules don't work yet.");
    expect(text).not.toMatch(/[–—]/);
  });

  it("copies the address and says so", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { host, onCopied } = await render("jo@hey.com", true);
    const copy = [...host.querySelectorAll("button")].find((b) => b.textContent === "Copy")!;
    await act(async () => copy.click());
    expect(writeText).toHaveBeenCalledWith("over@to.offload.club");
    expect(onCopied).toHaveBeenCalled();
  });

  it("hands over the contact card as a download, asking for nothing", async () => {
    const { host } = await render("jo@hey.com", true);
    const card = [...host.querySelectorAll("a")].find((a) => a.textContent?.includes("Add to contacts"))!;
    expect(card.getAttribute("href")).toBe("/offload.vcf");
    expect(card.hasAttribute("download")).toBe(true);
  });

  it("says why for an Apple hidden email, with no address to copy", async () => {
    const { host } = await render("x7q2k9@privaterelay.appleid.com", false);
    const text = host.textContent ?? "";
    expect(text).toContain("You signed in with an address Apple keeps private, so mail you forward can't be matched to you.");
    expect(text).toContain("Unavailable");
    expect(text).not.toContain("over@to.offload.club");
    expect(host.querySelector("button")).toBeNull();
  });
});

describe("the contact card (AC-19)", () => {
  it("is a vCard named offload holding the address", async () => {
    const { readFileSync } = await import("node:fs");
    const card = readFileSync(`${process.cwd()}/public/offload.vcf`, "utf8");
    expect(card).toMatch(/^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
    expect(card).toContain("\r\nFN:offload\r\n");
    expect(card).toContain("\r\nEMAIL;TYPE=INTERNET:over@to.offload.club\r\n");
    expect(card.endsWith("END:VCARD\r\n")).toBe(true);
  });
});

describe("first run's Mail step (AC-20)", () => {
  it("says what it is in the calendar step's shape, and Add to contacts moves on", async () => {
    const { MailOffer, MAIL_OFFER_TITLE } = await import("../src/components/MailBlock");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const done = vi.fn();
    const host = document.body.appendChild(document.createElement("div"));
    await act(async () => createRoot(host).render(<MailOffer email="jo@hey.com" onDone={done} />));
    const text = host.textContent ?? "";
    expect(MAIL_OFFER_TITLE).toBe("Forward what matters");
    expect(text).toContain("Send it an email. Forward anything to over@to.offload.club and it's filed.");
    expect(text).toContain("Only from your address. Mail from jo@hey.com is the only mail it accepts.");
    const add = host.querySelector("a")!;
    expect(add.textContent).toBe("Add to contacts");
    expect(add.getAttribute("href")).toBe("/offload.vcf");
    await act(async () => add.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(done).toHaveBeenCalled();
  });
});

describe("an email in the conversation (AC-5)", () => {
  it("draws the mail glyph, the subject as its first line and Forwarded as its meta", async () => {
    const { SentMail } = await import("../src/components/shell/SentMail");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.body.appendChild(document.createElement("div"));
    await act(async () => createRoot(host).render(<SentMail subject="Booking LX3K9" note="Put this with the trip" />));
    const glyph = [...host.querySelectorAll("span")].find((span) => (span as HTMLElement).style.maskImage?.includes("mail"));
    expect(glyph).toBeTruthy();
    const text = host.textContent ?? "";
    expect(text.startsWith("Booking LX3K9")).toBe(true);
    expect(text).toContain("Forwarded");
    expect(text).toContain("Put this with the trip");
  });

  it("draws the subject alone when they forwarded without a note", async () => {
    const { SentMail } = await import("../src/components/shell/SentMail");
    const host = document.body.appendChild(document.createElement("div"));
    await act(async () => createRoot(host).render(<SentMail subject="Your appointment is confirmed" note="" />));
    expect(host.textContent).toBe("Your appointment is confirmedForwarded");
  });
});

describe("an email's row in Activity (AC-15, AC-17)", () => {
  const base = {
    id: "a1", kind: "mail" as const, sent: false, reason: "design" as const, title: "t", body: null, send: null,
    threadId: null, contentId: null, memberId: null, requestId: null, undoable: false, undone: false,
    occurredAt: "2026-09-30T10:00:00.000Z", messageId: "m1",
  };
  it("opens what landed: the row, the thread, or the email", async () => {
    const { doorOf, glyphOf } = await import("../src/lib/notifications");
    expect(glyphOf(base)).toBe("mail");
    expect(doorOf({ ...base, mailOutcome: "filed", contentId: "c1", threadId: "t1" })).toBe("/content/c1");
    expect(doorOf({ ...base, mailOutcome: "filed", threadId: "t1" })).toBe("/threads/t1");
    expect(doorOf({ ...base, mailOutcome: "filed" })).toBe("/today");
    expect(doorOf({ ...base, mailOutcome: "asked" })).toBe("/today");
    expect(doorOf({ ...base, mailOutcome: "nothing" })).toBe("/today");
  });
  it("opens the Mail block for a refused email, and nothing for the cap", async () => {
    const { doorOf } = await import("../src/lib/notifications");
    expect(doorOf({ ...base, mailOutcome: "refused", messageId: null })).toBe("/settings/apps");
    expect(doorOf({ ...base, mailOutcome: "over_limit", messageId: null })).toBeNull();
  });
});
