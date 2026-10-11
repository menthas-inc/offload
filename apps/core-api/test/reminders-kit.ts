// 042. The rows the reminder tests stand on: an account with a clock, a thread
// and its members, a dated row, a dated note, a memory, and a label.

import { db } from "../src/db.js";
import { uuidv7 } from "../src/uuid.js";

export async function wipe(): Promise<void> {
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("accounts").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("analytics_events").execute();
}

export async function account(over: Record<string, unknown> = {}): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state: "active",
      email_verified: true,
      analytics_subject_id: uuidv7(),
      display_name: "Ana",
      time_zone: "Europe/Lisbon",
      ...over,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function thread(members: string[], name = "Lisbon trip"): Promise<string> {
  const row = await db.insertInto("threads").values({ name } as never).returning("id").executeTakeFirstOrThrow();
  for (const member of members) {
    await db.insertInto("thread_members").values({ thread_id: row.id, account_id: member, state: "accepted" } as never).execute();
  }
  return row.id;
}

/** A row. `day` is all-day; `at` is an instant with a clock time. */
export async function row(
  accountId: string,
  threadId: string,
  title: string,
  when: { day?: string; at?: Date } = {},
  over: Record<string, unknown> = {},
): Promise<string> {
  const type = (over.type as string | undefined) ?? "task";
  const instant = when.at ?? (when.day ? new Date(`${when.day}T12:00:00Z`) : null);
  const column = type === "event" ? "occurs_at" : "due_at";
  const result = await db
    .insertInto("content")
    .values({
      account_id: accountId,
      thread_id: threadId,
      title,
      type,
      [column]: instant,
      attrs: when.day ? { all_day: true } : {},
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
      ...over,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return result.id;
}

export async function note(
  accountId: string,
  threadId: string,
  text: string,
  when: { day?: string; at?: Date; end?: string } = {},
  over: Record<string, unknown> = {},
): Promise<string> {
  const instant = when.at ?? (when.day ? new Date(`${when.day}T12:00:00Z`) : null);
  const result = await db
    .insertInto("notes")
    .values({
      account_id: accountId,
      scope: "thread",
      subject_id: threadId,
      kind: "going_on",
      text,
      origin: "stated",
      occurs_at: instant,
      occurs_end_at: when.end ? new Date(`${when.end}T12:00:00Z`) : null,
      attrs: when.day ? { all_day: true } : {},
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
      ...over,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return result.id;
}

export async function memory(accountId: string, text: string, kind = "people"): Promise<string> {
  const result = await db
    .insertInto("notes")
    .values({
      account_id: accountId,
      scope: "account",
      subject_id: accountId,
      kind,
      text,
      origin: "learned",
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return result.id;
}

export async function label(
  accountId: string,
  thing: { contentId?: string; noteId?: string },
  over: Record<string, unknown> = {},
): Promise<string> {
  const result = await db
    .insertInto("reminder_labels")
    .values({
      account_id: accountId,
      content_id: thing.contentId ?? null,
      note_id: thing.noteId ?? null,
      kind: "deadline",
      lead: "days",
      labelled_at: new Date("2026-01-01T00:00:00Z"),
      ...over,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return result.id;
}

export async function token(accountId: string, takesReminders = true): Promise<string> {
  const value = `ExponentPushToken[${uuidv7().replace(/-/g, "").slice(-16)}]`;
  const session = await db
    .insertInto("sessions")
    .values({ account_id: accountId, token: uuidv7(), expires_at: new Date(Date.now() + 60 * 60 * 1000) })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("push_tokens")
    .values({ account_id: accountId, session_id: session.id, token: value, platform: "ios", takes_reminders: takesReminders } as never)
    .execute();
  return value;
}

/** A message the thing came from, for the source and trust filters. */
export async function message(accountId: string, over: Record<string, unknown> = {}): Promise<string> {
  const conversation = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
  const result = await db
    .insertInto("messages")
    .values({ conversation_id: conversation.id, account_id: accountId, role: "person", type: "text", text: "a dump", turn_id: uuidv7(), ...over } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return result.id;
}

/** A signed session cookie for the account, as the routes read it. */
export async function signIn(accountId: string): Promise<string> {
  const { makeSignature } = await import("better-auth/crypto");
  const { env } = await import("../src/env.js");
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3600_000) }).execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}
