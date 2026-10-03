// 034 AC-46 to AC-49, and the count beside Health in the nav. Every owner is
// emailed once when a condition opens and not again until it has cleared; a
// service coming back sends one more; ten condition alerts a UTC day and the
// tenth says so; staff-action alerts go out regardless; and every link is
// built from the configured web address.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { handlers } from "../src/jobs/handlers.js";
import { enqueue, PRIORITY } from "../src/jobs/queue.js";
import { MemoryMailer, renderHtml, renderText, type Message } from "../src/mail/index.js";
import { clearSettingsCache } from "../src/settings.js";
import { clearPlatformSpent } from "../src/budget.js";
import { checkAlerts, wrongCount, DAILY_ALERTS } from "../src/health/alerts.js";
import { renderAlert, STAFF_DAILY_ALERTS, type AlertPayload } from "../src/health/mail.js";
import { uuidv7 } from "../src/uuid.js";
import { activeAccount, staffMember, wipeAdmin } from "./admin-kit.js";

await migrate(() => {});

let app: App;
let owner: { id: string; cookie: string };
let second: { id: string; cookie: string };
const emailOf = async (id: string) => (await db.selectFrom("accounts").select("email").where("id", "=", id).executeTakeFirstOrThrow()).email;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await wipeAdmin();
  await app.close();
  await closeDb();
});
beforeEach(async () => {
  await wipeAdmin();
  owner = await staffMember("owner");
  second = await staffMember("owner");
  // Letting them in booked their invite emails. This file counts mail.
  await db.deleteFrom("jobs").execute();
  // All is well unless a test says otherwise: a backup ran last night.
  await sql`insert into backup_runs (finished_at, bytes, ok) values (now() - interval '2 hours', 1000, true)`.execute(db);
});

/** Run every alert email waiting, the way the runner would, and say what was
 *  sent. A job that is nobody's fans out into one per owner, so this goes
 *  round until none is left. */
async function drain(): Promise<Message[]> {
  const mailer = new MemoryMailer();
  for (;;) {
    const waiting = await db.selectFrom("jobs").select(["id", "payload", "account_id"]).where("kind", "=", "email.alert").where("state", "=", "queued").execute();
    if (waiting.length === 0) return mailer.sent;
    for (const job of waiting) {
      await handlers["email.alert"]!(job.payload as Record<string, unknown>, { mailer }, job.account_id);
      await db.updateTable("jobs").set({ state: "done" }).where("id", "=", job.id).execute();
    }
  }
}

const check = async (): Promise<Message[]> => {
  clearSettingsCache();
  clearPlatformSpent();
  await checkAlerts();
  return drain();
};

async function setting(key: string, value: unknown): Promise<void> {
  await db
    .insertInto("app_settings")
    .values({ key, value: JSON.stringify(value), updated_by_account_id: null })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: JSON.stringify(value) }))
    .execute();
}

const spend = (micros: number) =>
  sql`
    insert into llm_usage (account_id, job_kind, category, model, cost_micros)
    values (${owner.id}, 'dump.answer', 'interactive', 'claude-sonnet-5', ${micros})`.execute(db);

const beat = (service: string, minutesAgo: number) =>
  sql`
    insert into heartbeats (service, minute, ok) values (${service}, date_trunc('minute', now()) - make_interval(mins => ${minutesAgo}), true)
    on conflict do nothing`.execute(db);

const deadJob = async (kind = "dump.answer"): Promise<string> =>
  (
    await sql<{ id: string }>`
      insert into jobs (kind, payload, state, run_after, attempts, max_attempts, error_code)
      values (${kind}, '{}'::jsonb, 'dead', now(), 2, 2, 'model_error') returning id`.execute(db)
  ).rows[0]!.id;

const states = () => db.selectFrom("alert_states").select(["condition", "cleared_at", "last_sent_at"]).orderBy("condition").execute();
const sentToday = async () => (await db.selectFrom("alert_sends").select("count").executeTakeFirst())?.count ?? 0;
const to = (sent: Message[]) => sent.map((message) => message.to).sort();

