// The tokens a send may reach. 024, and 0091.
//
// A token goes with the session that registered it when that session is
// deleted. An expired one stays in the table until the nightly purge, and
// nothing in that day may reach its phone, so every send reads its tokens
// here: the account's, each held by a session of the same account that has
// not expired. The session's id is joined on and never selected.

import { db } from "../db.js";

export function liveTokens(accountId: string) {
  return db
    .selectFrom("push_tokens")
    .innerJoin("sessions", (join) =>
      join.onRef("sessions.id", "=", "push_tokens.session_id").onRef("sessions.account_id", "=", "push_tokens.account_id"),
    )
    .where("push_tokens.account_id", "=", accountId)
    .where("sessions.expires_at", ">", new Date())
    .select(["push_tokens.id", "push_tokens.token", "push_tokens.platform"]);
}
