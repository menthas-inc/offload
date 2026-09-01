// Seed data.
//
// This is not a convenience. Railway has no database branching, so this script
// is the only thing standing in for testing a migration against realistic data
// (decisions.md). It has to stay honest as the model grows: shapes and volumes
// that resemble reality, not three rows named "test".

import { randomUUID } from "node:crypto";
import { db, closeDb } from "./db.js";
import { promote } from "./admin/promote.js";

const HEAVY_WAITLIST = 120;

export async function seed(log: (msg: string) => void = console.log): Promise<void> {
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("thread_keys").execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("account_keys").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("staff").execute();
  await db.deleteFrom("account_identities").execute();
  await db.deleteFrom("accounts").execute();

  // A waitlist with realistic volume, because the admin page that lists it is
  // the one screen here whose data grows unattended.
  const waiting = Array.from({ length: HEAVY_WAITLIST }, (_, i) => ({
    email: `waiting-${i}@example.test`,
    state: "waitlist" as const,
    analytics_subject_id: randomUUID(),
  }));
  await db.insertInto("accounts").values(waiting).execute();

  // One fully promoted account, through the same transaction the admin panel
  // uses. Not a shortcut that resembles it: a seed that assembles accounts its
  // own way stops being evidence that promotion works.
  const promoted = await promote("owner@example.test");
  if (promoted.status === "refused") throw new Error("seed could not promote its owner");

  await db
    .updateTable("accounts")
    .set({ display_name: "Seed Owner", state: "active", email_verified: true })
    .where("id", "=", promoted.accountId)
    .execute();

  await db.insertInto("staff").values({ account_id: promoted.accountId, role: "owner" }).execute();

  // An invited account that has not signed in, which is a state the admin
  // waitlist page shows separately and which is easy to forget exists.
  await db
    .insertInto("accounts")
    .values({
      email: "invited@example.test",
      state: "invited",
      analytics_subject_id: randomUUID(),
    })
    .execute();

  log(`seeded: ${HEAVY_WAITLIST} waiting, 1 invited, 1 active owner with a Miscellaneous thread`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await seed();
  await closeDb();
}
