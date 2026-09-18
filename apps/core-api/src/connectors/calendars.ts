// The calendar list, and who can see each calendar.
//
// Read at connect and on every full pass, from one function, so a calendar
// created at Google after connecting appears, one deleted there goes with its
// copy and its picks, and the participant count is never older than a day on
// the calendars the person owns. 012 read the list once and never again.

import { db } from "../db.js";
import { countParticipants, grantsAcl, listCalendars, type GoogleCalendar } from "./google.js";

/** What a calendar is called wherever a person reads it: the row, the sheet,
 *  the chip. Google names a primary calendar by the address, and an address is
 *  not a name anybody chose, so the person's own name stands in for it. */
export function calendarName(calendar: { summary: string; is_primary: boolean }, displayName: string | null): string {
  if (!calendar.is_primary) return calendar.summary;
  return displayName?.trim() || "Your calendar";
}

export interface RefreshOutcome {
  calendars: number;
  counted: number;
}

/** Bring the connection's calendars up to Google's list.
 *
 *  Inserted unapproved: approving is the person's, in Settings, and connecting
 *  is not consenting to all of them. A calendar Google no longer returns is
 *  deleted, and its events and picks go with it by the foreign keys. The
 *  participant count is read for every owned calendar when the grant allows
 *  it; otherwise it is left null, which every reader treats as more than one. */
export async function refreshCalendars(connectionId: string, accessToken: string): Promise<RefreshOutcome> {
  const listed = await listCalendars(accessToken);
  const secret = await db
    .selectFrom("connector_secrets")
    .select("scope")
    .where("connection_id", "=", connectionId)
    .executeTakeFirst();
  const canCount = grantsAcl(secret?.scope ?? null);

  await db.transaction().execute(async (tx) => {
    for (const calendar of listed) {
      await tx
        .insertInto("connector_calendars")
        .values({
          connection_id: connectionId,
          external_id: calendar.externalId,
          summary: calendar.summary,
          timezone: calendar.timezone,
          access_role: calendar.accessRole,
          is_primary: calendar.primary,
          colour: calendar.colour,
          selected: false,
        })
        .onConflict((oc) =>
          oc.columns(["connection_id", "external_id"]).doUpdateSet((eb) => ({
            summary: eb.ref("excluded.summary"),
            timezone: eb.ref("excluded.timezone"),
            access_role: eb.ref("excluded.access_role"),
            is_primary: eb.ref("excluded.is_primary"),
            colour: eb.ref("excluded.colour"),
            // A count belongs to a calendar the person owns. One they stopped
            // owning reads as more than one until it is theirs again.
            ...(calendar.accessRole === "owner" ? {} : { participants: null, participants_read_at: null }),
            updated_at: new Date(),
          }))
        )
        .execute();
    }

    let gone = tx.deleteFrom("connector_calendars").where("connection_id", "=", connectionId);
    if (listed.length) {
      gone = gone.where(
        "external_id",
        "not in",
        listed.map((c) => c.externalId)
      );
    }
    await gone.execute();
  });

  let counted = 0;
  for (const calendar of listed) {
    if (!canCount || calendar.accessRole !== "owner") continue;
    const participants = await countFor(accessToken, calendar);
    if (participants === null) continue;
    await db
      .updateTable("connector_calendars")
      .set({ participants, participants_read_at: new Date(), updated_at: new Date() })
      .where("connection_id", "=", connectionId)
      .where("external_id", "=", calendar.externalId)
      .execute();
    counted += 1;
  }

  return { calendars: listed.length, counted };
}

/** The count, or null when the read did not go through. A 403 on a calendar
 *  the list said the person owns is logged with the status and the calendar's
 *  id, never its name, and the stored count stands until the next pass. */
async function countFor(accessToken: string, calendar: GoogleCalendar): Promise<number | null> {
  try {
    return await countParticipants(accessToken, calendar.externalId);
  } catch (error) {
    if (error instanceof Error && error.name === "GrantRevoked") throw error;
    logParticipantsFailed(calendar.externalId, error);
    return null;
  }
}

/** The one line a failed count leaves: which calendar by its id and the
 *  status, never the name and never the response body. */
export function logParticipantsFailed(calendarId: string, error: unknown): void {
  console.warn(
    JSON.stringify({
      at: "connectors.participants",
      outcome: "failed",
      calendar_id: calendarId,
      status: error instanceof Error ? error.message.replace(/\D/g, "") || "unknown" : "unknown",
    })
  );
}
