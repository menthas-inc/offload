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
  content_count: Generated<number>;
  /** How this thread wants to look: which tag dimension each widget groups by,
   *  and what order the widgets come in. Read whole with the thread and never
   *  in a WHERE clause, which is the test 001's "attrs holds what no screen
   *  queries" rule is really a proxy for. */
  attrs: Generated<unknown>;
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

export interface ConversationsTable {
  id: Generated<string>;
  account_id: string;
  /** Null in 003: naming a conversation is a model call with no reason to exist
   *  while there is one screen and no list. */
  title: string | null;
  started_at: Timestamp;
  /** Denormalised. The six-hour join reads it on every dump. */
  last_message_at: Timestamp;
  unread_at: Timestamp | null;
  last_read_at: Timestamp | null;
  created_at: Timestamp;
  /** Somebody closed the composer. Nothing new joins this conversation, and
   *  every message in it is untouched: ended is not deleted. Until this
   *  existed the only thing that ended a conversation was six hours of
   *  silence, so closing the chat cleared the screen and the next dump landed
   *  in the same conversation anyway. */
  ended_at: Timestamp | null;
  deleted_at: Timestamp | null;
  purge_after: Timestamp | null;
}

export interface MessagesTable {
  id: Generated<string>;
  conversation_id: string;
  account_id: string;
  role: "person" | "offload";
  type: Generated<"text" | "link" | "image" | "screenshot" | "voice" | "file">;
  turn_id: string;
  text: string | null;
  /** `queued` is internal and never reaches a client. */
  state: Generated<"queued" | "seen" | "answered" | "failed" | "partial">;
  client_key: string | null;
  source: Generated<"person" | "share" | "gmail" | "calendar" | "browser">;
  source_ref: string | null;
  attrs: Generated<unknown>;
  created_at: Timestamp;
  deleted_at: Timestamp | null;
  purge_after: Timestamp | null;
}

export interface ContentTable {
  id: Generated<string>;
  /** The author. Never the read predicate on its own: that resolves through
   *  thread_members, or a shared thread is invisible to every member but
   *  whoever wrote in it (OFF-3).
   *
   *  **Null only ever means the author deleted their account.** OFF-3 keeps
   *  their content in the threads they shared, so the row outlives them and
   *  loses the name. The write side of this type is non-null on purpose: a
   *  select yields `string | null` and an insert or update requires a
   *  `string`, so no application code can produce a null and the only thing
   *  that can is `on delete set null` in 0018. That is the answer to "a bug
   *  somewhere else emits one and it is indistinguishable", which is the real
   *  objection to a nullable author column. */
  account_id: ColumnType<string | null, string, string>;
  thread_id: string;
  /** The undo unit and the provenance. */
  derived_from_message_id: string | null;
  type: Generated<
    | "note"
    | "link"
    | "image"
    | "screenshot"
    | "voice"
    | "file"
    | "task"
    | "event"
    | "location"
  >;
  title: string;
  body: string | null;
  /** When it was ticked off. A timestamp rather than a boolean, because when
   *  something was done is a fact the agenda wants. */
  done_at: Timestamp | null;
  due_at: Timestamp | null;
  occurs_at: Timestamp | null;
  occurs_end_at: Timestamp | null;
  /** A flag on a task or an event, never a type of its own. */
  is_reminder: Generated<boolean>;
  /** 0 to 100, higher first. Orders content inside a thread. Not
   *  `needs_attention`, which decides what leaves one. */
  priority: Generated<number>;
  /** A person set the priority, so the planner must not overwrite it. */
  priority_pinned: Generated<boolean>;
  /** `dimension:value`, or a bare value whose dimension is implicitly `tag`. */
  tags: Generated<string[]>;
  /** Null forever is a normal state: a location with a name and no pin. */
  place_id: string | null;
  source: Generated<"person" | "share" | "gmail" | "calendar" | "browser">;
  source_ref: string | null;
  /** The model's tool_use block id. Idempotent within a turn, and deliberately
   *  not across a resume. */
  tool_call_id: string | null;
  attrs: Generated<unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
  /** Out of the active list, reversibly, by anybody in the thread. The opposite
   *  of `deleted_at` despite the resemblance: nothing is destroyed and nothing
   *  is scheduled. */
  archived_at: Timestamp | null;
  deleted_at: Timestamp | null;
  purge_after: Timestamp | null;
}

