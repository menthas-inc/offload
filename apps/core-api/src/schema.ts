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
  /** What Apple or Google last called this account. **Read only by the account
   *  it belongs to**, and only to prefill the field where they confirm or
   *  change it, so a name nobody has seen never reaches another member's
   *  screen. See migration 0022. */
  provider_name: string | null;
  /** Better Auth's user model declares it. Nullable and unread: offload shows
   *  no avatar anywhere. See migration 0006. */
  image: string | null;
  email: string;
  email_verified: Generated<boolean>;
  default_thread_id: string | null;
  /** 038. The last memory pass, which the next one reads from. */
  memories_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  referred_by_account_id: string | null;
  referral_thread_id: string | null;
  analytics_subject_id: Generated<string>;
  first_signed_in_at: Timestamp | null;
  invite_email_sent_at: Timestamp | null;
  waitlist_email_sent_at: Timestamp | null;
  tier: Generated<string>;
  /** Whether offload may send a query derived from a dump to a search company.
   *  016. Read server-side in the worker at call time, never from a request. */
  /** ISO 3166-1 alpha-2, theirs to set. Null until they do, and offload then
   *  says it does not know rather than assuming. */
  country: string | null;
  web_search_enabled: Generated<boolean>;
  /** 019. Every calendar write is put to the person first, whoever it reaches.
   *  Off by default: the reversible-by-default rule stands until they ask. */
  calendar_ask_first: Generated<boolean>;
  /** Whether offload may open a link somebody pasted. A different promise from
   *  the one above: it sends none of their words anywhere. */
  web_links_enabled: Generated<boolean>;
  consent_version: string | null;
  consented_at: Timestamp | null;
  /** 023. The account's clock, an IANA name ICU resolved. Set at first run
   *  from the device, editable in Settings and by the strip on Today. Every
   *  timed date is drawn and every digest is scheduled in it. Null until the
   *  device says, and then everything reads as it did before: UTC. */
  time_zone: string | null;
  /** 023. The one device zone the person answered Keep to, so a trip asks
   *  once. Cleared when the clock changes. */
  kept_time_zone: string | null;
  /** 023. Whether the strip may offer to switch the clock when the phone is
   *  somewhere else. Off means nothing compares. */
  follow_device: Generated<boolean>;
  /** 024. The four switches, named as the sends are, and the two hours in
   *  the account's zone, `HH:MM:SS` as Postgres hands a time back. */
  notify_due_today: Generated<boolean>;
  notify_due_today_at: Generated<string>;
  notify_coming_tomorrow: Generated<boolean>;
  notify_coming_tomorrow_at: Generated<string>;
  notify_people_requests: Generated<boolean>;
  notify_shared_activity: Generated<boolean>;
  /** 042. Reminders, and How many: 1, 2 or 3 for each date, Medium by default. */
  notify_reminders: Generated<boolean>;
  notify_reminder_count: Generated<number>;
  /** When Activity was last opened: the dot is a row newer than this. */
  activity_seen_at: Timestamp | null;
  /** 027. Customize Today's document; null is the defaults. Only a value
   *  `todayLayout` parsed is ever written. */
  today_layout: ColumnType<unknown, string | null | undefined, string | null>;
  /** 028. A hash of the daily pass's last candidate set, so it runs only when
   *  that set changed. */
  loose_pass_key: string | null;
  /** 022. The mark, a 176px PNG drawn once from the id and never rewritten.
   *  Not content. Null until somebody first asks for it. */
  avatar_png: Buffer | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  disabled_at: Timestamp | null;
  deleted_at: Timestamp | null;
  /** 034. Marked for deletion by an owner: locked now, destroyed at this
   *  time unless the mark is cleared first. */
  delete_after: Timestamp | null;
  /** 034. Who asked. An id with no foreign key, as an audit entry's are. */
  delete_requested_by: string | null;
  /** 039. The review code that let this account in. Null for everyone an
   *  admin invited. */
  review_code_id: string | null;
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

/** Settings the owner changes while offload runs (0073). One row per key.
 *  The closed set of keys is the registry in `settings.ts` (0074). */
export interface AppSettingsTable {
  key: string;
  value: unknown;
  updated_at: Timestamp;
  updated_by_account_id: string | null;
}

/** 034. One account's own value for a per-person cap. Absent is the global
 *  setting. */
export interface AccountLimitsTable {
  account_id: string;
  key: string;
  value: ColumnType<string, number, number>;
  set_by_account_id: string | null;
  updated_at: Timestamp;
}

export interface StaffTable {
  account_id: string;
  role: "support" | "owner";
  created_at: Timestamp;
}

/** 034. What staff did. No foreign keys, no address, no free text; the
 *  database refuses an update and a delete inside two years (0075). */
export interface StaffAuditTable {
  id: Generated<string>;
  at: Timestamp;
  staff_account_id: string;
  kind: string;
  target_account_id: string | null;
  setting_key: string | null;
  old_value: ColumnType<unknown, string | null | undefined, never>;
  new_value: ColumnType<unknown, string | null | undefined, never>;
  job_id: string | null;
  day: ColumnType<string, never, never>;
}

/** 034. One row a minute per service (0077). */
export interface HeartbeatsTable {
  service: "core-api" | "worker" | "web" | "database";
  minute: Timestamp;
  ok: boolean;
  commit: string | null;
  started_at: Timestamp | null;
}

