// 034 AC-4 and AC-5. One account with a mark in every column the admin panel
// may never return, and a token in every credential column.
//
// The table in the impl-spec ("Columns the panel may never return") is the
// rule; this is that table as rows. A test seeds it, calls whatever it is
// testing, and asks `leaks()` what came back. A column added to that table is
// added here, and nowhere else.

import { sql } from "kysely";
import { db } from "../src/db.js";
import { uuidv7 } from "../src/uuid.js";
import { activeAccount } from "./admin-kit.js";

/** In every text column that holds something a person wrote, or that offload
 *  wrote about them. */
export const MARK = "zzmark-content-zz";

/** In every credential column. */
export const TOKEN = "qqtoken-secret-qq";

/** Where a column cannot hold a string: a coordinate, a moment, an id. */
const LATITUDE = 38.7113917;
const LONGITUDE = -9.1301733;
const TAKEN_AT = "1987-06-05T04:03:02.000Z";

/** A push token has one shape the table allows, so its mark is inside it. */
const PUSH_TOKEN = "ExponentPushToken[qqtoken_push_qq]";

export interface Marked {
  accountId: string;
  /** The pseudonymous subject id, which ties product events to the account
   *  and so never leaves through the panel either. */
  subjectId: string;
  threadId: string;
  jobId: string;
  /** Ids a route's `:param` may name. */
  params: Record<string, string>;
}

/** Every spelling a mark could leave in: as it is, and the ways bytes are
 *  usually written out. */
function spellings(marked: Marked): Array<[string, string]> {
  const token = Buffer.from(TOKEN);
  return [
    ["the content mark", MARK],
    ["the credential mark", TOKEN],
    ["the push token", "qqtoken_push_qq"],
    ["the credential mark in hex", token.toString("hex")],
    ["the credential mark in base64", token.toString("base64").replace(/=+$/, "")],
    ["a photo's latitude", String(LATITUDE).slice(0, 7)],
    ["a photo's longitude", String(LONGITUDE).slice(0, 7)],
    ["when a photo was taken", TAKEN_AT.slice(0, 10)],
    ["the analytics subject id", marked.subjectId],
  ];
}

/** What of the seeded marks appears in `output`. Empty is the only pass. */
export function leaks(output: string, marked: Marked): string[] {
  return spellings(marked)
    .filter(([, needle]) => output.includes(needle))
    .map(([name]) => name);
}

