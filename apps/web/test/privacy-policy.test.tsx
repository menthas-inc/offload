// The privacy policy, the companies page and the terms.
//
// Rewritten general again on 2026-10-30 (owner: "the intent and mechanism
// should be there, not the implementation details"). Each line pinned here is
// a promise the owner decided, the law or a store requires, or one a reader
// relies on. No implementation detail is pinned, and the policy is held to
// carrying none: no counts, no windows in days, no product constants. A
// change that keeps the promise should never need this file edited.

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

const { default: Policy } = await import("../src/app/(marketing)/privacy/page");
const { default: Companies } = await import("../src/app/(marketing)/privacy/companies/page");
const { default: Terms } = await import("../src/app/(marketing)/terms/page");

const textOf = (html: string) =>
  html
    .replace(/<\/?(a|strong|em)\b[^>]*>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&rsquo;|’/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const policyHtml = renderToStaticMarkup(<Policy />);
const policy = textOf(policyHtml);
const companiesHtml = renderToStaticMarkup(<Companies />);
const companies = textOf(companiesHtml);
const termsHtml = renderToStaticMarkup(<Terms />);
const terms = textOf(termsHtml);
const source = (path: string) => readFileSync(`${process.cwd()}/src/${path}`, "utf8");

describe("the privacy policy states intent, not implementation", () => {
  it("is titled as a privacy policy and dated 30 October 2026", () => {
    expect(policyHtml).toMatch(/<h1[^>]*>Privacy policy<\/h1>/);
    expect(policy).toContain("Last updated 30 October 2026");
  });

  it("carries no number but its date, its section numbers and the age", () => {
    const rest = policy
      .replace(/Last updated \d{1,2} \w+ \d{4}/, "")
      .replace(/\b(\d+)\. (?=[A-Z])/g, "")
      .replace(/\b[Ss]ection \d+/g, "")
      .replace(/\b18\b/g, "");
    expect(rest.match(/\d+/g) ?? []).toEqual([]);
  });

  it("names no single feature's limits or mechanisms", () => {
    expect(policy).not.toMatch(/first ten pages|up to two|nightly|overnight|morning notification|preview picture straight|private copy/i);
    expect(policy).not.toMatch(/Voyage|AssemblyAI|Resend|Railway|Cloudflare|Anthropic|Expo/);
  });

  it("names the controller and says it is for the United States only", () => {
    expect(policy).toContain("It is run by Behrooz Afghahi, an individual in the United States.");
    expect(policy).toContain("offload is only offered in the United States");
    expect(policy).not.toMatch(/European|GDPR|Article 27|standard contractual|UK addendum|\bICO\b/);
  });

  it("says what is collected, by kind", () => {
    expect(policy).toContain("Everything you put in");
    expect(policy).toContain("email you forward to it");
    expect(policy).toContain("such as when and where a photo was taken");
    expect(policy).toContain("If you join the waitlist");
    expect(policy).toContain("We do not ask your device for its location.");
    expect(policy).toContain("under a random identifier that only we can link back to you, until you delete your account");
  });

  it("makes the no-training promise, and says who acts for themselves", () => {
    expect(policy).toContain("We do not use your content to train models.");
    expect(policy).toContain("by their terms or by settings we have turned on");
    expect(policy).toContain("act for themselves under their own terms");
    expect(policyHtml).toContain('href="/privacy/companies"');
  });

  it("says each AI call carries what its task needs and not more", () => {
    expect(policy).toContain("Each call carries only what its task needs");
    expect(policy).toContain("Not more.");
  });

  it("says a web lookup uses their words and never what offload knows about them, and can be turned off", () => {
    expect(policy).toContain("A search uses words from what you put in, and your country if you set one");
    expect(policy).toContain("never what offload knows about you");
    expect(policy).toContain("Settings under Privacy");
    // The review of 2026-10-30: a filed link's picture is fetched with the switch off.
    expect(policy).toContain("offload still asks a site you link to for the picture it shows beside the link");
  });

  it("says offload adds events for what is put in, birthdays included, and changes them when asked (051, owner 2026-11-17)", () => {
    expect(policy).toContain("adds events for things you put in, such as appointments and birthdays");
    expect(policy).toContain("changes or deletes them when you ask or when you forget the memory they came from");
    expect(policy).not.toContain("add, change or delete events when you ask");
    expect(policy).not.toContain("writes to it when you ask");
  });

  it("says what stays when a calendar is disconnected (Limited Use review)", () => {
    expect(policy).toContain("What offload already wrote in your threads from your calendar stays until you delete it.");
  });

  it("says memories are kept by instruction, not guarantee, and can all be seen and removed", () => {
    expect(policy).toContain("Memories: what offload knows about you across your threads");
    expect(policy).toContain("a model following instructions, not a guarantee");
    expect(policy).toContain("In Memories you can see, add, change and forget what offload knows about you");
  });

  it("names the maps service and what it collects from the device, as the store label does", () => {
    expect(policy).toContain("Google Maps Platform");
    expect(policy).toContain("an identifier, how the map is used, and crash and performance reports");
  });

  it("puts a material change to the list or the page to you again in the app", () => {
    expect(policy).toContain("We keep the list current");
    expect(policy).toContain("offload tells you the next time you open it and asks you to agree again");
  });

  it("claims encryption only for files, backups and exports, holds the keys, and says text is not encrypted by us", () => {
    expect(policy).toContain("Encrypted by us:");
    expect(policy).toContain("Our own backups and your exports are encrypted too, with keys our storage provider never receives.");
    expect(policy).toContain("recovery copies of the database are protected by its encryption");
    expect(policy).toMatch(/we hold the keys/i);
    expect(policy).toContain("Not encrypted by us:");
    expect(policy).not.toMatch(/your data is encrypted/i);
  });

  it("says what you delete is deleted, from live systems and then backups", () => {
    expect(policy).toContain("What you delete is deleted.");
    expect(policy).toContain("removed from our live systems promptly, and from our backups when they expire");
    expect(policyHtml).toContain('href="/delete-account"');
  });

  it("gives retention as criteria for each kind of record", () => {
    expect(policy).toContain("for as long as your account exists, or until you delete it");
    expect(policy).toContain("A copy you export");
    expect(policy).toContain("Security records");
    expect(policy).toContain("for a fixed period long enough to look into a problem, then deleted");
    expect(policy).not.toContain("for a limited period.");
  });

  it("carries the Limited Use statement, and lets nobody read Google data outside it", () => {
    expect(policy).toContain(
      "offload's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
    );
    expect(policyHtml).toContain('href="https://developers.google.com/terms/api-services-user-data-policy"');
    expect(policy).toContain("we do not use it to develop, improve or train AI or machine learning models");
    expect(policy).toContain("asks you first before a change that would notify other people");
  });

  it("gives everyone in the US the same rights, a way to appeal, and keeps the no-sale line", () => {
    expect(policy).toContain("to know what we collect and why, to a copy, to correct it, and to delete it");
    expect(policy).toContain("authorised agent");
    expect(policy).toContain("ask us to look at it again");
    expect(policy).toContain("your state attorney general");
    expect(policy).toContain("We do not sell your personal information or share it for cross-context behavioural advertising");
  });

  it("has a health section, a Do Not Track line and a section for people not on offload", () => {
    expect(policy).toContain("offload does not ask for health information.");
    expect(policy).toContain("Do Not Track");
    expect(policyHtml).toMatch(/<h2[^>]*>\d+\. If you are not on offload<\/h2>/);
  });

  it("leaves no owner marker, no dated promise of a future feature, and no dash", () => {
    expect(policy).not.toMatch(/\[OWNER|We plan to encrypt|A person reads it/);
    expect(policy).not.toMatch(/[\u2013\u2014]/);
    expect(companies).not.toMatch(/[\u2013\u2014]|\[OWNER/);
  });

  it("is shorter than the page it replaced", () => {
    expect(policy.split(" ").filter(Boolean).length).toBeLessThan(3300);
  });
});

describe("the companies page", () => {
  it("renders with its own date and links back to the policy", () => {
    expect(companiesHtml).toMatch(/<h1[^>]*>Companies we use<\/h1>/);
    expect(companies).toContain("Last updated 30 October 2026");
    expect(companiesHtml).toContain('href="/privacy"');
    expect(source("app/(marketing)/privacy/companies/page.tsx")).toContain('title: "Companies we use · offload"');
  });

  it("lists every company", () => {
    for (const name of [
      "Railway",
      "Cloudflare R2",
      "Anthropic",
      "Voyage AI",
      "AssemblyAI",
      "Resend",
      "Expo",
      "Apple and Google",
      "Google Calendar",
      "Google Maps Platform",
      "Google Workspace",
    ]) {
      expect(companies, name).toContain(name);
    }
  });

  it("says a site sees a request from us or the company doing the reading, never from them", () => {
    expect(companies).toContain("sees a request from us or from the company doing the reading");
    expect(companies).not.toContain("our server fetches the page");
    expect(companies).toContain("except the ones marked as acting for themselves");
  });
});

describe("the terms state intent, not implementation", () => {
  it("are dated, named, and for the United States", () => {
    expect(terms).toContain("Last updated 30 October 2026");
    expect(terms).toContain("Behrooz Afghahi");
    expect(terms).toContain("only offered in the United States");
  });

  it("name no sign-in provider, connected app or product stage", () => {
    expect(terms).not.toMatch(/Google calendar|Apple or Google|invite only|free for now|a beta/i);
  });

  it("send deletion to Settings, disclaim implied warranties, and cap liability", () => {
    expect(terms).toContain("delete your account yourself in Settings");
    expect(terms).toContain("merchantability, fitness for a particular purpose and non-infringement");
    expect(terms).toContain("the greater of what you paid us in the 12 months before the claim and 100 US dollars");
  });

  it("license content only to run offload, including through the companies that help", () => {
    expect(terms).toContain("including through the companies that help us run it");
    expect(terms).toContain("to run offload for you and as the privacy policy describes");
  });

  it("add acceptable use, AI output, termination, changes and Apple's licence", () => {
    expect(terms).toContain("sexual content involving minors");
    expect(terms).toContain("You are responsible for how you use what offload produces.");
    expect(terms).toContain("time to take a copy");
    expect(terms).toContain("asks you to agree again before you go on");
    expect(terms).toContain("Apple's standard licensed application end user licence agreement");
    expect(termsHtml).toContain('href="/privacy"');
    expect(terms).toContain("Where it and these terms differ about the app itself, Apple's agreement counts.");
  });
});