/** 034. Hourly job counts, kept 90 days. No account, by design. */
export interface JobStatsHourlyTable {
  hour: Timestamp;
  kind: string;
  outcome: string;
  count: number;
  wait_ms_sum: Generated<string>;
  wait_ms_p95: Generated<number>;
  run_ms_sum: Generated<string>;
  run_ms_p95: Generated<number>;
}

/** 034. Written by the backup service at the end of each run. */
export interface BackupRunsTable {
  id: Generated<string>;
  finished_at: Timestamp;
  bytes: Generated<string>;
  ok: boolean;
}

/** 034. One alert condition: open until it clears. */
export interface AlertStatesTable {
  condition: string;
  opened_at: Timestamp;
  cleared_at: Timestamp | null;
  last_sent_at: Timestamp | null;
}

/** 034. Condition alerts sent in a UTC day, for the limit of ten. */
export interface AlertSendsTable {
  day: string;
  count: Generated<number>;
}

/** 034. Each time a cap refused somebody, counted per UTC day. */
export interface LimitHitsTable {
  account_id: string;
  cap: string;
  scope: "account" | "platform";
  day: string;
  count: Generated<number>;
  last_at: Timestamp;
}

/** 034. What a company charged in a month: its own bill, or a fixed amount
 *  an owner typed. */
export interface VendorCostsTable {
  vendor: string;
  month: string;
  source: "billed" | "fixed";
  amount_micros: ColumnType<string, number, number>;
  final: Generated<boolean>;
  read_at: Timestamp;
}

export interface ThreadsTable {
  id: Generated<string>;
  created_by_account_id: string | null;
  name: string;
  always_on: Generated<boolean>;
  /** 037. One of the seventy thread icons, or lasso. */
  icon: Generated<string>;
  /** 037. One of the ten label hues. */
  hue: Generated<number>;
  /** 037. Whose pick the icon and hue are. A person's is never picked again. */
  icon_set_by: Generated<"offload" | "person">;
  content_count: Generated<number>;
  /** How this thread wants to look: what order the widgets come in. Read
   *  whole with the thread and never in a WHERE clause, which is the test
   *  001's "attrs holds what no screen queries" rule is really a proxy for. */
  attrs: Generated<unknown>;
  last_activity_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
  purge_after: Timestamp | null;
  /** 025. When the nightly sort last read this thread. */
  labels_sorted_at: Timestamp | null;
}

export interface ThreadMembersTable {
  id: Generated<string>;
  thread_id: string;
  account_id: string;
  invited_by: string | null;
  state: Generated<"pending" | "accepted" | "declined" | "expired" | "removed" | "left">;
  created_at: Timestamp;
  responded_at: Timestamp | null;
  expires_at: Timestamp | null;
  /** When they left, for the Undo window and nothing else. The row stays,
   *  marked `left`, so restore has exactly one row it may put back. */
  left_at: Timestamp | null;
  /** The member's own fold of To do's finished rows. Theirs, not the
   *  thread's, which is why it is here and not in `threads.attrs`. */
  hide_done: Generated<boolean>;
  /** 022. What the invitation shows of the thread: the count and two of the
   *  sharer's own titles, taken when the share was made. Null once accepted,
   *  and the only thing a person who has not accepted ever reads of it. */
  preview: SharePreview | null;
  /** 022. Who took this member out, when the state is `removed`. Ids only,
   *  for a question the product never raises. */
  removed_by_account_id: string | null;
  removed_at: Timestamp | null;
  /** 032. When this member's nightly pass last applied here. What the next one
   *  is booked on and reads is what changed since. */
  nightly_at: Timestamp | null;
}

/** 022. The invitation's whole view of a thread. */
export interface SharePreview {
  count: number;
  titles: string[];
}

/** 022. One row per unordered pair, `account_a < account_b`, so mutual is
 *  structural and removal is one delete. */
export interface ConnectionsTable {
  account_a: string;
  account_b: string;
  created_at: Timestamp;
}

export interface ConnectionRequestsTable {
  id: Generated<string>;
  from_account_id: string;
  to_account_id: string;
  /** False when the recipient had blocked the requester: the row behaves
   *  identically on the requester's side and nothing on the recipient's side
   *  reads it. */
  delivered: Generated<boolean>;
  created_at: Timestamp;
  expires_at: Timestamp;
  dismissed_at: Timestamp | null;
  withdrawn_at: Timestamp | null;
  accepted_at: Timestamp | null;
}

export interface BlocksTable {
  blocker_account_id: string;
  blocked_account_id: string;
  created_at: Timestamp;
}

/** 022. A said share, proposed by the model and waiting for the tap. */
export interface PendingSharesTable {
  id: Generated<string>;
  account_id: string;
  message_id: string;
  thread_id: string;
  target_account_id: string;
  created_at: Timestamp;
  expires_at: Timestamp;
  confirmed_at: Timestamp | null;
  declined_at: Timestamp | null;
}

export interface PeopleLookupsTable {
  account_id: string;
  looked_up_at: Timestamp;
}

/** 022. Who may see whom, before the reader's own state and reverse-block
 *  filter. `visibleTo` in `people/access.ts` is the only reader. */
