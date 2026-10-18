// The database's clock.
//
// The claim compares `run_after` with the database's `now()`, so anything
// counted from the hour a row ran in is counted on that clock. Node's runs on
// another host and can be a few milliseconds behind it, which is enough to put
// a row claimed at 11:00:00.002 in the hour before.

import { sql } from "kysely";
import { db } from "../db.js";

export async function databaseNow(): Promise<Date> {
  return (await sql<{ now: Date }>`select now() as now`.execute(db)).rows[0]!.now;
}