describe("AC-46 a condition emails every owner once", () => {
  it("says nothing when all is well", async () => {
    expect(await check()).toEqual([]);
    expect(await states()).toEqual([]);
  });

  it("mails each owner when the platform cap is reached, and nobody else", async () => {
    await staffMember("support");
    const gone = await staffMember("owner");
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", gone.id).execute();
    await db.deleteFrom("jobs").execute();
    await setting("platform.spend_micros", 1_000_000);
    await spend(1_500_000);

    const sent = await check();
    expect(to(sent)).toEqual([await emailOf(owner.id), await emailOf(second.id)].sort());
    expect(sent[0]!.subject).toBe("The platform cap is reached");
    expect(await sentToday()).toBe(1);
  });

  it("sends no second one while the condition stays open", async () => {
    await setting("platform.spend_micros", 1_000_000);
    await spend(1_500_000);
    expect(await check()).toHaveLength(2);
    expect(await check()).toEqual([]);
    expect(await check()).toEqual([]);
    expect(await sentToday()).toBe(1);
  });

  it("clears when the condition does, and mails again the next time it opens", async () => {
    await setting("platform.spend_micros", 1_000_000);
    await spend(1_500_000);
    expect(await check()).toHaveLength(2);

    await setting("platform.spend_micros", 5_000_000);
    // Under the cap again: cleared, and no email says so.
    expect(await check()).toEqual([]);
    expect((await states())[0]!.cleared_at).not.toBeNull();

    await spend(4_000_000);
    expect(await check()).toHaveLength(2);
    expect((await states())[0]!.cleared_at).toBeNull();
  });

  it("is one email each when two instances check in the same minute", async () => {
    await setting("platform.spend_micros", 1_000_000);
    await spend(1_500_000);
    clearSettingsCache();
    clearPlatformSpent();
    await Promise.all([checkAlerts(), checkAlerts(), checkAlerts()]);
    expect(await drain()).toHaveLength(2);
    expect(await sentToday()).toBe(1);
  });

  it("mails when a service has been down five minutes, and once more when it is back", async () => {
    await beat("worker", 6);
    const down = await check();
    expect(to(down)).toEqual([await emailOf(owner.id), await emailOf(second.id)].sort());
    expect(down[0]!.subject).toBe("The worker is down");
    expect(await check()).toEqual([]);

    await beat("worker", 0);
    const back = await check();
    expect(back).toHaveLength(2);
    expect(back[0]!.subject).toBe("The worker is back");
    expect(await check()).toEqual([]);
    expect(await sentToday()).toBe(2);
  });

  it("waits the five minutes, and never alerts for a service that has not reported yet", async () => {
    await beat("worker", 4);
    expect(await check()).toEqual([]);
    expect(await states()).toEqual([]);
  });

  it("says whose view it is when the web or the database is the one down", async () => {
    await beat("web", 10);
    const sent = await check();
    expect(sent[0]!.subject).toBe("The web is down");
    expect(sent[0]!.slots.body).toContain("The Core API");
  });

  it("mails when a scheduled job is late, naming its kind", async () => {
    await sql`
      insert into jobs (kind, payload, state, run_after)
      values ('digest.schedule', '{}'::jsonb, 'queued', now() - interval '3 hours')`.execute(db);
    const sent = await check();
    expect(sent).toHaveLength(2);
    expect(sent[0]!.subject).toBe("A scheduled job is late");
    expect(sent[0]!.slots.body).toContain("digest.schedule");
    expect((await states()).map((row) => row.condition)).toEqual(["job_late:digest.schedule"]);
    expect(await check()).toEqual([]);
  });

  it("mails when a job dies, and again only for one that died since", async () => {
    await deadJob();
    const first = await check();
    expect(first).toHaveLength(2);
    expect(first[0]!.subject).toBe("A job died");
    // The same dead job is not news a minute later.
    expect(await check()).toEqual([]);
    expect(await check()).toEqual([]);

    await deadJob();
    expect(await check()).toHaveLength(2);
    expect(await check()).toEqual([]);
  });

  it("does not mail for a dead job that was dismissed, or for an alert that could not be sent", async () => {
    const id = await deadJob();
    await db.updateTable("jobs").set({ dismissed_at: new Date() }).where("id", "=", id).execute();
    await deadJob("email.alert");
    expect(await check()).toEqual([]);
  });

  it("mails when the backup is late", async () => {
    await db.deleteFrom("backup_runs").execute();
    await sql`insert into backup_runs (finished_at, bytes, ok) values (now() - interval '27 hours', 1000, true)`.execute(db);
    const sent = await check();
    expect(sent).toHaveLength(2);
    expect(sent[0]!.subject).toBe("The backup is late");
    expect(await check()).toEqual([]);

    await sql`insert into backup_runs (finished_at, bytes, ok) values (now(), 1000, true)`.execute(db);
    expect(await check()).toEqual([]);
    expect((await states())[0]!.cleared_at).not.toBeNull();
  });

  it("claims nothing when there is no owner to tell", async () => {
    await db.deleteFrom("staff").execute();
    await deadJob();
    expect(await check()).toEqual([]);
    expect(await sentToday()).toBe(0);
    // An owner appears: the condition is still open and still unsent.
    await db.insertInto("staff").values({ account_id: owner.id, role: "owner" }).execute();
    expect(await check()).toHaveLength(1);
  });
});

