// Where a third party's credentials live.
//
// **Its own key, not the root.** `DATA_ROOT_KEY` seals content; this seals keys
// to somebody else's system. Two keys because rotating or losing one should
// never be a decision about the other, and because a compromise of one is not
// automatically both.
//
// **Its own table, and never Better Auth's.** `auth.ts` blanks every provider
// token on `account.create.before` and `account.update.before`, unconditionally,
// which is the fix for a real incident recorded in that file: every account once
// carried a live Google token in plaintext at rest. Connecting a calendar
// through the social-linking flow would either be silently broken by those hooks
// or "fixed" by weakening them, which restores the incident. This shares no
// route, no table and no hook with login.
//
// Same primitive as the key hierarchy: AES-256-GCM, random nonce, tag appended,
// stored as one bytea. What is added here is **associated data**. A sealed value
// on its own carries no proof of which connection or which field it belongs to,
// so somebody who can write to the database could move a ciphertext between
// rows. Cheap to close for a long-lived credential, and this is the first use of
// `wrap`/`unwrap` outside the hierarchy they were written for.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env, isProduction } from "../env.js";

/** Names the key that sealed a row, so a rotation can tell what it has already
 *  moved. `account_keys.wrapped_by` exists for exactly this reason and this
 *  table would have shipped without it. */
export const VAULT_NAME = "vault:v1";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export type SecretField = "access_token" | "refresh_token" | "notice_address";

function vaultKey(): Buffer {
  if (env.CONNECTOR_VAULT_KEY) {
    const key = Buffer.from(env.CONNECTOR_VAULT_KEY, "base64");
    if (key.length !== KEY_BYTES) {
      throw new Error(`CONNECTOR_VAULT_KEY must be ${KEY_BYTES} bytes of base64, got ${key.length}.`);
    }
    return key;
  }
  // In production a connector cannot run without one, and refusing loudly is
  // the same call `crypto/keys.ts` makes for the root. Everywhere else a
  // derived key lets a suite run without one being provisioned, and derived
  // rather than constant so a developer machine shares no key material with
  // anything real.
  if (isProduction) throw new Error("CONNECTOR_VAULT_KEY is required in production.");
  return Buffer.from(
    hkdfSync("sha256", env.BETTER_AUTH_SECRET, "offload-dev-vault", "connector-vault-key", KEY_BYTES)
  );
}

/** Binds a ciphertext to the row and column it belongs to. Moving a sealed
 *  value to another connection, or from the refresh token to the access token,
 *  fails to open rather than succeeding quietly. */
function aad(connectionId: string, field: SecretField): Buffer {
  return Buffer.from(`${VAULT_NAME}:${connectionId}:${field}`, "utf8");
}

export function seal(plaintext: string, connectionId: string, field: SecretField): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), nonce);
  cipher.setAAD(aad(connectionId, field));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, ciphertext, cipher.getAuthTag()]);
}

export function open(sealed: Buffer, connectionId: string, field: SecretField): string {
  if (sealed.length < NONCE_BYTES + TAG_BYTES) throw new Error("Sealed secret is too short to be one.");
  const nonce = sealed.subarray(0, NONCE_BYTES);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  const ciphertext = sealed.subarray(NONCE_BYTES, sealed.length - TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), nonce);
  decipher.setAAD(aad(connectionId, field));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Whether a calendar can be connected at all.
 *
 *  **Unset is a supported state**, the same shape `GOOGLE_MAPS_API_KEY` already
 *  established: the code ships, the boundary is enforced, and nothing calls out
 *  until somebody turns it on. Every screen reads this and says the connector is
 *  not available yet, rather than offering a button that cannot work. */
export function connectorsAvailable(): boolean {
  return Boolean(
    env.GOOGLE_CONNECTOR_CLIENT_ID && env.GOOGLE_CONNECTOR_CLIENT_SECRET && env.CONNECTOR_VAULT_KEY
  );
}
