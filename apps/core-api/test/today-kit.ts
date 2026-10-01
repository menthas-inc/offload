// 027: the rows Today's tests are built from.

import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { db } from "../src/db.js";
import { env } from "../src/env.js";
import { uuidv7 } from "../src/uuid.js";

export const ZONE = "Europe/Lisbon";

export async function account(over: Record<string, unknown> = {}): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state: "active",
      email_verified: true,
      analytics_subject_id: uuidv7(),
      display_name: "Ana Duarte",
      time_zone: ZONE,
      ...over,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 60 * 60 * 1000) }).execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

export async function thread(members: string[], name: string): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: members[0], name, last_activity_at: sql`now()`, updated_at: sql`now()` } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  for (const member of members) {
    await db.insertInto("thread_members").values({ thread_id: row.id, account_id: member, state: "accepted" } as never).execute();
  }
  return row.id;
}

/** A to-do on a bare day, the way 023 stores one: noon UTC, `all_day`. */
export async function task(accountId: string, threadId: string, title: string, day: string | null, over: Record<string, unknown> = {}): Promise<string> {
  const row = await db
    .insertInto("content")
    .values({
      account_id: accountId,
      thread_id: threadId,
      title,
      type: "task",
      due_at: day ? new Date(`${day}T12:00:00Z`) : null,
      attrs: day ? { all_day: true } : {},
      ...over,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/** An event offload filed in a thread. */
export async function offloadEvent(accountId: string, threadId: string, title: string, at: string, over: Record<string, unknown> = {}): Promise<string> {
  const row = await db
    .insertInto("content")
    .values({ account_id: accountId, thread_id: threadId, title, type: "event", occurs_at: new Date(at), ...over } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function connection(accountId: string, over: Record<string, unknown> = {}): Promise<string> {
  const row = await db
    .insertInto("connector_connections")
    .values({ account_id: accountId, provider: "google", external_account_email: `${uuidv7()}@g.com`, ...over } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function calendar(connectionId: string, over: { selected?: boolean; summary?: string; primary?: boolean } = {}): Promise<{ id: string; external: string }> {
  const external = `cal-${uuidv7()}`;
  const row = await db
    .insertInto("connector_calendars")
    .values({
      connection_id: connectionId,
      external_id: external,
      summary: over.summary ?? "Work",
      access_role: "owner",
      selected: over.selected ?? true,
      is_primary: over.primary ?? false,
      participants: 1,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return { id: row.id, external };
}

export async function calendarEvent(
  accountId: string,
  cal: { id: string; external: string },
  title: string,
  at: string,
  over: { end?: string | null; allDay?: boolean; sourceRef?: string; link?: string | null; createdByMe?: boolean | null; invitedMe?: boolean | null } = {},
): Promise<string> {
  const row = await db
    .insertInto("connector_events")
    .values({
      account_id: accountId,
      calendar_id: cal.id,
      source_ref: over.sourceRef ?? `${cal.external}:${uuidv7()}`,
      title,
      occurs_at: new Date(at),
      occurs_end_at: over.end === null ? null : new Date(over.end ?? new Date(new Date(at).getTime() + 3600_000).toISOString()),
      all_day: over.allDay ?? false,
      untrusted: false,
      attendees: "[]",
      link: over.link === undefined ? null : over.link,
      created_by_me: over.createdByMe === undefined ? true : over.createdByMe,
      invited_me: over.invitedMe === undefined ? false : over.invitedMe,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/** A person's message in a conversation of their own. */
export async function message(accountId: string, source: "person" | "mail" = "person"): Promise<{ messageId: string; conversationId: string; turnId: string }> {
  const conversation = await db.insertInto("conversations").values({ account_id: accountId } as never).returning("id").executeTakeFirstOrThrow();
  const turnId = uuidv7();
  const row = await db
    .insertInto("messages")
    .values({ conversation_id: conversation.id, account_id: accountId, role: "person", type: "text", turn_id: turnId, text: "x", state: "seen", source } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return { messageId: row.id, conversationId: conversation.id, turnId };
}

/** An open question the way 018 stores one. */
export async function question(
  accountId: string,
  over: { field?: string; contentId?: string | null; untrusted?: boolean; source?: "person" | "mail"; state?: string; text?: string } = {},
): Promise<string> {
  const { messageId, conversationId, turnId } = await message(accountId, over.source ?? "person");
  const row = await db
    .insertInto("questions")
    .values({
      account_id: accountId,
      conversation_id: conversationId,
      message_id: messageId,
      turn_id: turnId,
      ordinal: 1,
      field: over.field ?? "date",
      target_content_id: over.contentId ?? null,
      text: over.text ?? "Sintra train: Saturday or Sunday?",
      options: JSON.stringify([{ label: "Saturday", value: "2026-10-04" }, { label: "Sunday", value: "2026-10-05" }, { label: "Not that", value: null }]),
      state: over.state ?? "open",
      derived_from_untrusted: over.untrusted ?? false,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function connectionRequest(from: string, to: string): Promise<string> {
  const row = await db
    .insertInto("connection_requests")
    .values({ from_account_id: from, to_account_id: to, delivered: true, expires_at: new Date(Date.now() + 30 * 86400_000) } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}
