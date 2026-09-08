// Keeping a connection usable, which nothing else in this product has to do.
//
// An access token lasts an hour and a sync and a live tool call can both want
// one at the same moment. Two refreshes racing is not just waste: Google can
// hand back a new refresh token, and the loser of the race writes a stale one
// over it.

import { db } from "../db.js";
import { GrantRevoked, refreshAccess, revoke } from "./google.js";
import { open, seal, VAULT_NAME } from "./vault.js";

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
    const row = await tx
      .selectFrom("connector_secrets")
      .selectAll()
      .where("connection_id", "=", connectionId)
      .forUpdate()
      .executeTakeFirst();

    if (!row) throw new GrantRevoked();

    const expires = row.access_expires_at ? new Date(row.access_expires_at).getTime() : 0;
    if (row.access_token.length > 0 && expires - SKEW_MS > Date.now()) {
      return open(row.access_token, connectionId, "access_token");
    }

    if (!row.refresh_token) throw new GrantRevoked();
    const refreshed = await refreshAccess(open(row.refresh_token, connectionId, "refresh_token"));

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
      ? open(row.refresh_token, connectionId, "refresh_token")
      : open(row.access_token, connectionId, "access_token");
    await revoke(token).catch(() => undefined);
  }

  await db.deleteFrom("connector_secrets").where("connection_id", "=", connectionId).execute();
  await db
    .updateTable("connector_connections")
    .set({ state: "revoked", deleted_at: new Date(), updated_at: new Date() })
    .where("id", "=", connectionId)
    .execute();
}
