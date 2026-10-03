// The one pass over what existed before the map (030), and what a re-read of
// a link's page may write.
//
// Production holds one account, the owner's, so this is a one-off for a small
// set rather than a crawler. It runs once, at the first boot with the map on,
// and every row it touches is marked, so a re-run touches nothing it did.

import { sql } from "kysely";
import { db } from "../db.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import type { Executor } from "../threads/access.js";
import { attachPagePoint } from "./resolve.js";
import { mapsOn, setting } from "../settings.js";

/** Forget every remembered miss (each was written with no key set), look up
 *  every saved place with no point, and book each link to be read once more,
 *  for its author only, only with their switch on, and only when its address
 *  is in the words of the message it came from, so nothing the model chose is
 *  ever opened. */
export async function backfillMaps(): Promise<{ places: number; links: number }> {
  // 034. Both of the owner's switches: this pass looks places up and books
  // pages to be read.
  if (!(await mapsOn()) || !(await setting("switch.web_links"))) return { places: 0, links: 0 };

  await db.deleteFrom("place_lookups").where("place_id", "is", null).execute();

  const places = await db
    .selectFrom("content")
    .select("id")
    .where("type", "=", "location")
    .where("place_id", "is", null)
    .where("deleted_at", "is", null)
    .execute();
  for (const row of places) {
    await enqueue({
      kind: "location.resolve",
      payload: { contentId: row.id },
      priority: PRIORITY.background,
      idempotencyKey: `location.resolve:${row.id}:030`,
    });
  }

  const links = await readableLinks(db).execute();
  for (const row of links) {
    await enqueue({
      kind: "link.place",
      payload: { contentId: row.id },
      priority: PRIORITY.background,
      idempotencyKey: `link.place:${row.id}`,
      maxAttempts: 1,
    });
  }
  return { places: places.length, links: links.length };
}

/** The links whose page may be read for a place: live, not read before, the
 *  author's *Read links I paste* on, and the address in the author's own words
 *  on the message the row came from. */
function readableLinks(trx: Executor) {
  return trx
    .selectFrom("content")
    .innerJoin("accounts", "accounts.id", "content.account_id")
    .innerJoin("messages", "messages.id", "content.derived_from_message_id")
    .select("content.id as id")
    .where("content.type", "=", "link")
    .where("content.deleted_at", "is", null)
    .where("content.place_read_at", "is", null)
    .where("content.url", "is not", null)
    .where("accounts.web_links_enabled", "=", true)
    .whereRef("messages.account_id", "=", "content.account_id")
    .where(sql<boolean>`position(content.url in coalesce(messages.text, '')) > 0`);
}

/** Whether one link may have its page read now. Asked again by the route the
 *  worker posts to, after the fetch: the worker is not trusted for an access
 *  decision. */
export async function linkReadable(contentId: string, trx: Executor = db): Promise<boolean> {
  if (!(await mapsOn()) || !(await setting("switch.web_links"))) return false;
  const row = await readableLinks(trx).where("content.id", "=", contentId).executeTakeFirst();
  return row !== undefined;
}

/** What a read of a link's page found, written: the page marked read either
 *  way, its own coordinates attached as the page's, or its place name kept and
 *  booked for a lookup. */
export async function applyPageRead(
  trx: Executor,
  contentId: string,
  found: { lat: number; lng: number } | { name: string } | null,
): Promise<void> {
  const name = found && "name" in found && !/[\r\n]/.test(found.name) ? found.name.trim().slice(0, 120) || null : null;
  await trx
    .updateTable("content")
    .set({ place_read_at: sql`now()`, ...(name ? { location: name } : {}), updated_at: sql`now()` })
    .where("id", "=", contentId)
    .execute();
  if (found && "lat" in found) await attachPagePoint(contentId, found.lat, found.lng, trx);
  if (name) {
    await enqueue({ kind: "location.resolve", payload: { contentId }, priority: PRIORITY.background, tx: trx });
  }
}
