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
  /** The member's own fold of To do's finished rows. Theirs, not the
   *  thread's, which is why it is here and not in `threads.attrs`. */
  hide_done: Generated<boolean>;
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
  source: Generated<"person" | "share" | "gmail" | "calendar" | "browser">;
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
  account_id: string;
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
  repeats: "day" | "weekday" | "week" | "two_weeks" | "month" | "year" | null;
  repeats_until: Timestamp | null;
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
  kind: "going_on" | "person" | "preference" | "noticed" | "standing";
  text: string;
  /** Corrections beat inference: offload may never overwrite a `stated` one. */
  origin: "stated" | "learned";
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
  /** That this note repeats, in the words `cadenceLabel` already says out loud.
   *
   *  **The rule rather than the occurrences.** A calendar sends occurrences and
   *  they become `content` rows sharing a `series_ref`; somebody who types
   *  "yoga every Tuesday" is stating a rule, and expanding it into rows would
   *  put the thirty identical lines back that `splitRepeating` exists to
   *  collapse. One row, and the calendar draws a dot on every matching day of
   *  whatever window is on screen. */
  repeats: "day" | "weekday" | "week" | "two_weeks" | "month" | "year" | null;
  /** When it stops. Null is "no end stated", which is what people mean. */
  repeats_until: Timestamp | null;
  attrs: Generated<unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
  /** Set aside by the daily job: out of the prompt, out of the section, still
   *  on the thread. Filtered by every current-note query, because forgetting
   *  is silent. */
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
 *  no conferencing, no attachments, and an address only on an event offload
 *  created with guests. */
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
  attendees: ColumnType<unknown, string, string>;
  created_at: Timestamp;
  updated_at: Timestamp;
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
  field: "date" | "span" | "time" | "tag" | "country" | "calendar" | "thread";
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
  /** 021. Every reader of a message's blobs filters on it. */
  kind: Generated<"image" | "audio">;
  /** Null for a voice note, set for a photo; the check constraint holds it. */
  width: number | null;
  height: number | null;
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


export interface Database {
  connector_connections: ConnectorConnectionsTable;
  connector_secrets: ConnectorSecretsTable;
  connector_calendars: ConnectorCalendarsTable;
  connector_events: ConnectorEventsTable;
  thread_calendars: ThreadCalendarsTable;
  connector_pending_writes: ConnectorPendingWritesTable;
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
  notes: NotesTable;
  places: PlacesTable;
  place_lookups: PlaceLookupsTable;
  llm_usage: LlmUsageTable;
  jobs: JobsTable;
  turn_sources: TurnSourcesTable;
  lookups: LookupsTable;
  domain_reads: DomainReadsTable;
  analytics_events: AnalyticsEventsTable;
  waitlist_attempts: WaitlistAttemptsTable;
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
}
