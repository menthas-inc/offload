// Where ciphertext lives.
//
// R2 through the S3 API, behind an interface small enough that a test runs
// against a Map. The store sees opaque bytes under an id-shaped key and never
// a name, an account or a plaintext byte: sealing happens in `keys.ts` before
// anything reaches here, which is what "a key R2 never receives" means in
// code (OFF-2).
//
// **Never the in-memory store in production.** `env.ts` warns at boot and the
// upload route refuses with 503 rather than holding somebody's photo in a
// process that will restart.

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env, isProduction, r2Configured } from "../env.js";

export type Rendition = "original" | "thumb" | "large";
export const RENDITIONS: readonly Rendition[] = ["original", "thumb", "large"];

export interface ObjectStore {
  put(key: string, bytes: Buffer): Promise<void>;
  /** Null when there is no such object. */
  get(key: string): Promise<Buffer | null>;
  /** Idempotent: a key that is already gone is not an error. */
  remove(keys: string[]): Promise<void>;
}

/** The object key for a blob's rendition. An id and a word, never a name. */
export function objectKey(blobId: string, rendition: Rendition): string {
  return `blobs/${blobId}/${rendition}`;
}

class MemoryStore implements ObjectStore {
  readonly objects = new Map<string, Buffer>();
  async put(key: string, bytes: Buffer): Promise<void> {
    this.objects.set(key, Buffer.from(bytes));
  }
  async get(key: string): Promise<Buffer | null> {
    const found = this.objects.get(key);
    return found ? Buffer.from(found) : null;
  }
  async remove(keys: string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key);
  }
}

class R2Store implements ObjectStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = env.R2_BUCKET!;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: "application/octet-stream",
      }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!result.Body) return null;
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  }

  async remove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const result = await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    // Quiet mode reports only what failed. A delete that half succeeded is
    // a failed delete: the purge keeps the row and tries again, rather than
    // dropping the row over ciphertext nothing will ever remove. Codes only.
    const errors = result.Errors ?? [];
    if (errors.length > 0) {
      throw new Error(`r2 delete: ${errors.length} of ${keys.length} refused (${errors[0]?.Code ?? "unknown"})`);
    }
  }
}

let current: ObjectStore | null = null;

/** The store. Absent in production until R2 is configured, and the caller
 *  says so with a 503 rather than pretending. */
export function objectStore(): ObjectStore | null {
  if (current) return current;
  // Never the real bucket from a test run. The suite loads the repo's own
  // environment file, which on a developer's machine carries the bucket's
  // keys, and a test that uploads would be writing to it.
  if (r2Configured && env.NODE_ENV !== "test") current = new R2Store();
  else if (!isProduction) current = new MemoryStore();
  return current;
}

/** For tests: forget everything held in memory. */
export function resetObjectStore(): void {
  current = null;
}
