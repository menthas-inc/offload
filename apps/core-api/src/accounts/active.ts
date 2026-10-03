// 033. Whether an account has finished first run.
//
// A session exists from sign-in, while the account is still `invited` and has
// consented to nothing. First run only offers connecting a calendar and
// notifications after consent, and this is what makes the API agree: a route
// that brings anything in checks it rather than trusting the screen (SEC-2).

import { db } from "../db.js";

export async function isActive(accountId: string): Promise<boolean> {
  const row = await db.selectFrom("accounts").select("state").where("id", "=", accountId).executeTakeFirst();
  return row?.state === "active";
}
