// The privacy policy, rewritten general on 2026-10-05 (owner: "generalize when
// it helps"). The page is a claim surface, so each line pinned here is one the
// owner decided, the legal review requires, or the audit of the old page found
// untrue. Mechanisms are not pinned: the page no longer names them, which is
// the point of the rewrite. The companies sit on their own page with their own
// date, so adding one does not move the policy.

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
    .replace(/&#x27;|&rsquo;|\u2019/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const policyHtml = renderToStaticMarkup(<Policy />);
const policy = textOf(policyHtml);
const companiesHtml = renderToStaticMarkup(<Companies />);
const companies = textOf(companiesHtml);
const terms = textOf(renderToStaticMarkup(<Terms />));
const source = (path: string) => readFileSync(`${process.cwd()}/src/${path}`, "utf8");

describe("the privacy policy, general", () => {
  it("is titled as a privacy policy and dated 10 October 2026", () => {
    expect(policyHtml).toMatch(/<h1[^>]*>Privacy policy<\/h1>/);
    expect(policy).toContain("Last updated 10 October 2026");
  });

  // 041. PDFs, wherever the page says what is put in, kept, made, sent to a
  // model, shared and encrypted.
  it("names PDFs where it names photos", () => {
    expect(policy).toContain("notes, links, photos, screenshots, PDFs, voice notes");
    expect(policy).toContain("its text, its pictures and its PDFs, its subject, who sent it and when, but not the raw email or its other attachments");
    expect(policy).toContain("descriptions of what photos, screenshots and PDFs show, including any words in them. The text of a PDF itself is not kept.");
    expect(policy).toContain("Sorting, reading photos and PDFs, transcribing voice notes");
    expect(policy).toContain("what you just put in (of a PDF, its first ten pages),");
    expect(policy).toContain("A PDF in a shared thread opens for its members as a copy without the details of who made it and without anything in it that could run.");
    expect(policy).toContain("your photos, screenshots, PDFs, voice note audio and the pictures and PDFs in email you forward");
    expect(policy).toContain("what offload writes about a photo or a PDF");
    expect(policy).toContain("A PDF you open on your phone is handed to the phone's own viewer from a private copy, deleted when you come back to offload.");
  });

  it("names the controller and says it is for the United States only", () => {
    expect(policy).toContain("It is run by Behrooz Afghahi, an individual in the United States.");
    expect(policy).toContain("offload is only offered in the United States");
    expect(policy).not.toMatch(/European|GDPR|Article 27|standard contractual|UK addendum|\bICO\b/);
  });

  it("makes the no-training promise without a future opt-in", () => {
    expect(policy).toContain("We do not use your content to train models.");
    expect(policy).toContain("by their terms or by settings we have turned on");
    expect(policy).not.toMatch(/Improve offload with my data|if we ever offer that/i);
  });

  it("links the companies page and names kinds of companies, not each one", () => {
    expect(policyHtml).toContain('href="/privacy/companies"');
    expect(policy).not.toMatch(/Voyage|AssemblyAI|Resend|Railway|Cloudflare/);
    expect(policy).toContain("Apple and Google, when you sign in with them, act for themselves");
  });

  it("names the country a web search carries, and how long Resend keeps forwarded mail", () => {
    expect(policy).toContain("words from what you put in and the country you set in Settings");
    expect(companies).toContain("keeps as received, attachments included, for 30 days and then deletes");
  });

  it("says new companies are listed and a material change is put to you again in the app", () => {
    expect(policy).toContain("We keep the list current");
    expect(policy).toContain("offload tells you the next time you open it and asks you to agree again");
    expect(policy).not.toContain("we email account holders before it takes effect");
  });

  it("claims our encryption only for our own backup and exports, not the host's recovery copies", () => {
    expect(policy).toContain("Our own nightly backup and your exports are encrypted the same way.");
    expect(policy).toContain("recovery copies of the database are protected by its encryption");
    expect(policy).not.toContain("Exports and backups are encrypted too.");
  });

  it("says what you delete is deleted, promptly, and from backups within 30 days", () => {
    expect(policy).toContain("What you delete is deleted.");
    expect(policy).toContain("removed from our live systems promptly, and from our backups within 30 days");
    expect(policyHtml).toContain('href="/delete-account"');
  });

  it("says offload holds the keys rather than claiming it has none", () => {
    expect(policy).not.toContain("a key we do not have");
    expect(policy).toContain("we hold the keys");
  });

  it("carries the Limited Use statement, and lets nobody read Google data outside it", () => {
    expect(policy).toContain(
      "offload's use and transfer of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
    );
    expect(policyHtml).toContain('href="https://developers.google.com/terms/api-services-user-data-policy"');
    expect(policy).toContain("we do not use it to develop, improve or train AI or machine learning models");
    expect(policy).not.toMatch(/chasing a bug/);
  });

  it("gives everyone in the US the same rights and keeps the no-sale line", () => {
    expect(policy).toContain("to know what we collect and why, to a copy, to correct it, and to delete it");
    expect(policy).toContain("authorised agent");
    expect(policy).toContain("We do not sell your personal information or share it for cross-context behavioural advertising");
    expect(policy).not.toMatch(/California law defines|In California and other US states/);
  });

  it("has a health section, a Do Not Track line and a section for people not on offload", () => {
    expect(policy).toContain("offload does not ask for health information.");
    expect(policy).toContain("Do Not Track");
    expect(policyHtml).toMatch(/<h2[^>]*>\d+\. If you are not on offload<\/h2>/);
  });

  it("names the waitlist address, the subject and sender kept from a forwarded email, and the export's 7 days", () => {
    expect(policy).toContain("If you join the waitlist");
    expect(policy).toContain("its subject, who sent it and when");
    expect(policy).toContain("A copy you export: 7 days");
  });

  it("leaves no owner marker, no dated promise of a future feature, and no dash", () => {
    expect(policy).not.toMatch(/\[OWNER|We plan to encrypt|A person reads it/);
    expect(policy).not.toMatch(/[\u2013\u2014]/);
    expect(companies).not.toMatch(/[\u2013\u2014]|\[OWNER/);
  });

  it("is shorter than 3,500 words", () => {
    expect(policy.split(" ").filter(Boolean).length).toBeLessThan(3500);
  });
});

describe("the companies page", () => {
  it("renders with its own date and links back to the policy", () => {
    expect(companiesHtml).toMatch(/<h1[^>]*>Companies we use<\/h1>/);
    expect(companies).toMatch(/Last updated \d{1,2} \w+ 2026/);
    expect(companiesHtml).toContain('href="/privacy"');
    expect(source("app/(marketing)/privacy/companies/page.tsx")).toContain('title: "Companies we use · offload"');
  });

  it("lists every company, with Voyage embedding searches too", () => {
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
    expect(companies).toContain("the words of a search inside offload");
  });

  it("says our server fetches a linked page, and keeps sign-in and maps out of the contract sentence", () => {
    expect(companies).toContain("our server fetches the page");
    expect(companies).toContain("except the ones marked as acting for themselves");
    expect(companies).toContain("on the web when it is turned on");
  });
});

describe("the terms", () => {
  it("are dated, named, and for the United States", () => {
    expect(terms).toContain("Last updated 7 October 2026");
    expect(terms).toContain("Behrooz Afghahi");
    expect(terms).toContain("only offered in the United States");
  });

  it("send deletion to Settings, and cap liability", () => {
    expect(terms).toContain("delete your account yourself in Settings");
    expect(terms).toContain("the greater of what you paid us in the 12 months before the claim and 100 US dollars");
  });

  it("add acceptable use, AI output, termination, changes and Apple's licence", () => {
    expect(terms).toContain("sexual content involving minors");
    expect(terms).toContain("You are responsible for how you use what offload produces.");
    expect(terms).toContain("time to take a copy");
    expect(terms).toContain("asks you to agree again before you go on");
    expect(terms).toContain("Apple's standard licensed application end user licence agreement");
  });
});

// 038. Memories: what offload knows about a person across their threads. The
// page says what they are, how each kind is written, what is never kept, where
// they go, and how to see and remove one while there is no screen for it.
describe("memories", () => {
  it("are listed with what offload makes from what you put in", () => {
    expect(policy).toContain("Memories: what offload knows about you across your threads");
  });

  it("say how each kind is written, and that keeping sensitive ones only when asked is an instruction, not a guarantee", () => {
    expect(policy).toContain("when you ask it to remember something");
    expect(policy).toContain("from what you said, overnight");
    expect(policy).toContain("offload is told to keep health, religion");
    expect(policy).toContain("never an ID or account number, a password");
    expect(policy).toContain("That is an instruction and a filter, not a guarantee");
    // The sweep of 2026-10-07: a word list cannot carry "kept only when asked".
    expect(policy).not.toContain("are kept only when you asked offload to remember it");
  });

  it("go with every call, and never into a web search", () => {
    // Named in the list of what each call carries, so "Not more." stays true.
    expect(policy).toContain("labels, what offload knows about you, and, when offload answers");
    expect(policy).toContain("never put into a web search");
  });

  it("can be seen and removed by asking, and are in the export", () => {
    // 040: the tab, with asking and the export beside it.
    expect(policy).toContain("ask offload what it remembers");
    expect(policy).toContain("add, change and forget");
  });

  it("name the people in your life, and nothing more about them", () => {
    expect(policy).toContain("the names of people in your life, how they relate to you and their birthdays");
  });
});

// 040. The Memories tab: a fourth way a memory is kept, the tab as where they
// are seen and changed, and what Voyage receives once memories are embedded.
describe("040 the memories tab", () => {
  it("says in the health section, too, that a memory is kept when you add it yourself", () => {
    expect(policy).toContain("offload is told to keep it as a memory");
    expect(policy).toContain("only when you asked it to remember it or added it yourself in Memories.");
  });

  it("says a memory is kept when you add one in the tab, and that the tab is where you see and change them", () => {
    expect(policy).toContain("when you add one yourself in Memories");
    expect(policy).toContain("In Memories you can see, add, change and forget what offload knows about you");
    expect(policy).not.toContain("Ask offload what it remembers about you to see your memories");
  });

  it("says Voyage lays out memories and finds the ones a message needs, and what it receives", () => {
    expect(companies).toContain("Makes what offload holds searchable, lays out your memories by meaning and finds the ones a message needs");
    expect(companies).toContain("The text being indexed, your memories, the words of a search inside offload, and your own words in a message or a thread's name and your notes in it, to find the memories it needs");
  });

  it("moves both dates", () => {
    // 042 moved the policy again on 10 October; the companies list stayed.
    expect(policy).toContain("Last updated 10 October 2026");
    expect(companies).toContain("Last updated 8 October 2026");
  });
});

// 2026-10-08, the App Store privacy label. The label declares what the Google
// Maps SDK's own privacy manifest says it collects, and product events as
// linked, so both pages say the same in words.
describe("the pages agree with the store's privacy label", () => {
  it("say what the map collects on the phones, beyond the IP address", () => {
    for (const page of [companies, policy]) {
      expect(page).toContain("an identifier, how the map is used, and on the phones crash and performance reports");
      expect(page).not.toContain("your IP address and device details");
    }
  });

  it("say product events carry an identifier only we can link back to you, until the account goes", () => {
    expect(policy).toContain("Product events, such as finishing first run, under a random identifier that only we can link back to you, until you delete your account.");
    expect(policy).not.toContain("rather than to your account");
  });
});

// 042, read by the owner on 2026-10-10 before any send code: reminders are
// timed by what offload works out, may name a memory, and are said on the page
// before the first one goes.
describe("042 reminders, as the page says them", () => {
  it("says what offload works out about a dated thing to remind about it", () => {
    expect(policy).toContain(
      "For anything you put in with a date, what kind of date it is and how much notice it needs, which offload works out so it can remind you, and drops when the thing goes.",
    );
  });

  it("names the reminders among the notifications you choose", () => {
    expect(policy).toContain("send the notifications you choose, including reminders offload times before the dates that need one");
  });

  it("says a notification may carry what offload remembers, such as a birthday", () => {
    expect(policy).toContain(
      "they carry a few words of what you or a thread member wrote, or of what offload remembers for you, such as a birthday, to your own phone",
    );
  });

  it("tells somebody not on offload their birthday can be named in a reminder", () => {
    expect(policy).toContain(
      "or a memory of theirs that says who you are to them, or when your birthday is, which offload can name in a reminder on their phone",
    );
  });

  it("is dated the day it changed", () => {
    expect(source("app/(marketing)/privacy/page.tsx")).toContain('const UPDATED = "10 October 2026";');
  });
});