describe("AC-47 the daily limit", () => {
  const already = (count: number) => sql`insert into alert_sends (day, count) values ((now() at time zone 'UTC')::date, ${count})`.execute(db);

  it("is ten", () => {
    expect(DAILY_ALERTS).toBe(10);
  });

  it("says on the tenth that alerts are paused until tomorrow, and sends no eleventh", async () => {
    await already(8);
    await deadJob();
    const ninth = await check();
    expect(ninth).toHaveLength(2);
    expect(ninth[0]!.slots.body).not.toContain("paused");

    await beat("worker", 10);
    const tenth = await check();
    expect(tenth).toHaveLength(2);
    expect(tenth[0]!.subject).toBe("The worker is down");
    expect(tenth[0]!.slots.body).toContain("alerts are paused until tomorrow");

    await db.deleteFrom("backup_runs").execute();
    expect(await check()).toEqual([]);
    expect(await sentToday()).toBe(10);
    // Open, and not yet told.
    const late = (await states()).find((row) => row.condition === "backup_late")!;
    expect(late).toMatchObject({ cleared_at: null, last_sent_at: null });
  });

  it("tells them the next day about what is still wrong", async () => {
    await already(10);
    await db.deleteFrom("backup_runs").execute();
    expect(await check()).toEqual([]);
    // Tomorrow.
    await db.deleteFrom("alert_sends").execute();
    const sent = await check();
    expect(sent).toHaveLength(2);
    expect(sent[0]!.subject).toBe("The backup is late");
  });

  it("sends a staff-action alert regardless, and does not count it", async () => {
    await already(10);
    const target = await activeAccount();
    await enqueue({
      kind: "email.alert",
      payload: { alert: "staff.added", actorAccountId: owner.id, targetAccountId: target },
      priority: PRIORITY.interactive,
      idempotencyKey: `test:${target}`,
    });
    expect(await drain()).toHaveLength(2);
    expect(await sentToday()).toBe(10);
  });
});

