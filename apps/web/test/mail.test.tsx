// @vitest-environment happy-dom
//
// 026. Where the address lives on the web: the Mail block in Connected apps
// (AC-18, AC-19). Since 031 it is the Mail card there.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MailCard, MAIL_ADDRESS } from "../src/components/MailBlock";

afterEach(() => {
  document.body.innerHTML = "";
});

async function render(email: string, mailAvailable: boolean, onCopied = vi.fn()) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<MailCard email={email} mailAvailable={mailAvailable} onCopied={onCopied} />));
  return { host, onCopied };
}

describe("the Mail card (AC-18, AC-19, 031 AC-12)", () => {
  it("shows the address, the sign-in address and that it is forwarded by hand", async () => {
    const { host } = await render("jo@hey.com", true);
    const text = host.textContent ?? "";
    expect(MAIL_ADDRESS).toBe("over@to.offload.club");
    expect(text).toContain("Forward an email and it's filed like anything you dump");
    expect(text).toContain("Ready");
    expect(text).toContain("over@to.offload.club");
    expect(text).toContain("Only mail from jo@hey.com is accepted. Forward by hand.");
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });

  it("copies the address and says so", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { host, onCopied } = await render("jo@hey.com", true);
    const copy = host.querySelector<HTMLButtonElement>('[aria-label="Copy the address"]')!;
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
  it("opens an open question in the conversation that asked, and nothing once it closed", async () => {
    const { openQuestion } = await import("../src/lib/notifications");
    const { RESUME_COMPOSER } = await import("../src/lib/dump");
    const fetched = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetched);
    const resumed = vi.fn();
    window.addEventListener(RESUME_COMPOSER, resumed);
    await openQuestion({ ...base, mailOutcome: "asked", questionId: null });
    expect(fetched).not.toHaveBeenCalled();
    await openQuestion({ ...base, mailOutcome: "asked", questionId: "q1" });
    expect(String(fetched.mock.calls[0]![0 as never])).toContain("/v1/questions/q1/resume");
    expect(resumed).toHaveBeenCalledOnce();
    window.removeEventListener(RESUME_COMPOSER, resumed);
    vi.unstubAllGlobals();
  });
  it("opens the Mail block for a refused email, and nothing for the cap", async () => {
    const { doorOf } = await import("../src/lib/notifications");
    expect(doorOf({ ...base, mailOutcome: "refused", messageId: null })).toBe("/settings/apps");
    expect(doorOf({ ...base, mailOutcome: "over_limit", messageId: null })).toBeNull();
  });
});

describe("the Copy control (AC-18)", () => {
  it("names what it copies", async () => {
    const { host } = await render("jo@hey.com", true);
    // The whole row is the control; its name says what it copies.
    const copy = host.querySelector<HTMLButtonElement>('[aria-label="Copy the address"]')!;
    expect(copy.textContent).toContain("Copy");
  });
});

describe("one address everywhere", () => {
  it("is the same in the server, both clients and the card", async () => {
    const { readFileSync } = await import("node:fs");
    const root = `${process.cwd()}/..`;
    const { MAIL_ADDRESS } = await import("../src/components/MailBlock");
    expect(readFileSync(`${root}/core-api/src/mail-in/sender.ts`, "utf8")).toContain(`export const ADDRESS = "${MAIL_ADDRESS}";`);
    expect(readFileSync(`${root}/mobile/lib/gate.ts`, "utf8")).toContain(`export const MAIL_ADDRESS = "${MAIL_ADDRESS}";`);
    expect(readFileSync(`${process.cwd()}/public/offload.vcf`, "utf8")).toContain(`EMAIL;TYPE=INTERNET:${MAIL_ADDRESS}`);
  });
});

describe("the privacy page says what happens to an email you forward (T6.1)", () => {
  it("carries the approved lines, names Resend as the receiver, and moves its date with the consent version", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync(`${process.cwd()}/src/app/(marketing)/privacy/page.tsx`, "utf8").replace(/\s+/g, " ");
    const session = readFileSync(`${process.cwd()}/../core-api/src/routes/session.ts`, "utf8");
    // Generalised on 2026-10-05: the policy says what is kept of a forwarded
    // email, and the companies page names Resend as the receiver.
    const companies = readFileSync(`${process.cwd()}/src/app/(marketing)/privacy/companies/page.tsx`, "utf8").replace(/\s+/g, " ");
    expect(page).toContain("its subject, who sent it and when, but not the raw email or its other attachments");
    expect(companies).toContain(`name: "Resend"`);
    expect(companies).toContain("receives email you forward to offload");
    expect(page).not.toContain("Cloudflare Email Routing");
    // The pairing is what this checks: the page's date and the consent version
    // name the same day, whichever day a later change moves them to.
    const updated = /const UPDATED = "(\d+) (\w+) (\d{4})"/.exec(page);
    const version = /export const CONSENT_VERSION = "(\d{4}-\d{2}-\d{2})";/.exec(session);
    expect(updated && version).toBeTruthy();
    const day = new Date(`${updated![2]} ${updated![1]}, ${updated![3]} 12:00 UTC`).toISOString().slice(0, 10);
    // 041: the version is never later than the page, which a change that only
    // names something already covered moves alone.
    expect(version![1] <= day).toBe(true);
  });
});
