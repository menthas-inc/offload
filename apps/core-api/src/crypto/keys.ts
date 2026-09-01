// The key layers, as far as spec 002 needs them.
//
// root -> account key -> thread key -> object key -> blob (spec 001). This
// module implements the first two links, because promoting someone creates
// both: an account key wrapped by the root, and a thread key for their
// Miscellaneous thread wrapped by that account key.
//
// The root lives in DATA_ROOT_KEY, named db:v1 in every row it wraps. That
// name is the whole point of storing it: moving custody to a KMS later is a
// rewrap job that can tell which rows it has already done, rather than a
// migration that has to guess.
//
// AES-256-GCM, random 12-byte nonce, tag appended. Stored as
// nonce || ciphertext || tag in one bytea, so a wrapped key is one value and
// there is no second column to forget to copy.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env, isProduction } from "../env.js";

export const ROOT_NAME = "db:v1";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function rootKey(): Buffer {
  if (env.DATA_ROOT_KEY) {
    const key = Buffer.from(env.DATA_ROOT_KEY, "base64");
    if (key.length !== KEY_BYTES) {
      throw new Error(`DATA_ROOT_KEY must be ${KEY_BYTES} bytes of base64, got ${key.length}.`);
    }
    return key;
  }
  // Never in production: env.ts requires the variable there. A test database
  // gets a deterministic key so a suite can run without one being provisioned,
  // and it is derived rather than constant so that a developer machine and CI
  // do not share key material with anything real.
  if (isProduction) throw new Error("DATA_ROOT_KEY is required in production.");
  return Buffer.from(hkdfSync("sha256", env.BETTER_AUTH_SECRET, "offload-dev-root", "data-root-key", KEY_BYTES));
}

/** A fresh 256-bit data key. Never stored unwrapped. */
export function generateKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

export function wrap(plaintext: Buffer, key: Buffer = rootKey()): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([nonce, ciphertext, cipher.getAuthTag()]);
}

export function unwrap(sealed: Buffer, key: Buffer = rootKey()): Buffer {
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
