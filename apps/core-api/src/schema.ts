// The database types Kysely reads.
//
// Hand-written for now and replaced by codegen from the live schema once there
// is a database to introspect, so that types come from the schema rather than
// being maintained beside it.

import type { Generated, ColumnType } from "kysely";

// Insert allows undefined because every timestamp column here has a DEFAULT,
// so Generated<> on top of this would double-wrap and break the update type.
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

// Generated<T> here means "has a SQL DEFAULT": optional on insert, always
// present on read. Getting this wrong is not cosmetic, it makes every insert
// restate a value the database already knows, which is how a default silently
// stops being the default.

export interface AccountsTable {
  id: Generated<string>;
  state: Generated<"waitlist" | "invited" | "active" | "disabled">;
  display_name: string | null;
  /** Better Auth's user model declares it. Nullable and unread: offload shows
   *  no avatar anywhere. See migration 0006. */
  image: string | null;
  email: string;
  email_verified: Generated<boolean>;
  default_thread_id: string | null;
  referred_by_account_id: string | null;
  referral_thread_id: string | null;
  analytics_subject_id: Generated<string>;
  first_signed_in_at: Timestamp | null;
  invite_email_sent_at: Timestamp | null;
  waitlist_email_sent_at: Timestamp | null;
  tier: Generated<string>;
  consent_version: string | null;
  consented_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  disabled_at: Timestamp | null;
  deleted_at: Timestamp | null;
}

export interface AccountIdentitiesTable {
  id: Generated<string>;
  account_id: string;
  provider: "apple" | "google";
  /** Better Auth 1.7 scopes an identity by issuer as well as subject, and
   *  queries it on every sign-in. For a social provider the issuer is the
   *  provider, so this mirrors it. See migration 0005. */
  issuer: Generated<string>;
  subject: string;
  email: string | null;
  email_verified: Generated<boolean>;
  // Better Auth's account model requires these. We do not want them: we never
  // call a provider API on someone's behalf, and connector tokens are a
  // separate vault by decision. A hook blanks them before the row is
  // written, so a live provider token is never at rest here at all. See
  // migration 0002 and auth.ts.
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  access_token_expires_at: Timestamp | null;
  refresh_token_expires_at: Timestamp | null;
  scope: string | null;
  password: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SessionsTable {
  id: Generated<string>;
  account_id: string;
  token: string;
  expires_at: Timestamp;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface VerificationsTable {
  id: Generated<string>;
  identifier: string;
  value: string;
  expires_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface StaffTable {
  account_id: string;
  role: "support" | "owner";
  created_at: Timestamp;
}

export interface ThreadsTable {
  id: Generated<string>;
  created_by_account_id: string | null;
  name: string;
  always_on: Generated<boolean>;
  icon: string | null;
  thing_count: Generated<number>;
  last_activity_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
  purge_after: Timestamp | null;
}

export interface ThreadMembersTable {
  id: Generated<string>;
  thread_id: string;
  account_id: string;
  invited_by: string | null;
  state: Generated<"pending" | "accepted" | "declined" | "expired">;
  created_at: Timestamp;
  responded_at: Timestamp | null;
  expires_at: Timestamp | null;
}

export interface AccountKeysTable {
  account_id: string;
  wrapped_dek: Buffer;
  wrapped_by: string;
  version: Generated<number>;
  created_at: Timestamp;
  rotated_at: Timestamp | null;
}

export interface ThreadKeysTable {
  thread_id: string;
  account_id: string;
  wrapped_tk: Buffer;
  created_at: Timestamp;
}

export interface JobsTable {
  id: Generated<string>;
  kind: string;
  account_id: string | null;
  payload: Generated<unknown>;
  priority: Generated<number>;
  run_after: Timestamp;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  state: Generated<"queued" | "running" | "done" | "failed" | "dead">;
  locked_at: Timestamp | null;
  locked_by: string | null;
  idempotency_key: string | null;
  last_error: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AnalyticsEventsTable {
  id: Generated<string>;
  name: string;
  version: Generated<number>;
  occurred_at: Timestamp;
  received_at: Timestamp;
  anonymous_id: string | null;
  subject_id: string | null;
  session_id: string | null;
  source: string;
  platform: string | null;
  properties: Generated<unknown>;
  shipped_at: Timestamp | null;
}

export interface SchemaMigrationsTable {
  name: string;
  applied_at: Timestamp;
}

export interface WaitlistAttemptsTable {
  id: Generated<string>;
  /** HMAC, never the address. See migration 0004. */
  email_hmac: Buffer;
  ip_hmac: Buffer;
  created_at: Generated<Timestamp>;
}

export interface Database {
  accounts: AccountsTable;
  account_identities: AccountIdentitiesTable;
  sessions: SessionsTable;
  verifications: VerificationsTable;
  staff: StaffTable;
  threads: ThreadsTable;
  thread_members: ThreadMembersTable;
  account_keys: AccountKeysTable;
  thread_keys: ThreadKeysTable;
  jobs: JobsTable;
  analytics_events: AnalyticsEventsTable;
  waitlist_attempts: WaitlistAttemptsTable;
  schema_migrations: SchemaMigrationsTable;
}