export async function seedMarked(): Promise<Marked> {
  const accountId = await activeAccount(`${uuidv7()}@example.test`);
  const account = await db
    .updateTable("accounts")
    .set({
      display_name: "Jo Alves",
      provider_name: MARK,
      today_layout: JSON.stringify({ mark: MARK }),
      avatar_png: Buffer.from(MARK),
    })
    .where("id", "=", accountId)
    .returning(["default_thread_id", "analytics_subject_id"])
    .executeTakeFirstOrThrow();
  const threadId = account.default_thread_id!;
  const token = Buffer.from(TOKEN);
  const one = async (query: ReturnType<typeof sql<{ id: string }>>): Promise<string> => (await query.execute(db)).rows[0]!.id;

  // Threads, labels, proposals: a name is content.
  await sql`update threads set name = ${MARK}, attrs = ${JSON.stringify({ mark: MARK })}::jsonb where id = ${threadId}`.execute(db);
  const labelId = await one(sql`
    insert into labels (thread_id, name, colour, set_by, created_by) values (${threadId}, ${MARK}, 1, 'person', ${accountId}) returning id`);
  const proposalId = await one(sql`insert into thread_proposals (account_id, name) values (${accountId}, ${MARK}) returning id`);

  // A conversation, a message with a transcript, a question.
  const conversationId = await one(sql`insert into conversations (account_id, title) values (${accountId}, ${MARK}) returning id`);
  const turnId = uuidv7();
  const messageId = await one(sql`
    insert into messages (conversation_id, account_id, role, type, turn_id, text, state, transcript, source_ref, attrs, step)
    values (${conversationId}, ${accountId}, 'person', 'text', ${turnId}, ${MARK}, 'seen', ${MARK}, ${MARK},
            ${JSON.stringify({ mark: MARK })}::jsonb, ${MARK}) returning id`);
  await sql`
    insert into message_chunks (message_id, account_id, role, ord, text) values (${messageId}, ${accountId}, 'person', 0, ${MARK})`.execute(db);

  // Content and a note, each with its chunk.
  const contentId = await one(sql`
    insert into content (account_id, thread_id, derived_from_message_id, type, title, body, url, image_url, location, source_ref, attrs)
    values (${accountId}, ${threadId}, ${messageId}, 'link', ${MARK}, ${MARK}, ${`https://example.test/${MARK}`},
            ${`https://example.test/${MARK}.jpg`}, ${MARK}, ${MARK}, ${JSON.stringify({ mark: MARK })}::jsonb) returning id`);
  await sql`insert into content_chunks (content_id, thread_id, ord, text) values (${contentId}, ${threadId}, 0, ${MARK})`.execute(db);
  const noteId = await one(sql`
    insert into notes (account_id, scope, subject_id, kind, text, origin, body, attrs)
    values (${accountId}, 'thread', ${threadId}, 'going_on', ${MARK}, 'stated', ${MARK}, ${JSON.stringify({ mark: MARK })}::jsonb) returning id`);
  await sql`insert into note_chunks (note_id, subject_id, ord, text) values (${noteId}, ${threadId}, 0, ${MARK})`.execute(db);
  await sql`
    insert into questions (account_id, conversation_id, message_id, turn_id, ordinal, field, target_content_id, text, options, previous_value)
    values (${accountId}, ${conversationId}, ${messageId}, ${turnId}, 1, 'date', ${contentId}, ${MARK},
            ${JSON.stringify([{ label: MARK, value: MARK }])}::jsonb, ${JSON.stringify(MARK)}::jsonb)`.execute(db);
  await sql`insert into suggestions (account_id, content_id, kind, proposal_id) values (${accountId}, ${contentId}, 'create', ${proposalId})`.execute(db);

  // Activity, and who it mentions.
  const activityId = await one(sql`
    insert into activity (account_id, kind, sent, title, body, thread_id, content_id)
    values (${accountId}, 'shared_activity', true, ${MARK}, ${MARK}, ${threadId}, ${contentId}) returning id`);
  await sql`insert into activity_mentions (activity_id, thread_id, about_account_id) values (${activityId}, ${threadId}, ${accountId})`.execute(db);

  // A file: its name, where and when it was taken, on what.
  const blobId = await one(sql`
    insert into blobs (account_id, message_id, client_key, name, content_type, byte_size, width, height, sha256, taken_at, latitude, longitude, device, town, provider_ref)
    values (${accountId}, ${messageId}, ${uuidv7()}, ${MARK}, 'image/jpeg', 4096, 10, 10, ${Buffer.alloc(32)}, ${TAKEN_AT}, ${LATITUDE}, ${LONGITUDE}, ${MARK}, ${MARK}, ${TOKEN}) returning id`);
  await sql`insert into blob_keys (blob_id, scope, scope_id, wrapped_object_key) values (${blobId}, 'account', ${accountId}, ${token})`.execute(db);

  // What a turn read, and the domains read by anybody.
  await sql`insert into turn_sources (account_id, turn_id, domain, url) values (${accountId}, ${turnId}, ${`${MARK}.test`}, ${`https://${MARK}.test/page`})`.execute(db);
  await sql`insert into domain_reads (domain, day, count) values (${`${MARK}.test`}, current_date, 50) on conflict do nothing`.execute(db);

  // A connected calendar: its address, its name, an event, a write waiting.
  const connectionId = await one(sql`
    insert into connector_connections (account_id, provider, external_account_email) values (${accountId}, 'google', ${`${MARK}@example.test`}) returning id`);
  await sql`
    insert into connector_secrets (connection_id, access_token, refresh_token, scope, wrapped_by)
    values (${connectionId}, ${token}, ${token}, ${TOKEN}, 'root')`.execute(db);
  const calendarId = await one(sql`
    insert into connector_calendars (connection_id, external_id, summary, access_role, sync_token)
    values (${connectionId}, ${MARK}, ${MARK}, 'owner', ${TOKEN}) returning id`);
  await sql`
    insert into connector_events (account_id, calendar_id, source_ref, title, occurs_at, location, attendees, link)
    values (${accountId}, ${calendarId}, ${MARK}, ${MARK}, now(), ${MARK}, ${JSON.stringify([{ email: `${MARK}@example.test` }])}::jsonb, ${`https://calendar.google.com/calendar/event?eid=${MARK}`})`.execute(db);
  await sql`
    insert into connector_pending_writes (account_id, calendar_id, action, payload, source_ref, expires_at)
    values (${accountId}, ${calendarId}, 'create', ${JSON.stringify({ title: MARK })}::jsonb, ${MARK}, now() + interval '1 day')`.execute(db);

  // Every credential: a provider's tokens, a session, a device, the keys.
  await sql`
    insert into account_identities (account_id, provider, subject, email, access_token, refresh_token, id_token, scope, password)
    values (${accountId}, 'google', ${TOKEN}, ${`${TOKEN}@example.test`}, ${TOKEN}, ${TOKEN}, ${TOKEN}, ${TOKEN}, ${TOKEN})`.execute(db);
  await sql`
    insert into sessions (account_id, token, expires_at, ip_address, user_agent)
    values (${accountId}, ${TOKEN}, now() + interval '1 day', ${TOKEN}, ${TOKEN})`.execute(db);
  await sql`insert into push_tokens (account_id, session_id, token, platform) select ${accountId}, id, ${PUSH_TOKEN}, 'ios' from sessions where token = ${TOKEN}`.execute(db);
  await sql`update account_keys set wrapped_dek = ${token} where account_id = ${accountId}`.execute(db);
  await sql`update thread_keys set wrapped_tk = ${token} where account_id = ${accountId}`.execute(db);

  // A job that died with something to say, and the ledger beside it. The
  // code is from the closed set and may be shown; the text may not.
  const jobId = await one(sql`
    insert into jobs (kind, account_id, payload, state, run_after, attempts, max_attempts, last_error, error_code, idempotency_key)
    values ('dump.answer', ${accountId}, ${JSON.stringify({ messageId, mark: MARK })}::jsonb, 'dead', now(), 2, 2, ${MARK}, 'model_error', ${MARK}) returning id`);
  await sql`
    insert into llm_usage (account_id, job_kind, category, model, input_tokens, output_tokens, cost_micros, latency_ms, job_id)
    values (${accountId}, 'dump.answer', 'interactive', 'claude-sonnet-5', 1200, 80, 4200, 900, ${jobId})`.execute(db);
  await sql`insert into lookups (account_id, label, kind, outcome, cost_micros) values (${accountId}, 'search', 'search', 'used', 10000)`.execute(db);
  await sql`insert into lookups (account_id, label, kind, outcome, cost_micros) values (${accountId}, 'read', 'read', 'failed', 0)`.execute(db);
  await sql`
    insert into llm_usage (account_id, job_kind, category, model, input_tokens, output_tokens, cost_micros, latency_ms)
    values (${accountId}, 'dump.answer', 'interactive', 'assemblyai', 0, 0, 900, 400)`.execute(db);

  // A job that finished, and still carries what an earlier attempt left: a
  // code, and the free text beside it. Scheduled reads the newest of its
  // kind, so it is the kind the walk asks about.
  await sql`
    insert into jobs (kind, account_id, payload, state, run_after, attempts, max_attempts, last_error, error_code)
    values ('thread.nightly', ${accountId}, ${JSON.stringify({ threadId, mark: MARK })}::jsonb, 'done', now(), 2, 3, ${MARK}, 'model_error')`.execute(db);

  // What Health reads about the system, so each of its routes answers with
  // rows: every service up, out for ten minutes, and back; the worker still
  // out; a backup; and hours of history in every outcome, for the queue and
  // for each vendor that is counted from it.
  await sql`
    insert into heartbeats (service, minute, ok, commit, started_at)
    select service, date_trunc('minute', now()) - make_interval(mins => ago), service <> 'worker' or ago > 15, 'abc1234', now() - interval '2 hours'
      from unnest(array['core-api', 'worker', 'web', 'database']) as service, unnest(array[40, 39, 38, 27, 26, 2, 1, 0]) as ago`.execute(db);
  await sql`insert into backup_runs (finished_at, bytes, ok) values (now() - interval '3 hours', 4096, true)`.execute(db);
  await sql`
    insert into job_stats_hourly (hour, kind, outcome, count, wait_ms_sum, wait_ms_p95, run_ms_sum, run_ms_p95)
    select date_trunc('hour', now()) - make_interval(hours => ago), kind, outcome, 3, 600, 400, 9000, 5000
      from unnest(array['dump.answer', 'thread.nightly', 'embed.content', 'location.resolve', 'calendar.sync', 'email.alert', 'account.digest', 'blob.purge']) as kind,
           unnest(array['done', 'failed', 'dead']) as outcome,
           unnest(array[1, 2, 30]) as ago`.execute(db);
  await sql`insert into limit_hits (account_id, cap, scope, day) values (${accountId}, 'cap.turns', 'account', current_date)`.execute(db);

  // Product events are pseudonymous on purpose, and no admin route reads them.
  await sql`
    insert into analytics_events (name, occurred_at, subject_id, source, properties)
    values ('dump_answered', now(), ${account.analytics_subject_id}, 'server', ${JSON.stringify({ mark: MARK })}::jsonb)`.execute(db);

  return {
    accountId,
    subjectId: account.analytics_subject_id,
    threadId,
    jobId,
    params: { id: accountId, accountId, jobId, threadId, labelId, kind: "thread.nightly" },
  };
}

/** Everything `seedMarked` wrote that `wipeAdmin` does not already remove. */
export async function wipeMarked(): Promise<void> {
  for (const table of ["limit_hits", "turn_sources", "domain_reads", "push_tokens", "activity", "questions", "suggestions", "thread_proposals", "blobs", "content", "notes", "messages", "conversations", "connector_connections"] as const) {
    await sql`delete from ${sql.table(table)}`.execute(db);
  }
}
