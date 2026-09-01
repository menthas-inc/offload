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
import { MemoryMailer, renderHtml, renderText, type EmailSlots } from "../src/mail/index.js";
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

  it("sends once, to the right address, with a way back in", async () => {
    const accountId = await invited();
    const mailer = new MemoryMailer();

    await handlers["email.invited"]!({ accountId }, { mailer });

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("ana@example.test");
    expect(mailer.sent[0]?.slots.buttonUrl).toContain("/sign-in");
  });

  it("does not send a second time when the job retries", async () => {
    const accountId = await invited();
    const mailer = new MemoryMailer();

    // A job that succeeded at the mailer and failed at the acknowledgement is
    // retried by the runner, which is the case the claim exists for. The
    // queue's idempotency key does not cover it: that prevents a second
    // enqueue, not a second run of the same one.
    await handlers["email.invited"]!({ accountId }, { mailer });
    await handlers["email.invited"]!({ accountId }, { mailer });

    expect(mailer.sent).toHaveLength(1);
  });

  it("sends nothing for an account that is no longer invited", async () => {
    const accountId = await invited();
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", accountId).execute();

    const mailer = new MemoryMailer();
    await handlers["email.invited"]!({ accountId }, { mailer });
    expect(mailer.sent).toHaveLength(0);
  });

  it("refuses a payload with no account rather than mailing nobody", async () => {
    await expect(handlers["email.invited"]!({}, { mailer: new MemoryMailer() })).rejects.toThrow();
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
      headline: "You are in",
      body: "Your offload account is ready.",
      buttonLabel: "Open offload",
      buttonUrl: "https://offload.club/sign-in",
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
      });

      it("references no image, so it reads the same with images off", () => {
        const html = renderHtml(slots);
        // Tracking pixels are images too, which is the other half of this
        // rule: an email with no image reference cannot carry one.
        expect(html).not.toMatch(/<img\b/i);
        expect(html).not.toMatch(/background-image/i);
        expect(html).not.toMatch(/https?:\/\/[^"'\s]+\.(png|jpe?g|gif|webp|svg)/i);
      });

      it("escapes what it interpolates", () => {
        const html = renderHtml({ ...slots, headline: '<script>alert(1)</script>' });
        expect(html).not.toContain("<script>");
      });
    });
  }
});
