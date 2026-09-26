// Emitting analytics events.
//
// Events go into the analytics_events outbox in Postgres, and a scheduled job
// ships them to R2 later. The outbox is deliberate: it is the same transport
// the product owner described minus a message bus, and at roughly six events a
// second at ten thousand accounts a bus earns nothing yet (decisions.md).
//
// Two rules this module enforces rather than trusts:
//   OFF-1  properties carries structured references only, never content.
//   AC-10  the subject is a pseudonym, never a real account id.

import { db } from "./db.js";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "./schema.js";

export type EventName =
  | "waitlist_joined"
  | "invite_sent"
  | "first_sign_in"
  | "onboarding_completed"
  | "dump_sent"
  | "dump_answered"
  | "dump_failed"
  // 012. Counts and outcomes only, and the schemas beside these names are what
  // enforces that: `assertNoContent` below is a heuristic that would let a
  // short event title straight through, since a title is neither an address nor
  // a URL nor sixty-four characters long.
  | "calendar_connected"
  | "calendar_sync_completed"
  | "calendar_event_written"
  // 019. A thread picked or un-picked a calendar: two ids and a boolean.
  | "calendar_picked"
  // 022. The actor's pseudonym and nothing about the other person: an event
  // that named both would be a record of who knows whom.
  | "connection_requested"
  | "connection_accepted"
  | "connection_removed"
  | "person_blocked"
  | "thread_shared"
  | "share_accepted"
  | "member_removed"
  // 024. Counts and enums: the send, the row count, the overdue count, the
  // reason, the kind, the error code. Never a token, a name or a title.
  | "digest_sent"
  | "digest_skipped"
  | "notification_sent"
  | "notification_failed";

type Source = "core-api" | "agent" | "worker" | "web" | "ios" | "android";

export interface EmitOptions {
  name: EventName;
  /** The per-account pseudonym from accounts.analytics_subject_id. */
  subjectId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  platform?: "web" | "ios" | "android" | null;
  /** Structured references only. See the guard below. */
  properties?: Record<string, string | number | boolean | null>;
  /** Emit inside the caller's transaction, so an event cannot survive a
   *  rolled-back write, or be lost by one that committed. */
  tx?: Transaction<Database> | Kysely<Database>;
}

// A value is allowed if it is an id, an enum, a count, a size, a duration, a
// boolean, a status or a timestamp. The cheap, checkable proxy for that: short
// scalars, and nothing that looks like an address or a URL. This is a backstop
// for the CI schema check, not a replacement for it.
const EMAIL = /@/;
const URLISH = /^[a-z][a-z0-9+.-]*:\/\//i;
const MAX_STRING = 64;

function assertNoContent(name: EventName, properties: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value !== "string") continue;
    if (EMAIL.test(value) || URLISH.test(value) || value.length > MAX_STRING) {
      throw new Error(
        `Event ${name} property "${key}" looks like content. Analytics carries ids, ` +
          `enums, counts and durations only (OFF-1).`
      );
    }
  }
}

/** The subject an event is attributed to: the account's pseudonym, never
 *  its id. One helper, so the next event cannot reach for the id in scope. */
export async function subjectOf(accountId: string, executor: Kysely<Database> | Transaction<Database> = db): Promise<string | null> {
  const row = await executor.selectFrom("accounts").select("analytics_subject_id").where("id", "=", accountId).executeTakeFirst();
  return row?.analytics_subject_id ?? null;
}

export async function emit(options: EmitOptions): Promise<void> {
  const properties = options.properties ?? {};
  assertNoContent(options.name, properties);

  const source: Source = "core-api";
  const executor = options.tx ?? db;

  await executor
    .insertInto("analytics_events")
    .values({
      name: options.name,
      version: 1,
      // Server-emitted, so the device clock and the server clock are the same
      // one here. Client-emitted events will carry their own occurred_at.
      occurred_at: new Date(),
      anonymous_id: options.anonymousId ?? null,
      subject_id: options.subjectId ?? null,
      session_id: options.sessionId ?? null,
      source,
      platform: options.platform ?? null,
      properties: JSON.stringify(properties),
    })
    .execute();
}
