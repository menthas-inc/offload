// Keeping a connection usable, which nothing else in this product has to do.
//
// An access token lasts an hour and a sync and a live tool call can both want
// one at the same moment. Two refreshes racing is not just waste: Google can
// hand back a new refresh token, and the loser of the race writes a stale one
// over it.

import { db } from "../db.js";
import type { Executor } from "../threads/access.js";
import { GrantRevoked, refreshAccess, revoke } from "./google.js";
import { openOrNull, seal, VAULT_NAME } from "./vault.js";

/** Refresh a minute early, so a token does not expire between the check and the
 *  call it was fetched for. */
const SKEW_MS = 60 * 1000;

/** A usable access token for this connection, refreshing if it has to.
 *
 *  **Single flight per connection.** The row is locked for the whole
 *  check-then-refresh, inside a transaction this function owns, so two callers
 *  arriving together produce one refresh and both get the same result. A lock
 *  taken outside a transaction you own locks nothing useful, which this
 *  repository learned once already.
 *
 *  Throws `GrantRevoked` when the person has taken access away. That is a state
 *  and the caller marks it; it is never retried. */
export async function accessTokenFor(connectionId: string): Promise<string> {
  return db.transaction().execute(async (tx) => {
    // The connection's state is read here and nowhere else on the way to
    // Google: a grant already known to have lapsed is refused without a
    // network call, and every read of what is held stays open regardless.
    const connection = await tx
      .selectFrom("connector_connections")
      .select("state")
      .where("id", "=", connectionId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!connection || connection.state !== "active") throw new GrantRevoked();

    const row = await tx
      .selectFrom("connector_secrets")
      .selectAll()
      .where("connection_id", "=", connectionId)
      .forUpdate()
      .executeTakeFirst();

    if (!row) throw new GrantRevoked();

    const expires = row.access_expires_at ? new Date(row.access_expires_at).getTime() : 0;
    if (row.access_token.length > 0 && expires - SKEW_MS > Date.now()) {
      const access = openOrNull(row.access_token, connectionId, "access_token");
      if (access === null) throw new GrantRevoked();
      return access;
    }

    const refresh = row.refresh_token ? openOrNull(row.refresh_token, connectionId, "refresh_token") : null;
    if (refresh === null) throw new GrantRevoked();
    const refreshed = await refreshAccess(refresh);

    await tx
      .updateTable("connector_secrets")
      .set({
        access_token: seal(refreshed.accessToken, connectionId, "access_token"),
        // **Only when Google sent one.** It reissues a refresh token
        // occasionally, and a client that keeps the old one is a connection
        // that dies quietly weeks later. Writing null is the same death.
        ...(refreshed.refreshToken
          ? { refresh_token: seal(refreshed.refreshToken, connectionId, "refresh_token") }
          : {}),
        access_expires_at: refreshed.expiresAt,
        wrapped_by: VAULT_NAME,
        updated_at: new Date(),
      })
      .where("connection_id", "=", connectionId)
      .execute();

    return refreshed.accessToken;
  });
}

/** What a revoked grant means everywhere: stop, say so, offer Reconnect.
 *  Never a retry, because there is nothing on the other side to retry into. */
export async function markNeedsReauth(connectionId: string): Promise<void> {
  await db
    .updateTable("connector_connections")
    .set({ state: "needs_reauth", last_error_at: new Date(), updated_at: new Date() })
    .where("id", "=", connectionId)
    .execute();
}

/** S27. A grant sealed under a key no longer held cannot be handed back, and
 *  is still live at Google. Kept as it was sealed, under its connection's id
 *  (the refresh token when there is one, else the access token), so whoever
 *  holds the old key can open and revoke it. The hourly pass leaves it, Health
 *  counts it, and the seven days end it as they end any other. */
export async function keepUnopenable(trx: Executor, connectionId: string, sealed: Buffer): Promise<void> {
  await trx
    .insertInto("pending_revocations")
    .values({ id: connectionId, provider: "google", sealed_token: Buffer.from(sealed), unopenable_at: new Date() })
    .onConflict((oc) => oc.column("id").doNothing())
    .execute();
}

/** Hand the grant back to Google as well as forgetting it here.
 *
 *  Deleting our copy alone leaves the grant live on Google's side, so
 *  "disconnected" in offload would mean nothing where it counts. A failed
 *  revoke still deletes locally: holding a credential we have been asked to
 *  drop is the worse of the two outcomes. */
export async function revokeAndForget(connectionId: string): Promise<void> {
  const row = await db
    .selectFrom("connector_secrets")
    .selectAll()
    .where("connection_id", "=", connectionId)
    .executeTakeFirst();

  if (row) {
    const token = row.refresh_token
      ? openOrNull(row.refresh_token, connectionId, "refresh_token")
      : openOrNull(row.access_token, connectionId, "access_token");
    if (token !== null) await revoke(token).catch(() => undefined);
    else await keepUnopenable(db, connectionId, row.refresh_token ?? row.access_token);
  }

  await db.deleteFrom("connector_secrets").where("connection_id", "=", connectionId).execute();
  // 019. The copy and the picks go with the calendars: nothing can read them
  // after this, and a copy of somebody else's system that nobody reads is not
  // something to keep. The calendars' foreign keys cascade to both.
  await db.deleteFrom("connector_calendars").where("connection_id", "=", connectionId).execute();
  // The row stays, soft-deleted, and stops saying which Google account it was:
  // the privacy page says a disconnected calendar keeps nothing. Emptied, not
  // nulled, because 0023 declares the column not null; the unique key only
  // covers rows that are not deleted, so any number of these can share it.
  // The empty string is a convention, not a constraint: a reader that skips
  // `deleted_at is null` gets "" where it expects an address.
  await db
    .updateTable("connector_connections")
    .set({ state: "revoked", external_account_email: "", deleted_at: new Date(), updated_at: new Date() })
    .where("id", "=", connectionId)
    .execute();
}
