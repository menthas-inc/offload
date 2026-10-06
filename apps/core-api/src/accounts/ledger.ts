// 035. What deleting an account does to every column that refers to one.
//
// The database enforces the first two fates through the foreign key's own
// delete rule, so deleting the `accounts` row is the delete. `step` is what a
// cascade cannot reach, and `deleteAccount` does each of those by name. `row`
// is a column on a row that already goes one of the other ways, written down
// so the list is complete rather than because anything has to be done.
//
// `test/account-ledger.test.ts` compares this to the catalog. A new column
// fails there until it has a line here.

export type Fate =
  /** The row goes with the account. */
  | "cascade"
  /** The row stays and no longer names the account. */
  | "set-null"
  /** No foreign key: `deleteAccount` removes it by name. */
  | "step"
  /** Lives on a row that goes by one of the fates above. */
  | "row"
  /** Refers to no account, whatever the column is called. */
  | "none";

export interface Entry {
  fate: Fate;
  why?: string;
}

const cascade: Entry = { fate: "cascade" };
const setNull: Entry = { fate: "set-null" };

export const ACCOUNT_LEDGER: Record<string, Entry> = {
  // The identity, and what only the account could read.
  "account_identities.account_id": cascade,
  "account_keys.account_id": cascade,
  "sessions.account_id": cascade,
  "exports.account_id": cascade,
  "staff.account_id": cascade,
  "conversations.account_id": cascade,
  "messages.account_id": cascade,
  "message_chunks.account_id": cascade,
  "turn_sources.account_id": cascade,
  "questions.account_id": cascade,
  "people_lookups.account_id": cascade,
  "jobs.account_id": cascade,
  "push_tokens.account_id": cascade,
  "today_put_offs.account_id": cascade,
  "account_limits.account_id": cascade,
  "limit_hits.account_id": cascade,
  "thread_proposals.account_id": cascade,
  "suggestions.account_id": cascade,

  // Connected apps. The grant itself is revoked at the provider by a step.
  "connector_connections.account_id": cascade,
  "connector_events.account_id": cascade,
  "connector_pending_writes.account_id": cascade,
  "thread_calendars.account_id": cascade,

  // Other people. Entries about the account leave their activity too.
  "connections.account_a": cascade,
  "connections.account_b": cascade,
  "connection_requests.from_account_id": cascade,
  "connection_requests.to_account_id": cascade,
  "blocks.blocker_account_id": cascade,
  "blocks.blocked_account_id": cascade,
  "pending_shares.account_id": cascade,
  "pending_shares.target_account_id": cascade,
  "activity.account_id": cascade,
  "activity.about_account_id": cascade,
  "activity_mentions.about_account_id": cascade,

  // Threads. The membership and the key go; what was added to a thread other
  // people are in stays with no author (OFF-3).
  "thread_members.account_id": cascade,
  "thread_keys.account_id": cascade,
  "thread_members.invited_by": setNull,
  "thread_members.removed_by_account_id": setNull,
  "threads.created_by_account_id": setNull,
  "content.account_id": setNull,
  "notes.account_id": setNull,
  "blobs.account_id": setNull,
  "labels.created_by": setNull,
  "labels.deleted_by": setNull,

  // Ours, not theirs.
  "llm_usage.account_id": { fate: "set-null", why: "the cost ledger holds no content and stays without the account" },
  "lookups.account_id": { fate: "set-null", why: "034: a search fee is a cost row, kept as llm_usage is, with no query on it" },
  "app_settings.updated_by_account_id": setNull,
  "account_limits.set_by_account_id": setNull,
  "staff_audit.staff_account_id": { fate: "none", why: "034: no foreign key on purpose; the record of staff actions names an account by an id that points at nothing once it is gone, and goes after two years" },
  "staff_audit.target_account_id": { fate: "none", why: "as above" },
  "accounts.referred_by_account_id": setNull,
  "accounts.delete_requested_by": { fate: "none", why: "034: the owner who marked the account, with no foreign key on purpose, so the mark reads the same once that owner is gone; it goes with the marked account's own row a day later" },

  // No foreign key, so nothing removes these unless it is told to.
  "blob_keys.scope_id": { fate: "step", why: "account-scope wraps of an object key" },
  "notes.subject_id": { fate: "step", why: "account and person scope notes go by notes.account_id, and an account-scope note by its subject too; set-null would leave them ownerless" },
  "note_chunks.subject_id": { fate: "row", why: "goes with its note" },
  "analytics_events.subject_id": { fate: "step", why: "unshipped events under the account's pseudonym" },
  "waitlist_attempts.email_hmac": { fate: "step", why: "the limiter's record of the address" },
  "review_code_attempts.email_hmac": { fate: "step", why: "039: the review code limiter's record of the address" },
  "review_codes.created_by": { fate: "none", why: "039: the staff member who made the code, with no foreign key, as an audit entry names one" },

  // The account row itself, and rows that go with it.
  "accounts.email": { fate: "row" },
  "accounts.email_verified": { fate: "row" },
  "accounts.invite_email_sent_at": { fate: "row" },
  "accounts.waitlist_email_sent_at": { fate: "row" },
  "accounts.analytics_subject_id": { fate: "row", why: "the pseudonym is destroyed with the row, which unlinks shipped events" },
  "account_identities.email": { fate: "row" },
  "account_identities.email_verified": { fate: "row" },
  "account_identities.subject": { fate: "row" },
  "connector_connections.external_account_email": { fate: "row" },
};
