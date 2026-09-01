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
  email: string;
  email_verified: Generated<boolean>;
  default_thread_id: string | null;
  referred_by_account_id: string | null;
  referral_thread_id: string | null;
  analytics_subject_id: string | null;
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
  subject: string;
  email: string | null;
  email_verified: Generated<boolean>;
  created_at: Timestamp;
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

export interface Database {
  accounts: AccountsTable;
  account_identities: AccountIdentitiesTable;
  staff: StaffTable;
  threads: ThreadsTable;
  thread_members: ThreadMembersTable;
  account_keys: AccountKeysTable;
  thread_keys: ThreadKeysTable;
  jobs: JobsTable;
  analytics_events: AnalyticsEventsTable;
  schema_migrations: SchemaMigrationsTable;
}