export interface PlacesTable {
  id: Generated<string>;
  provider: Generated<"google">;
  provider_place_id: string;
  name: string;
  formatted_address: string | null;
  lat: number | null;
  lng: number | null;
  resolved_at: Timestamp;
}

/** Search text to place id. The half of the cache that actually saves the
 *  outbound call, since caching by place id only saves the details lookup once
 *  the id is already known. */
export interface PlaceLookupsTable {
  /** A hash of the normalised search string, never the string. This table must
   *  not become a plaintext list of every place anybody has mentioned. */
  query_hash: string;
  /** Null is a remembered miss, so an unresolvable name is not retried forever. */
  place_id: string | null;
  looked_up_at: Timestamp;
}

export interface LlmUsageTable {
  id: Generated<string>;
  account_id: string;
  /** Draws from the same open set as jobs.kind and must match it, or the Costs
   *  page groups spend under a name no job has. */
  job_kind: string;
  category: "interactive" | "scheduled";
  model: string;
  input_tokens: Generated<number>;
  output_tokens: Generated<number>;
  cache_read_tokens: Generated<number>;
  cost_micros: Generated<number>;
  latency_ms: Generated<number>;
  created_at: Timestamp;
}

/** A short standing fact about a thread that is not content in it.
 *
 *  "Write todo names in three words" is a memory; "chase the electrician" is a
 *  task. The test is whether it would appear in a widget. Ten per thread, so
 *  what reaches a prompt is bounded by a constant rather than by how long
 *  somebody has used offload (OFF-8). */
/** Which threads one turn changed.
 *
 *  `content.derived_from_message_id` says what a dump produced, which answers
 *  "what changed" only for `add_content`. A turn that moves, ticks off,
 *  archives or rewrites something produces no content, and the screen concluded
 *  from an empty list that nothing had happened. */
export interface MessageThreadsTable {
  message_id: string;
  thread_id: string;
  /** The turn's content is in this thread now. False for the thread a move
   *  took it out of: that thread changed and has to reload, but a pill saying
   *  the dump went there would be untrue. */
  landed: Generated<boolean>;
  created_at: Timestamp;
}

export interface MemoriesTable {
  id: Generated<string>;
  /** The author. Decides delete (OFF-3) and shows in a shared thread. Never a
   *  read predicate: reads resolve through thread_members on subject_id, the
   *  same rule content follows and for the same reason.
   *
   *  Null only ever means the author deleted their account. Typed the same way
   *  `content.account_id` is, so a write cannot produce one: see the note
   *  there. */
  account_id: ColumnType<string | null, string, string>;
  scope: "account" | "thread" | "person";
  /** A thread_id, for thread scope. Polymorphic, so no foreign key, so thread
   *  deletion has to remove these itself. */
  subject_id: string | null;
  kind: "going_on" | "person" | "preference" | "noticed" | "standing";
  text: string;
  /** Corrections beat inference: offload may never overwrite a `stated` one. */
  origin: "stated" | "learned";
  derived_from_untrusted: Generated<boolean>;
  /** Any member, thread-wide, reversible. Content has `archived_at` for the
   *  same job: let everyone quiet something without letting anyone destroy
   *  what somebody else wrote. A muted memory does not reach the model. */
  muted_at: Timestamp | null;
  derived_from_message_id: string | null;
  attrs: Generated<unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
  /** Set by compaction, which does not exist yet. Filtered by every
   *  current-memory query regardless, because forgetting is silent. */
  superseded_at: Timestamp | null;
  deleted_at: Timestamp | null;
  purge_after: Timestamp | null;
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
  conversations: ConversationsTable;
  messages: MessagesTable;
  content: ContentTable;
  message_threads: MessageThreadsTable;
  memories: MemoriesTable;
  places: PlacesTable;
  place_lookups: PlaceLookupsTable;
  llm_usage: LlmUsageTable;
  jobs: JobsTable;
  analytics_events: AnalyticsEventsTable;
  waitlist_attempts: WaitlistAttemptsTable;
  schema_migrations: SchemaMigrationsTable;
}