describe("AC-48 a staff-action alert, the handler's half", () => {
  const ALERTS = ["staff.added", "staff.role_changed", "staff.removed", "deletion.scheduled", "deletion.cancelled"] as const;

  it("sends each kind to every owner, once, naming who did it and the account by id", async () => {
    await db.updateTable("accounts").set({ display_name: "Sam Owner" }).where("id", "=", owner.id).execute();
    const target = await activeAccount("target-person@example.test");
    await db.updateTable("accounts").set({ display_name: "Target Person" }).where("id", "=", target).execute();
    await db.deleteFrom("jobs").execute();

    for (const alert of ALERTS) {
      await enqueue({
        kind: "email.alert",
        payload: { alert, actorAccountId: owner.id, targetAccountId: target },
        priority: PRIORITY.interactive,
        idempotencyKey: `test:${alert}`,
      });
      const sent = await drain();
      expect(to(sent), alert).toEqual([await emailOf(owner.id), await emailOf(second.id)].sort());
      for (const message of sent) {
        const text = renderText(message.slots) + renderHtml(message.slots) + message.subject;
        expect(text, alert).toContain("Sam Owner");
        expect(text, alert).toContain(await emailOf(owner.id));
        expect(text, alert).toContain(target);
        // The account it was done to is an id: not its name, not its address.
        expect(text, alert).not.toContain("Target Person");
        expect(text, alert).not.toContain("target-person@example.test");
      }
    }
    expect(new Set(ALERTS.map((alert) => renderAlert({ alert, actorAccountId: owner.id, targetAccountId: target }, null).subject)).size).toBe(ALERTS.length);
  });

  it("does not mail twice when the job runs again", async () => {
    const target = await activeAccount();
    await db.deleteFrom("jobs").execute();
    const payload = { alert: "deletion.scheduled", actorAccountId: owner.id, targetAccountId: target };
    const mailer = new MemoryMailer();
    await handlers["email.alert"]!(payload, { mailer }, null);
    await handlers["email.alert"]!(payload, { mailer }, null);
    expect(await drain()).toHaveLength(2);
  });

  it("mails twice for two changes of one kind to one account in the same minute, and once for one change run twice", async () => {
    const target = await activeAccount();
    await db.deleteFrom("jobs").execute();
    const change = (id: string) => ({ alert: "staff.role_changed", actorAccountId: owner.id, targetAccountId: target, id });
    const [first, next] = [uuidv7(), uuidv7()];
    const mailer = new MemoryMailer();
    await handlers["email.alert"]!(change(first), { mailer }, null);
    await handlers["email.alert"]!(change(next), { mailer }, null);
    await handlers["email.alert"]!(change(first), { mailer }, null);
    expect(await drain()).toHaveLength(4);
  });

  it("is fifty a day", () => {
    expect(STAFF_DAILY_ALERTS).toBe(50);
  });

  it("drops the mail past fifty staff actions in a day, and leaves condition alerts their own ten", async () => {
    const target = await activeAccount();
    await db.deleteFrom("jobs").execute();
    const mailer = new MemoryMailer();
    const action = (id: string) => ({ alert: "staff.added", actorAccountId: owner.id, targetAccountId: target, id });
    const ids = Array.from({ length: 51 }, () => uuidv7());
    for (const id of ids) await handlers["email.alert"]!(action(id), { mailer }, null);
    // One that was already told runs again: still nothing new, and not refused.
    await handlers["email.alert"]!(action(ids[0]!), { mailer }, null);
    expect(await drain()).toHaveLength(100);
    expect(await sentToday()).toBe(0);

    await deadJob();
    expect(await check()).toHaveLength(2);
  });

  it("counts yesterday's staff actions for yesterday", async () => {
    const target = await activeAccount();
    await db.deleteFrom("jobs").execute();
    const mailer = new MemoryMailer();
    const action = () => ({ alert: "staff.removed", actorAccountId: owner.id, targetAccountId: target, id: uuidv7() });
    for (let i = 0; i < 50; i++) await handlers["email.alert"]!(action(), { mailer }, null);
    await sql`update jobs set created_at = created_at - interval '1 day' where kind = 'email.alert'`.execute(db);
    expect(await drain()).toHaveLength(100);
    await handlers["email.alert"]!(action(), { mailer }, null);
    expect(await drain()).toHaveLength(2);
  });

  it("gives each owner's email one attempt, so a retry cannot send it again", async () => {
    await handlers["email.alert"]!({ alert: "staff.removed", actorAccountId: owner.id, targetAccountId: second.id }, { mailer: new MemoryMailer() }, null);
    const children = await db.selectFrom("jobs").select(["account_id", "max_attempts", "priority"]).where("kind", "=", "email.alert").execute();
    expect(children.map((job) => job.account_id).sort()).toEqual([owner.id, second.id].sort());
    for (const job of children) expect(job).toMatchObject({ max_attempts: 1, priority: PRIORITY.interactive });
  });

  it("sends nothing to somebody who stopped being an owner while it waited", async () => {
    await handlers["email.alert"]!({ alert: "staff.removed", actorAccountId: owner.id, targetAccountId: second.id }, { mailer: new MemoryMailer() }, null);
    await db.updateTable("staff").set({ role: "support" }).where("account_id", "=", second.id).execute();
    expect(to(await drain())).toEqual([await emailOf(owner.id)]);
  });

  it("refuses a payload it does not understand", async () => {
    await expect(handlers["email.alert"]!({ alert: "nonsense" }, { mailer: new MemoryMailer() }, null)).rejects.toThrow();
  });
});