export interface VisiblePeopleView {
  viewer_account_id: string;
  account_id: string;
  relation: "connected" | "asked_you" | "you_asked" | "thread" | "waiting" | "blocked";
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
  /** 017. When somebody asked this turn to stop. The worker abandons the task;
   *  nothing is rolled back, because cancel stops work and undo reverses it. */
  cancelled_at: Date | null;
  idempotency_key: string | null;
  last_error: string | null;
  /** 034. Why it failed, from the closed set in `jobs/errors.ts`. The admin
   *  panel reads this and never `last_error`. */
  error_code: string | null;
  /** 034. A dead job is retried from the panel once. */
  retried_at: Timestamp | null;
  /** 034. Taken off the dead list, and kept. */
  dismissed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** 024. A phone's push token, bound to the account that registered it last. */
export interface PushTokensTable {
  id: Generated<string>;
  account_id: string;
  token: string;
  platform: "ios" | "android";
  /** 042. The phone has the channel and the door for a reminder of its own. */
  takes_reminders: Generated<boolean>;
  created_at: Timestamp;
  last_seen_at: Timestamp;
}

/** 024. What offload told somebody, in the words it used, and what it decided
 *  not to tell them and why. */
export interface ActivityTable {
  id: Generated<string>;
  account_id: string;
  kind: "digest" | "request" | "share" | "shared_activity" | "expired" | "moved" | "acted" | "labelled" | "mail" | "export" | "reminder";
  sent: boolean;
  reason: "setting" | "permission" | "design" | null;
  title: string;
  body: string | null;
  send: "morning" | "evening" | null;
  thread_id: string | null;
  content_id: string | null;
  about_account_id: string | null;
  member_id: string | null;
  request_id: string | null;
  /** 025. The sort a `labelled` row records, which its Undo takes back. */
  label_run_id: string | null;
  /** 025. Somebody pressed Undo; every member's copy carries it. */
  undone_at: Timestamp | null;
  /** 026. Which of the five an email row is; null for every other kind. */
  mail_outcome: "filed" | "asked" | "nothing" | "refused" | "over_limit" | null;
  /** 026. The turn Undo reverses, and the email the row opens. */
  turn_id: string | null;
  message_id: string | null;
  /** 042. A reminder about a note goes with the note. */
  note_id: Generated<string | null>;
  occurred_at: Timestamp;
}

/** 042. Which memories a send named, so forgetting one finds its records. */
export interface ActivityMemoriesTable {
  activity_id: string;
  note_id: string;
}

export type RemindKind = "meeting" | "appointment" | "occasion" | "deadline" | "trip" | "day" | "none";
export type RemindLead = "none" | "days" | "weeks" | "months";

/** 042. What offload worked out about a dated thing so it can remind its
 *  author. No date and no schedule: the date is always read from the thing. */
export interface ReminderLabelsTable {
  id: Generated<string>;
  /** The thing's author, and the only account it reminds. */
  account_id: string;
  content_id: string | null;
  /** A thread note or a memory. */
  note_id: string | null;
  kind: RemindKind | null;
  lead: RemindLead | null;
  anchor_content_id: string | null;
  anchor_note_id: string | null;
  name: string | null;
  /** A memory's yearly date, `MM-DD`. */
  yearly_on: string | null;
  fingerprint: string | null;
  labelled_at: Timestamp | null;
  date_set_at: Timestamp | null;
  held_at: Timestamp | null;
  stopped_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

/** 026. A DKIM signature accepted once: a hash, never the message. */
export interface MailSignaturesTable {
  hash: Buffer;
  seen_at: Generated<Timestamp>;
}

/** 024. Whose words an Activity row carries, and from which thread. */
export interface ActivityMentionsTable {
  activity_id: string;
  thread_id: string;
  about_account_id: string;
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

/** 039. A code staff make for store reviewers. Only its hash is kept. */
export interface ReviewCodesTable {
  id: Generated<string>;
  code_hash: Buffer;
  note: string;
  max_uses: number;
  uses: Generated<number>;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  /** The staff member who made it. No foreign key. */
  created_by: string;
  created_at: Generated<Timestamp>;
}

/** 039. The redemption limiter's record. HMACs, never the address or IP. */
export interface ReviewCodeAttemptsTable {
  id: Generated<string>;
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
  state: Generated<"queued" | "seen" | "answered" | "failed" | "partial" | "cancelled">;
  client_key: string | null;
  /** The thread on screen when this was dumped, membership checked. A filing
   *  default the text can override, not a destination. Null on anything dumped
   *  from outside a thread, and on a thread since deleted. */
  looking_at_thread_id: string | null;
  /** 017. What offload is doing right now, at most 80 characters, cleared when
   *  the turn settles. One column rather than a table: a step is the current
   *  one and there is no history to keep. */
  step: string | null;
  /** So a step left behind by a worker that died is ignorable. */
  step_at: Date | null;
  /** 019. Written for a tapped answer whose label was a calendar somebody else
   *  named. The tail the prompts read substitutes a fixed line for its text, so
   *  the name never reaches a prompt as the person's words. */
  derived_from_untrusted: Generated<boolean>;
  source: Generated<"person" | "share" | "mail" | "gmail" | "calendar" | "browser">;
  source_ref: string | null;
  attrs: Generated<unknown>;
  /** 021. What the voice note was heard as. Beside `text`, never folded into
   *  it: the bubble draws the two apart. Every reader of the person's words
   *  goes through `said(text, transcript)` in SQL. */
  transcript: string | null;
  transcribed_at: Timestamp | null;
  /** The device's IANA time zone when this was sent, from the request header,
   *  so the turn that reads the message reads "today" and "3pm" in it. Null
   *  is read as UTC. Per message until the account carries one. */
  time_zone: string | null;
  created_at: Timestamp;
  deleted_at: Timestamp | null;
  purge_after: Timestamp | null;
}

/** Where a turn got something from, for the chip under it.
 *
 *  Two fields and the omissions are the point: a provider's citation also
 *  carries the page's title and a quoted excerpt, and both are written by
 *  whoever owns the page. Neither crosses out of the reader. */
export interface TurnSourcesTable {
  id: Generated<string>;
  account_id: string;
  turn_id: string;
  domain: string;
  url: string;
  created_at: Generated<Timestamp>;
}

/** What kind of lookup happened, so the next narrow tool is argued from counts.
 *
 *  **No query and no URL.** A search query is somebody's own sentence and
 *  anonymising it does not make it not content. */
export interface LookupsTable {
  id: Generated<string>;
  /** Null once the account is gone (0076): read as nullable, never written
   *  as one, the way `content.account_id` is. */
  account_id: ColumnType<string | null, string, string>;
  label: string;
  kind: "search" | "read";
  outcome: "used" | "unused" | "empty" | "failed" | "refused_bound";
  cost_micros: Generated<number>;
  created_at: Generated<Timestamp>;
}

/** Which domains get read, with nobody attached. No account id by design: this
 *  is aggregate by construction rather than by policy. Read through
 *  `domain_reads_visible`, which suppresses counts below a floor. */
export interface DomainReadsTable {
  domain: string;
  day: string;
  count: Generated<number>;
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
  /** Where it came from, when it came from a page. Its own column rather than a
   *  convention inside `body`, because a convention is a thing the model
   *  remembers four times out of five: two of the three link rows in production
   *  had lost their address entirely. */
  url: string | null;
  /** A picture the page publishes about itself, as an address. The client loads
   *  it from the site, so the site learns who looked and when. Disclosed. */
  image_url: string | null;
  /** When it was ticked off. A timestamp rather than a boolean, because when
   *  something was done is a fact the agenda wants. */
  done_at: Timestamp | null;
  /** Typed straight into the thread and queued for offload to read, which is
   *  what the + on a section heading does. Null once it has.
   *
   *  A timestamp rather than a boolean so a client can stop showing a spinner
   *  for a job that died, without anything having to sweep the table: a row
   *  whose filing started an hour ago is not being worked on, and it is a
   *  perfectly good row either way. */
  filing_at: Timestamp | null;
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
  /** That it comes round again, as a rule with no occurrences behind it.
   *
   *  **Not the same thing as `attrs.series_ref`**, which is occurrences a
   *  calendar already sent and offload mirrors. A rule is what somebody said in
   *  words when there was nothing to mirror, and the two never describe one row:
   *  the database refuses it. */
  /** 023. An RFC 5545 rule in the closed grammar of `@offload/widgets`, in
   *  the server's own serialisation, anchored on `occurs_at` for an event and
   *  `due_at` for everything else. Replaced the six-value `repeats`. */
  rrule: string | null;
  /** Null forever is a normal state: a location with a name and no pin. */
  place_id: string | null;
  /** 030. What a row that is not a `location` is looked up by: an event's
   *  location, or the place name a link's page gave. One line, at most 120, on
   *  an event or a link only; the database refuses anything else. */
  location: string | null;
  /** 030. A link's page was read for a location, found or not; kept when the
   *  point is cleared, so a cleared link is never read again. */
  place_read_at: Timestamp | null;
  /** 030. The place fields before a turn's edit changed them, for that turn's
   *  Undo. Server-written only, and cleared once no Undo can use it. */
  place_prior: unknown;
  place_prior_at: Timestamp | null;
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
  /** 028. The person dismissed a suggestion on this row, which is never
   *  given another. No words: the record is the timestamp. */
  suggest_dismissed_at: Generated<Timestamp | null>;
  archived_at: Timestamp | null;
  deleted_at: Timestamp | null;
  purge_after: Timestamp | null;
}

/** 030. What Google's terms let offload keep about a place: its id,
 *  indefinitely, and its coordinates and whether it is an area, for at most
 *  thirty days. Never its name, address or categories. A `page` place's
 *  coordinates are the page's and are kept. */
export interface PlacesTable {
  id: Generated<string>;
  provider: "google" | "page";
  /** Google's place id, or a page place's coordinates rounded to five places. */
  provider_place_id: string;
  lat: number | null;
  lng: number | null;
  approximate: boolean | null;
  /** When the coordinates were fetched; null with them. */
  coords_at: Timestamp | null;
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

/** 035. A calendar grant still to be revoked after its account is gone. Names
 *  no account on purpose. */
export interface PendingRevocationsTable {
  id: Generated<string>;
  provider: "google";
  sealed_token: Buffer;
  attempts: Generated<number>;
  created_at: Generated<Timestamp>;
}

/** 035. One copy of everything an account can read, for seven days. */
export interface ExportsTable {
  id: Generated<string>;
  account_id: string;
  state: Generated<"making" | "ready" | "failed" | "gone">;
  /** The clock for both seven days. Null once a build failed. */
  requested_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  ready_at: Timestamp | null;
  expires_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  /** How many parts are in the store, counted up as each one lands. */
  parts: Generated<number>;
  byte_size: Generated<string | number>;
  /** This copy's key, wrapped under the account's. */
  wrapped_key: Buffer;
  thread_ids: Generated<string[]>;
}

export interface LlmUsageTable {
  id: Generated<string>;
  /** Null once the account is gone (0076), so a month's total never changes
   *  when somebody leaves. Read as nullable, never written as one. */
  account_id: ColumnType<string | null, string, string>;
  /** Draws from the same open set as jobs.kind and must match it, or the Costs
   *  page groups spend under a name no job has. */
  job_kind: string;
  category: "interactive" | "scheduled";
  model: string;
  input_tokens: Generated<number>;
  output_tokens: Generated<number>;
  cache_read_tokens: Generated<number>;
  /** 0067. Priced apart from input, which excludes it. */
  cache_write_tokens: Generated<number>;
  /** Priced by core-api from the tokens (src/pricing.ts), never by the caller. */
  cost_micros: Generated<number>;
  latency_ms: Generated<number>;
  /** 0076. The job the call was made for, where there was one. No foreign
   *  key: the ledger outlives the job table's 30 days. */
  job_id: ColumnType<string | null, string | null | undefined, never>;
  created_at: Timestamp;
}

/** A sentence about a thread: what is true about it, and sometimes how it is
 *  handled.
 *
 *  "Write todo names in three words" is a note; so is "we are staying in
 *  Istanbul the 10th to the 12th". "Chase the electrician" is a task. **008's
 *  test, whether it would appear in a widget, stopped working when a note
 *  gained dates**, which is what 014 merged the two concepts to allow.
 *  A hundred per thread reach a prompt, so what reaches one is bounded by a
 *  constant rather than by how long
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

/** 038. The classes of what offload knows about a person. */
export type MemoryClass = "people" | "things" | "about" | "rules" | "patterns";

/** 038. The messages a forgotten memory came from: ids only, so the same words
 *  cannot teach it again. */
/** 040. Where each kind's cloud sits, normalised, laid out nightly. */
export interface MemoryKindPlacesTable {
  account_id: string;
  kind: string;
  x: number;
  y: number;
  placed_at: Generated<Timestamp>;
}

export interface MemoryForgottenTable {
  account_id: string;
  message_id: string;
  created_at: Generated<Timestamp>;
}

export interface NotesTable {
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
  /** A thread note's five, or since 038 a memory's class (scope 'account'). */
  kind: "going_on" | "person" | "preference" | "noticed" | "standing" | MemoryClass;
  text: string;
  /** Corrections beat inference: offload may never overwrite a `stated` one. */
  /** 038: `answered` is a memory's only, written from an answer to a question. */
  origin: "stated" | "learned" | "answered";
  /** 038. An answered memory's calendar, by id, never its name. */
  calendar_id: ColumnType<string | null, string | null | undefined, string | null>;
  /** 040. A memory's own embedding (halfvec(1024)) and its place on the map.
   *  Null on every thread note; the check holds it. */
  embedding: ColumnType<string | null, string | null | undefined, string | null>;
  embedding_model: string | null;
  embedded_at: Timestamp | null;
  place_dx: number | null;
  place_dy: number | null;
  placed_at: Timestamp | null;
  derived_from_untrusted: Generated<boolean>;
  /** Any member, thread-wide, reversible. Content has `archived_at` for the
   *  same job: let everyone quiet something without letting anyone destroy
   *  what somebody else wrote. A muted note does not reach the model. */
  muted_at: Timestamp | null;
  derived_from_message_id: string | null;
  /** The model's tool_use block id. Idempotent within a turn, and deliberately
   *  not across a resume. Same column and same reasoning as `content`. */
  tool_call_id: string | null;
  /** What somebody dumped when it did not fit in `text`, kept whole.
   *
   *  **It never reaches a prompt.** `text` is the 200 characters the model
   *  reads; this is the rest of the words, and the pair is why a paragraph can
   *  be dumped into a thread without being truncated or refused. */
  body: string | null;
  /** When it happens. A note with one is on the timeline; most have none. */
  occurs_at: Timestamp | null;
  occurs_end_at: Timestamp | null;
  due_at: Timestamp | null;
  /** Null forever is a normal state, the same as it is for content. */
  place_id: string | null;
  /** Where it sits in the section, 0 to 100 and higher first, on the same scale
   *  content uses so one drag helper serves both lists. Default 50, so a
   *  note can be moved either way before the list is re-spread.
   *
   *  **Not precedence.** Which of two disagreeing notes is true turns on
   *  `updated_at`, and moving a note leaves that alone. */
  priority: Generated<number>;
  /** 023. The rule, as `content.rrule`, anchored on `occurs_at`. */
  rrule: string | null;
  attrs: Generated<unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
  /** Set aside by the daily job: out of the prompt, out of the section, still
   *  on the thread. Filtered by every current-note query, because forgetting
   *  is silent. */
  /** 028. As `content.suggest_dismissed_at`. */
  suggest_dismissed_at: Generated<Timestamp | null>;
  superseded_at: Timestamp | null;
  deleted_at: Timestamp | null;
  purge_after: Timestamp | null;
}

/** One Google account somebody connected. 012. */
export interface ConnectorConnectionsTable {
  id: Generated<string>;
  account_id: string;
  provider: Generated<"google">;
  external_account_email: string;
  /** `needs_reauth` is a state, not an error: a token the person revoked in
   *  Google is their decision, so the sync stops and Settings offers Reconnect
   *  rather than retrying into a wall. */
  state: Generated<"active" | "needs_reauth" | "revoked">;
  connected_at: Timestamp;
  last_sync_at: Timestamp | null;
  last_error_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

/** Credentials to somebody else's system, sealed under their own key.
 *
 *  Never Better Auth's `account`, whose hooks blank every provider token
 *  unconditionally. See `connectors/vault.ts` for why that matters. */
export interface ConnectorSecretsTable {
  connection_id: string;
  access_token: Buffer;
  refresh_token: Buffer | null;
  access_expires_at: Timestamp | null;
  scope: string | null;
  /** Which key sealed it, so a rotation knows what it has already moved. */
  wrapped_by: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** One calendar on a connected account. */
export interface ConnectorCalendarsTable {
  id: Generated<string>;
  connection_id: string;
  external_id: string;
  summary: string;
  timezone: string | null;
  access_role: "owner" | "writer" | "reader" | "freeBusyReader";
  /** Everyone Google lets see this calendar, the person included, counted from
   *  the access list under `calendar.acls.readonly`. **A count and nothing
   *  else.** Null when the person does not own the calendar, since only an
   *  owner may list the rules, or when the grant lacks the scope; every reader
   *  treats null as more than one, which is the safe direction. */
  participants: number | null;
  participants_read_at: Timestamp | null;
  /** Google's own colour for the calendar, a hex string, as recognition and
   *  never as the differentiator: four of seven ordinary ones fail 3:1. */
  colour: string | null;
  is_primary: Generated<boolean>;
  /** Approved: offload may read it at all. Adds it to no thread; threads pick
   *  from the approved list, starting from none. */
  selected: Generated<boolean>;
  sync_token: string | null;
  synced_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** 019. One copy of each event per calendar, on the connection, outside every
 *  thread, held for the window and no longer. Threads read it through their
 *  picks; Today reads all of it. Same minimisation 012 wrote: no description,
 *  no conferencing, no attachments, and no guest's address at all (027: a
 *  change to an event with guests asks Google who they are at the time). */
export interface ConnectorEventsTable {
  id: Generated<string>;
  /** Denormalised from the connection, for Today's read. Written once. */
  account_id: string;
  calendar_id: string;
  /** `<calendar external id>:<event id>`. */
  source_ref: string;
  title: string;
  occurs_at: Timestamp | null;
  occurs_end_at: Timestamp | null;
  all_day: Generated<boolean>;
  timezone: string | null;
  location: string | null;
  series_ref: string | null;
  organizer_is_me: Generated<boolean>;
  /** Text somebody else wrote. Defaults true so a path that forgets errs safe. */
  untrusted: Generated<boolean>;
  /** Always empty (027). Nothing is kept about an event's guests: nothing read
   *  it, and a change to an event with guests asks Google who they are at that
   *  moment. Unwritable here so nothing starts keeping them again by accident. */
  attendees: ColumnType<unknown, never, never>;
  /** 027. Google's own link to the event, https on a Google host or null. */
  link: string | null;
  /** 027. This account created it, or is on its guest list and has not
   *  declined. Null until a sync has read it. */
  created_by_me: boolean | null;
  invited_me: boolean | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  /** 030. Where it is, once its location was looked up. */
  place_id: Generated<string | null>;
  /** 030. A keyed fingerprint of the location last looked up, never the text. */
  located_key: Generated<string | null>;
  deleted_at: Timestamp | null;
}

/** 019. The calendars a thread reads through, one row per member per calendar.
 *  A thread starts with none, and a pick reads for the whole thread while a
 *  write reaches a calendar only through the acting account's own picks. */
export interface ThreadCalendarsTable {
  thread_id: string;
  calendar_id: string;
  /** The member who picked, so leaving removes exactly theirs. */
  account_id: string;
  created_at: Timestamp;
}

/** An outward-facing write the model proposed and nobody has agreed to yet.
 *  Nothing in here has reached Google. */
export interface ConnectorPendingWritesTable {
  id: Generated<string>;
  account_id: string;
  calendar_id: string;
  action: "create" | "edit" | "delete";
  scope: "one" | "following" | null;
  payload: unknown;
  source_ref: string | null;
  /** The message whose tool call proposed this, so the reply can carry the
   *  control that answers it. Without it a proposal is unreachable from any
   *  screen and expires having done nothing. */
  message_id: string | null;
  /** 019. The row a confirmed create marks as on the calendar. */
  content_id: string | null;
  expires_at: Timestamp;
  created_at: Timestamp;
  confirmed_at: Timestamp | null;
  declined_at: Timestamp | null;
}

/** A chunk of something, and its vector, from 0027.
 *
 *  Chunks live apart from the rows they came from so a model or provider change
 *  is a re-embed and not a data loss, which decisions.md settled. `embedded_at`
 *  null is the backlog, and a backlog is a normal state: the row is still found
 *  by text and is missed only by meaning. */
export interface ContentChunksTable {
  id: Generated<string>;
  content_id: string;
  /** Denormalised. pgvector filters AFTER the index scan, so this is read on
   *  the hot path of every search and a join back to content there is what
   *  makes an iterative scan slow. */
  thread_id: string;
  ord: number;
  text: string;
  embedding: string | null;
  model: string | null;
  embedded_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface NoteChunksTable {
  id: Generated<string>;
  note_id: string;
  subject_id: string | null;
  ord: number;
  text: string;
  embedding: string | null;
  model: string | null;
  embedded_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface MessageChunksTable {
  id: Generated<string>;
  message_id: string;
  account_id: string;
  /** Carried so a result can say who said it. Half of a conversation is
   *  offload's own output, and a past reply that was wrong is otherwise
   *  indistinguishable from something a person stated. */
  role: "person" | "offload";
  ord: number;
  text: string;
  embedding: string | null;
  model: string | null;
  embedded_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

/** Which rows an answer showed. Ids only: the reply resolves them at read time,
 *  so a row ticked or deleted elsewhere is never stale in an old reply. */
/** 018. A question offload asked back, stored with the turn. Templates and
 *  values only: nothing in a row was written by a person or by a page. */
export interface QuestionsTable {
  id: Generated<string>;
  account_id: string;
  conversation_id: string;
  /** The person's message the turn was about; the control hangs off it. */
  message_id: string;
  turn_id: string;
  ordinal: number;
  field: "date" | "span" | "time" | "country" | "calendar" | "thread" | "person";
  target_content_id: string | null;
  target_note_id: string | null;
  text: string;
  /** [{label, value}], the escape carrying a null value. */
  options: ColumnType<unknown, string, string>;
  state: Generated<"pending" | "open" | "answered" | "closed">;
  answered_option: number | null;
  answered_message_id: string | null;
  answer_turn_id: string | null;
  previous_value: ColumnType<unknown, string | null, string | null>;
  derived_from_untrusted: Generated<boolean>;
  created_at: Timestamp;
  settled_at: Timestamp | null;
}

/** 020. A photo as it arrived, encrypted in R2, and what it knows about
 *  itself. Belongs to its message, held unclaimed between upload and send,
 *  refcounted through `content_blobs`. 021 gave it a kind: a voice note is
 *  the same row with no dimensions, a duration and a waveform. */
export interface BlobsTable {
  id: Generated<string>;
  /** Who handed it over; null once they are gone. */
  account_id: string | null;
  /** Null while unclaimed, and again once the message has purged while a
   *  shared thread still carries the picture. */
  message_id: string | null;
  client_key: string;
  /** The dumper's, shown to them alone. Never on a title, in a log, in an
   *  event or sent to the model. */
  name: string | null;
  /** Sniffed from the bytes. */
  content_type: string;
  byte_size: number;
  /** 021, 041. Every reader of a message's blobs filters on it. */
  kind: Generated<"image" | "audio" | "pdf">;
  /** Null for a voice note and a PDF, set for a photo; the check constraint
   *  holds it. */
  width: number | null;
  height: number | null;
  /** 041. A PDF's page count, at most a thousand; null for anything else. */
  pages: number | null;
  /** 041. When a PDF's clean copy was sealed, the one form of it any route
   *  serves. */
  clean_at: Timestamp | null;
  /** 021. The device's count, then the provider's measurement. */
  duration_ms: number | null;
  measured_ms: number | null;
  /** 021. Thirty two values, 0 to 255, over the whole note. */
  waveform: number[] | null;
  /** 021. The transcript's id at the provider until the delete after the
   *  read lands. Never logged. */
  provider_ref: string | null;
  sha256: Buffer;
  encryption_scheme: Generated<string>;
  taken_at: Timestamp | null;
  /** Exact, from the file. Stored and never served; what leaves is rounded. */
  latitude: number | null;
  longitude: number | null;
  device: string | null;
  town: string | null;
  renditions_at: Timestamp | null;
  unreadable_at: Timestamp | null;
  created_at: Timestamp;
  deleted_at: Timestamp | null;
  purge_after: Timestamp | null;
}

/** The object key, wrapped once per place that may open it. */
export interface BlobKeysTable {
  blob_id: string;
  scope: "account" | "thread";
  scope_id: string;
  wrapped_object_key: Buffer;
  created_at: Timestamp;
}

/** Which rows carry which blob. The authorization path, with `messages`. */
export interface ContentBlobsTable {
  content_id: string;
  blob_id: string;
  created_at: Timestamp;
}

/** A rounded coordinate and its town. No account column, on purpose. */
export interface PlaceReverseTable {
  lat: string;
  lng: string;
  town: string | null;
  resolved_at: Timestamp;
}

export interface MessageContentTable {
  message_id: string;
  content_id: string;
  ord: number;
  /** The read behind this result hit its page.
   *
   *  A property of the read rather than of the row, so every row of one result
   *  carries the same value. It decides which of the two tails an answer draws,
   *  and only one of them may ever be drawn. */
  truncated: Generated<boolean>;
}


/** 025. A named, coloured group inside one thread. The thread's, not its
 *  creator's: every accepted member reads and writes it. */
export interface LabelsTable {
  id: Generated<string>;
  thread_id: string;
  name: string;
  /** 1 to 10, reading `--label-N`. Never derived from the name. */
  colour: number;
  set_by: "person" | "offload";
  created_by: string | null;
  run_id: string | null;
  touched_by_person_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
  deleted_by_person: Generated<boolean>;
  deleted_by: string | null;
  purge_after: Timestamp | null;
}

/** 025. One row per (row, label), ever: a person's removal is a tombstone. */
export interface ContentLabelsTable {
  content_id: string;
  label_id: string;
  set_by: "person" | "offload";
  run_id: string | null;
  removed_at: Timestamp | null;
  removed_by: "person" | "offload" | null;
  removed_run_id: string | null;
  created_at: Generated<Timestamp>;
}

export interface NoteLabelsTable {
  note_id: string;
  label_id: string;
  set_by: "person" | "offload";
  run_id: string | null;
  removed_at: Timestamp | null;
  removed_by: "person" | "offload" | null;
  removed_run_id: string | null;
  created_at: Generated<Timestamp>;
}

/** 025. One sort: a nightly pass over a thread, or a turn that labelled. */
export interface LabelRunsTable {
  id: Generated<string>;
  thread_id: string;
  kind: "nightly" | "live";
  set_by: "person" | "offload";
  turn_id: string | null;
  undone_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

/** 027. A card put off until `until`, or for good when it is null. */
export interface TodayPutOffsTable {
  account_id: string;
  card: string;
  until: Timestamp | null;
  created_at: Generated<Timestamp>;
}

/** 028. offload's proposal of a new thread for two to ten loose things.
 *  Plain text, as `threads.name` is (OFF-2). Spent, not deleted, so Undo
 *  restores the same row. */
export interface ThreadProposalsTable {
  id: Generated<string>;
  account_id: string;
  name: string;
  created_at: Generated<Timestamp>;
  spent_at: Timestamp | null;
  spent_thread_id: string | null;
}

/** 028. At most one per loose thing: move to `thread_id`, or the proposal's
 *  new thread. Drawn only while the thing is loose and not accepted. */
export interface SuggestionsTable {
  id: Generated<string>;
  account_id: string;
  content_id: string | null;
  note_id: string | null;
  kind: "move" | "create";
  thread_id: string | null;
  proposal_id: string | null;
  accepted_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface Database {
  thread_proposals: ThreadProposalsTable;
  suggestions: SuggestionsTable;
  today_put_offs: TodayPutOffsTable;
  connector_connections: ConnectorConnectionsTable;
  connector_secrets: ConnectorSecretsTable;
  connector_calendars: ConnectorCalendarsTable;
  memory_forgotten: MemoryForgottenTable;
  memory_kind_places: MemoryKindPlacesTable;
  connector_events: ConnectorEventsTable;
  thread_calendars: ThreadCalendarsTable;
  connector_pending_writes: ConnectorPendingWritesTable;
  accounts: AccountsTable;
  account_identities: AccountIdentitiesTable;
  sessions: SessionsTable;
  verifications: VerificationsTable;
  staff: StaffTable;
  app_settings: AppSettingsTable;
  account_limits: AccountLimitsTable;
  staff_audit: StaffAuditTable;
  heartbeats: HeartbeatsTable;
  job_stats_hourly: JobStatsHourlyTable;
  backup_runs: BackupRunsTable;
  alert_states: AlertStatesTable;
  alert_sends: AlertSendsTable;
  limit_hits: LimitHitsTable;
  vendor_costs: VendorCostsTable;
  threads: ThreadsTable;
  thread_members: ThreadMembersTable;
  account_keys: AccountKeysTable;
  thread_keys: ThreadKeysTable;
  conversations: ConversationsTable;
  messages: MessagesTable;
  content: ContentTable;
  message_threads: MessageThreadsTable;
  notes: NotesTable;
  places: PlacesTable;
  place_lookups: PlaceLookupsTable;
  llm_usage: LlmUsageTable;
  pending_revocations: PendingRevocationsTable;
  jobs: JobsTable;
  turn_sources: TurnSourcesTable;
  lookups: LookupsTable;
  domain_reads: DomainReadsTable;
  analytics_events: AnalyticsEventsTable;
  push_tokens: PushTokensTable;
  activity: ActivityTable;
  exports: ExportsTable;
  activity_mentions: ActivityMentionsTable;
  activity_memories: ActivityMemoriesTable;
  reminder_labels: ReminderLabelsTable;
  labels: LabelsTable;
  content_labels: ContentLabelsTable;
  note_labels: NoteLabelsTable;
  label_runs: LabelRunsTable;
  mail_signatures: MailSignaturesTable;
  waitlist_attempts: WaitlistAttemptsTable;
  review_codes: ReviewCodesTable;
  review_code_attempts: ReviewCodeAttemptsTable;
  schema_migrations: SchemaMigrationsTable;

  /** 013's views, from migration 0026. One authorization rule each, in SQL,
   *  because the agent plane reads the same rows through SQLAlchemy and a
   *  predicate written in TypeScript is one it does not have.
   *
   *  They carry authorization only. Deleted, superseded, muted and archived
   *  stay with the caller, because several callers deliberately want the other
   *  answer. Filter `viewer_account_id` and then whatever lifecycle the read
   *  actually means. */
  content_chunks: ContentChunksTable;
  note_chunks: NoteChunksTable;
  message_chunks: MessageChunksTable;
  message_content: MessageContentTable;
  questions: QuestionsTable;
  blobs: BlobsTable;
  blob_keys: BlobKeysTable;
  content_blobs: ContentBlobsTable;
  place_reverse: PlaceReverseTable;

  readable_content: ContentTable & { viewer_account_id: string };
  readable_notes: NotesTable & { viewer_account_id: string };
  readable_messages: MessagesTable & { viewer_account_id: string };

  connections: ConnectionsTable;
  connection_requests: ConnectionRequestsTable;
  blocks: BlocksTable;
  pending_shares: PendingSharesTable;
  people_lookups: PeopleLookupsTable;
  visible_people: VisiblePeopleView;
}
