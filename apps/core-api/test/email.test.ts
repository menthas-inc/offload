// The transactional emails.
//
// AC-11: every email is the one template with its slots filled, ships a
//         plain-text alternative, and contains no images.
// AC-2:  the invite that promotion queues goes out once per account, ever.
//
// The mailer is the in-memory one here. Nothing in this file may ever reach a
// real inbox, and the default mailer only becomes Resend when a key is set,
// which the suite deliberately does not do.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { handlers } from "../src/jobs/handlers.js";
import { chooseMailer, createMailer, MemoryMailer, renderHtml, renderText, type EmailSlots } from "../src/mail/index.js";
import { promote } from "../src/admin/promote.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("thread_keys").execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("account_keys").execute();
  await db.deleteFrom("staff").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("account_identities").execute();
  await db.deleteFrom("accounts").execute();
});

describe("AC-2 the invite email", () => {
  async function invited(): Promise<string> {
    const result = await promote("ana@example.test");
    return result.accountId;
  }

  it("sends once, to the right address, with a way in on the phone and on the web", async () => {
    const accountId = await invited();
    const mailer = new MemoryMailer();

    await handlers["email.invited"]!({ accountId }, { mailer }, accountId);

    expect(mailer.sent).toHaveLength(1);
    const [mail] = mailer.sent;
    expect(mail?.to).toBe("ana@example.test");
    expect(mail?.subject).toBe("Welcome to offload");
    expect(mail?.slots.headline).toBe("Let's get you started");
    expect(mail?.slots.body).toBe(
      "You've been invited to try offload. You can sign in with your email address ana@example.test " +
        "using Google or Apple and start using offload!"
    );
    expect(mail?.slots.bold).toBe("ana@example.test");
    expect(mail?.slots.badges).toEqual([
      { url: "https://apps.apple.com/app/id6814795746", image: expect.stringMatching(/^https?:\/\/[^?#]+\/brands\/app-store\.png$/), alt: "Download on the App Store" },
      { url: expect.stringMatching(/\/sign-in$/), image: expect.stringMatching(/^https?:\/\/[^?#]+\/brands\/open-in-browser\.png$/), alt: "Open in browser" },
    ]);
  });

  it("says the team sent it when nobody joined the waitlist", async () => {
    const accountId = await invited();
    const mailer = new MemoryMailer();
    await handlers["email.invited"]!({ accountId, fromWaitlist: false }, { mailer }, accountId);
    expect(mailer.sent[0]?.slots.footer).toBe("You are receiving this because the team at offload wanted you to try it.");
  });

  it("says the waitlist sent it when they joined it", async () => {
    await db.insertInto("accounts").values({ email: "ben@example.test" }).execute();
    const { accountId } = await promote("ben@example.test");
    const job = await db.selectFrom("jobs").select("payload").where("account_id", "=", accountId).where("kind", "=", "email.invited").executeTakeFirstOrThrow();
    const mailer = new MemoryMailer();
    await handlers["email.invited"]!(job.payload as Record<string, unknown>, { mailer }, accountId);
    expect(mailer.sent[0]?.slots.footer).toMatch(/^You are receiving this because you joined the offload waitlist at /);
  });

  it("promotion records whether the address was waiting", async () => {
    const accountId = await invited();
    const job = await db.selectFrom("jobs").select("payload").where("account_id", "=", accountId).where("kind", "=", "email.invited").executeTakeFirstOrThrow();
    expect(job.payload).toEqual({ accountId, fromWaitlist: false });
  });

  it("does not send a second time when the job retries", async () => {
    const accountId = await invited();
    const mailer = new MemoryMailer();

    // A job that succeeded at the mailer and failed at the acknowledgement is
    // retried by the runner, which is the case the claim exists for. The
    // queue's idempotency key does not cover it: that prevents a second
    // enqueue, not a second run of the same one.
    await handlers["email.invited"]!({ accountId }, { mailer }, accountId);
    await handlers["email.invited"]!({ accountId }, { mailer }, accountId);

    expect(mailer.sent).toHaveLength(1);
  });

  it("sends nothing for an account that is no longer invited", async () => {
    const accountId = await invited();
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", accountId).execute();

    const mailer = new MemoryMailer();
    await handlers["email.invited"]!({ accountId }, { mailer }, accountId);
    expect(mailer.sent).toHaveLength(0);
  });

  it("refuses a job with no account rather than mailing nobody", async () => {
    await expect(handlers["email.invited"]!({}, { mailer: new MemoryMailer() }, null)).rejects.toThrow();
  });
});

describe("AC-11 what every email is made of", () => {
  const cases: Record<string, EmailSlots> = {
    "waitlist confirmation": {
      headline: "You are on the list",
      body: "offload is invite only while it is still small.",
      footer: "You are receiving this because you asked to join offload.",
    },
    invite: {
      headline: "Let's get you started",
      body: "You can sign in with your email address ana@example.test using Google or Apple.",
      bold: "ana@example.test",
      badges: [
        { url: "https://apps.apple.com/app/id6814795746", image: "https://offload.club/brands/app-store.png", alt: "Download on the App Store" },
        { url: "https://offload.club/sign-in", image: "https://offload.club/brands/open-in-browser.png", alt: "Open in browser" },
      ],
      footer: "You are receiving this because you joined the offload waitlist.",
    },
  };

  for (const [name, slots] of Object.entries(cases)) {
    describe(name, () => {
      it("has a plain-text alternative carrying the same words", () => {
        const text = renderText(slots);
        expect(text).toContain(slots.headline);
        expect(text).toContain(slots.body);
        expect(text).toContain(slots.footer);
        if (slots.buttonUrl) expect(text).toContain(slots.buttonUrl);
        for (const badge of slots.badges ?? []) expect(text).toContain(`${badge.alt}: ${badge.url}`);
      });

      it("references no image but its badges, which name nobody", () => {
        const html = renderHtml(slots);
        // Tracking pixels are images too, which is the other half of this
        // rule: the only images allowed are fixed URLs, the same for everyone,
        // with alt text so they still read with images off.
        const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(([tag]) => tag);
        expect(images).toHaveLength(slots.badges?.length ?? 0);
        for (const [i, badge] of (slots.badges ?? []).entries()) {
          expect(badge.image).not.toMatch(/[?#]/);
          expect(images[i]).toContain(`src="${badge.image}"`);
          expect(images[i]).toContain(`alt="${badge.alt}"`);
        }
        expect(html).not.toMatch(/background-image/i);
      });

      it("keeps every style attribute whole", () => {
        // The font token quotes its family names, and a bare quote ended the
        // attribute there: the font, the button's padding and its corners were lost.
        const html = renderHtml(slots);
        for (const [, after] of html.matchAll(/style="[^"]*"(.)/g)) expect(after).toMatch(/[\s>]/);
      });

      it("sets the bold words in bold, escaped", () => {
        if (!slots.bold) return;
        const html = renderHtml({ ...slots, body: `${slots.body} <b>`, bold: slots.bold });
        expect(html).toMatch(new RegExp(`<strong[^>]*>${slots.bold}</strong>`));
        expect(html).toContain("&lt;b&gt;");
      });

      it("escapes what it interpolates", () => {
        const html = renderHtml({ ...slots, headline: '<script>alert(1)</script>' });
        expect(html).not.toContain("<script>");
      });
    });
  }
});

describe("which mailer the environment earns", () => {
  // Written after two local dev servers sent the suite's waitlist
  // confirmations through Resend on 2026-09-18. The key alone must never send.
  const base = { EMAIL_FROM: "offload@offload.club" } as const;

  it("a key in a development or test shell is the memory mailer", () => {
    expect(chooseMailer({ ...base, RESEND_API_KEY: "re_x", MAIL_LIVE: undefined, production: false })).toBe("memory");
    expect(chooseMailer({ ...base, RESEND_API_KEY: undefined, MAIL_LIVE: undefined, production: false })).toBe("memory");
  });

  it("MAIL_LIVE=1 with a key sends, and without a key still cannot", () => {
    expect(chooseMailer({ ...base, RESEND_API_KEY: "re_x", MAIL_LIVE: "1", production: false })).toBe("resend");
    expect(chooseMailer({ ...base, RESEND_API_KEY: undefined, MAIL_LIVE: "1", production: false })).toBe("memory");
  });

  it("production sends, and refuses to boot without a key", () => {
    expect(chooseMailer({ ...base, RESEND_API_KEY: "re_x", MAIL_LIVE: undefined, production: true })).toBe("resend");
    expect(() => chooseMailer({ ...base, RESEND_API_KEY: undefined, MAIL_LIVE: undefined, production: true })).toThrow(/RESEND_API_KEY/);
  });

  it("the default choice in this test process is the memory mailer, whatever .env holds", () => {
    expect(createMailer()).toBeInstanceOf(MemoryMailer);
  });
});