describe("AC-49 an alert's links", () => {
  const every: AlertPayload[] = [
    { alert: "condition", condition: "platform_cap", state: "opened" },
    { alert: "condition", condition: "service_down:worker", state: "opened" },
    { alert: "condition", condition: "service_down:database", state: "cleared" },
    { alert: "condition", condition: "job_late:jobs.purge", state: "opened" },
    { alert: "condition", condition: "job_dead", state: "paused", was: "opened" },
    { alert: "condition", condition: "backup_late", state: "opened" },
    { alert: "staff.added", actorAccountId: "018f0000-0000-7000-8000-000000000001", targetAccountId: "018f0000-0000-7000-8000-000000000002" },
    { alert: "deletion.scheduled", actorAccountId: "018f0000-0000-7000-8000-000000000001", targetAccountId: "018f0000-0000-7000-8000-000000000002" },
  ];

  it("are built from the configured web address and nothing else", () => {
    for (const payload of every) {
      const { slots } = renderAlert(payload, { name: "Sam Owner", email: "sam@example.test" });
      expect(slots.buttonUrl, JSON.stringify(payload)).toMatch(new RegExp(`^${env.WEB_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/admin/`));
      const links = [...renderHtml(slots).matchAll(/href="([^"]+)"/g)].map((match) => match[1]!);
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) expect(link.startsWith(`${env.WEB_URL}/`), link).toBe(true);
    }
  });

  it("send a condition alert to Health over the last day", () => {
    expect(renderAlert(every[0]!, null).slots.buttonUrl).toBe(`${env.WEB_URL}/admin/health?range=24h`);
  });

  it("carry no dash and nobody's name or address in a condition alert", async () => {
    for (const payload of every) {
      const { subject, slots } = renderAlert(payload, null);
      expect(subject + renderText(slots)).not.toMatch(/[\u2013\u2014]/);
    }
    await deadJob();
    for (const message of await check()) {
      const text = renderText(message.slots) + message.subject;
      expect(text).not.toContain(await emailOf(owner.id));
      expect(text).not.toContain(await emailOf(second.id));
    }
  });
});

describe("the count beside Health", () => {
  it("is zero when all is well", async () => {
    await beat("core-api", 0);
    expect(await wrongCount()).toBe(0);
  });

  it("adds dead jobs not dismissed, services down, and one for a late backup", async () => {
    await deadJob();
    await deadJob();
    const dismissed = await deadJob();
    await db.updateTable("jobs").set({ dismissed_at: new Date() }).where("id", "=", dismissed).execute();
    await beat("worker", 4);
    await beat("web", 1);
    await db.deleteFrom("backup_runs").execute();
    expect(await wrongCount()).toBe(4);

    const me = await app.inject({ method: "GET", url: "/v1/admin/me", headers: { cookie: owner.cookie } });
    expect(me.json().wrong).toBe(4);
  });
});
