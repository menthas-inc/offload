// The key layers, as far as spec 002 needs them.
//
// root -> account key -> thread key -> object key -> blob (spec 001). This
// module implements the first two links, because promoting someone creates
// both: an account key wrapped by the root, and a thread key for their
// Miscellaneous thread wrapped by that account key.
//
// The root lives in DATA_ROOT_KEY, and every row it wraps names it. That name
// is the whole point of storing it: rotating the root, or moving custody to a
// KMS, is a rewrap job that can tell which rows it has already done, rather
// than a migration that has to guess (047, `rotate-keys.ts`). While a rotation
// runs, DATA_ROOT_KEY_PREVIOUS holds the root being retired and each row is
// opened by the one it names.
//
// AES-256-GCM, random 12-byte nonce, tag appended. Stored as
// nonce || ciphertext || tag in one bytea, so a wrapped key is one value and
// there is no second column to forget to copy.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env, isProduction } from "../env.js";

/** What every row said before 047, whichever key that was. */
const LEGACY_NAME = "db:v1";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function decoded(variable: string, value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`${variable} must be ${KEY_BYTES} bytes of base64, got ${key.length}.`);
  }
  return key;
}

function rootKey(): Buffer {
  if (env.DATA_ROOT_KEY) return decoded("DATA_ROOT_KEY", env.DATA_ROOT_KEY);
  // Never in production: env.ts requires the variable there. A test database
  // gets a deterministic key so a suite can run without one being provisioned,
  // and it is derived rather than constant so that a developer machine and CI
  // do not share key material with anything real.
  if (isProduction) throw new Error("DATA_ROOT_KEY is required in production.");
  return Buffer.from(hkdfSync("sha256", env.BETTER_AUTH_SECRET, "offload-dev-root", "data-root-key", KEY_BYTES));
}

/** A root's name, derived from the key itself rather than set beside it, so a
 *  row's name can never disagree with the key that wrapped it, whatever order
 *  the variables change and the deploys land in. Six bytes of HKDF output say
 *  nothing useful about the key. */
function nameOf(root: Buffer): string {
  return `db:${Buffer.from(hkdfSync("sha256", root, "", "offload-root-name", 6)).toString("hex")}`;
}

/** The name new wraps carry. */
export function rootName(): string {
  return nameOf(rootKey());
}

function rootNamed(name: string): Buffer {
  const current = rootKey();
  const previous = env.DATA_ROOT_KEY_PREVIOUS ? decoded("DATA_ROOT_KEY_PREVIOUS", env.DATA_ROOT_KEY_PREVIOUS) : null;
  if (name === nameOf(current)) return current;
  if (previous && name === nameOf(previous)) return previous;
  // Before 047 there was one root and every row said db:v1. Mid-rotation that
  // is the one being retired; otherwise it is the only one there is.
  if (name === LEGACY_NAME) return previous ?? current;
  throw new Error(`No root key named ${name} is configured.`);
}

/** An account key sealed under the current root, as its row stores it. */
export function wrapUnderRoot(key: Buffer): { wrapped_dek: Buffer; wrapped_by: string } {
  const root = rootKey();
  return { wrapped_dek: wrap(key, root), wrapped_by: nameOf(root) };
}

/** An account key out of its row, under whichever root the row names. */
export function unwrapFromRoot(row: { wrapped_dek: Buffer; wrapped_by: string }): Buffer {
  return unwrap(Buffer.from(row.wrapped_dek), rootNamed(row.wrapped_by));
}

/** A fresh 256-bit data key. Never stored unwrapped. */
export function generateKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

export function wrap(plaintext: Buffer, key: Buffer): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([nonce, ciphertext, cipher.getAuthTag()]);
}

export function unwrap(sealed: Buffer, key: Buffer): Buffer {
  if (sealed.length < NONCE_BYTES + TAG_BYTES) throw new Error("Wrapped key is too short to be one.");
  const nonce = sealed.subarray(0, NONCE_BYTES);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  const ciphertext = sealed.subarray(NONCE_BYTES, sealed.length - TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  // Throws on a bad tag, which is the point: a wrapped key that has been
  // altered fails loudly rather than decrypting to noise.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
