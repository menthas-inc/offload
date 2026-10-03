// 034, section E. The alert conditions, and the count beside Health in the nav.
//
// `checkAlerts` runs each minute from the heartbeat timer, beside the beat,
// and is not a job. `wrongCount` is what `/v1/admin/me` returns as `wrong`:
// dead jobs not dismissed, plus services down, plus a late backup.
//
// **The conditions.**
//   - `platform_cap`: the platform's spend cap is set and reached.
//   - `service_down:<service>`: no good heartbeat for five minutes. A service
//     that has never reported is not down, and the web and the database count
//     although their rows are the Core API's view.
//   - `job_late:<kind>`: a scheduled job is late, as Health marks it.
//   - `job_dead`: a job has died since the last alert about one. It clears on
//     the next check, so each new death opens it again. A dead alert email is
//     left out: an alert about not being able to alert goes nowhere.
//   - `backup_late`: no good backup in 26 hours.
//
// **One email per condition until it clears.** A condition is a row in
// `alert_states`, open from when it is first true until it stops being. It is
// mailed once per opening: the send is claimed on the row, inside the
// transaction that books the mail, so two instances checking in the same
// minute send one. When it clears, `cleared_at` is set, and a service that
// was down sends one more to say it is back.
//
// **Ten a UTC day.** Each condition email, to all owners together, takes one
// from `alert_sends`. The tenth says alerts are paused until tomorrow. Past
// ten, a condition stays open and unsent, and is mailed the next day if it is
// still true. A service coming back past the limit is not mailed at all.
// Staff-action alerts never touch the count: they have their own, fifty a
// day, in `mail.ts`.

import { sql } from "kysely";
import { db } from "../db.js";
import { platformCapReached } from "../budget.js";
import { backups, downServices } from "./services.js";
import { lateKinds } from "./scheduled.js";
import { bookAlert, owners } from "./mail.js";

export const DAILY_ALERTS = 10;

/** How long a service is down before anybody is mailed. */
const DOWN_MINUTES = 5;

/** Every condition that is true now. */
async function conditions(): Promise<string[]> {
  const [cap, down, late, dead, backup] = await Promise.all([
    platformCapReached(),
    downServices(DOWN_MINUTES),
    lateKinds(),
    sql<{ died: boolean }>`
      select exists (
        select 1 from jobs
        where state = 'dead' and dismissed_at is null and kind <> 'email.alert'
          and updated_at > coalesce((select last_sent_at from alert_states where condition = 'job_dead'), '-infinity')
      ) as died`.execute(db),
    backups(),
  ]);
  return [
    ...(cap ? ["platform_cap"] : []),
    ...down.map((service) => `service_down:${service}`),
    ...late.map((kind) => `job_late:${kind}`),
    ...(dead.rows[0]!.died ? ["job_dead"] : []),
    ...(backup.late ? ["backup_late"] : []),
  ];
}

class NoneLeft extends Error {}

/** Mail every owner about one condition, if this instance is the one to.
 *
 *  For an opening, the claim is `last_sent_at` on the open row: whoever sets
 *  it sends. For a clearing, the caller already won the update that cleared
 *  it. Either way the day's count is taken in the same transaction, and with
 *  none left the whole thing is rolled back, claim included. */
async function send(condition: string, state: "opened" | "cleared"): Promise<void> {
  try {
    await db.transaction().execute(async (tx) => {
      const to = await owners(tx);
      if (to.length === 0) return;

      if (state === "opened") {
        const claimed = await sql`
          update alert_states set last_sent_at = now()
          where condition = ${condition} and cleared_at is null and (last_sent_at is null or last_sent_at < opened_at)
          returning condition`.execute(tx);
        if (claimed.rows.length === 0) return;
      }

      const slot = await sql<{ day: string; count: number }>`
        insert into alert_sends (day, count) values ((now() at time zone 'UTC')::date, 1)
        on conflict (day) do update set count = alert_sends.count + 1 where alert_sends.count < ${DAILY_ALERTS}
        returning day::text as day, count`.execute(tx);
      const taken = slot.rows[0];
      if (!taken) throw new NoneLeft();

      const payload =
        taken.count >= DAILY_ALERTS
          ? ({ alert: "condition", condition, state: "paused", was: state } as const)
          : ({ alert: "condition", condition, state } as const);
      // The day and its count name this send, so nothing books it twice.
      for (const owner of to) await bookAlert(tx, owner.id, payload, `alert:${taken.day}:${taken.count}`);
    });
  } catch (error) {
    if (!(error instanceof NoneLeft)) throw error;
  }
}

export async function checkAlerts(): Promise<void> {
  const now = await conditions();

  // Open what is true. A row that is already open is left alone; one that
  // had cleared opens again, and keeps when it was last mailed.
  for (const condition of now) {
    await sql`
      insert into alert_states (condition) values (${condition})
      on conflict (condition) do update set opened_at = now(), cleared_at = null
      where alert_states.cleared_at is not null`.execute(db);
  }

  // Clear what no longer is. The update is the claim: one instance gets the
  // row back, and it is the one that says a service has returned.
  const cleared = await sql<{ condition: string; told: boolean }>`
    update alert_states set cleared_at = now()
    where cleared_at is null and not (condition = any(${sql.val(now)}))
    returning condition, (last_sent_at is not null and last_sent_at >= opened_at) as told`.execute(db);
  for (const row of cleared.rows) {
    // Only for a service, and only when its going down was mailed.
    if (row.condition.startsWith("service_down:") && row.told) await send(row.condition, "cleared");
  }

  // Mail what is open and not yet mailed: just opened, or opened past the
  // day's limit and still true.
  const unsent = await sql<{ condition: string }>`
    select condition from alert_states
    where cleared_at is null and (last_sent_at is null or last_sent_at < opened_at)
    order by opened_at`.execute(db);
  for (const row of unsent.rows) await send(row.condition, "opened");
}

/** What is wrong, as one number: dead jobs nobody has dismissed, services
 *  that read down, and one for a late backup. */
export async function wrongCount(): Promise<number> {
  const [dead, down, backup] = await Promise.all([
    db
      .selectFrom("jobs")
      .select(({ fn }) => fn.countAll<string>().as("n"))
      .where("state", "=", "dead")
      .where("dismissed_at", "is", null)
      .executeTakeFirstOrThrow(),
    downServices(),
    backups(),
  ]);
  return Number(dead.n) + down.length + (backup.late ? 1 : 0);
}
