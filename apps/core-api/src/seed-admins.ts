// seed:admins.
//
// Run by hand, never on a request path. ADMIN_EMAILS is read here and nowhere
// else in the codebase, which is the property worth protecting: if the request
// path consulted it, then anyone who can edit an environment variable could
// grant themselves the admin panel without touching the database, and on a
// platform where env vars are editable in a web console that is a very short
// path from "has the Railway login" to "can read the waitlist".
//
// It promotes through the same transaction as the admin panel does. The first
// owner is therefore assembled exactly like everyone else: same account key,
// same Miscellaneous thread, same membership, same event. A second code path
// for the first account is a code path that only ever runs against an empty
// database, which is where the bugs that matter hide.

import { closeDb, db } from "./db.js";
import { env } from "./env.js";
import { promote } from "./admin/promote.js";

export async function seedAdmins(log: (message: string) => void = console.log): Promise<void> {
  const emails = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) {
    log("ADMIN_EMAILS is empty. Nothing to do.");
    return;
  }

  for (const email of emails) {
    const result = await promote(email, { invitedBy: null });

    if (result.status === "refused") {
      // Loud, because the alternative is a silent no-op that looks identical
      // to success and leaves nobody able to open the panel.
      log(`refused ${email}: the account is disabled. Re-enable it first.`);
      continue;
    }

    await db
      .insertInto("staff")
      .values({ account_id: result.accountId, role: "owner" })
      // Never demotes and never re-grants. Running this twice is a no-op, and
      // a role changed by hand in the database is not silently reverted by the
      // next deploy that happens to run the seed.
      .onConflict((oc) => oc.column("account_id").doNothing())
      .execute();

    log(`${email}: ${result.status}, owner`);
  }

  log("ADMIN_EMAILS is not read anywhere else. Editing it grants nothing until this runs again.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await seedAdmins();
  await closeDb();
}
