// UUIDv7 in TypeScript, matching the uuid_v7() function in migration 0001.
//
// Two generators exist because two things create rows: Postgres defaults, and
// libraries that insist on supplying their own id. They must agree on the
// format or the column type rejects one of them, which is exactly how this
// came up: Better Auth generates nanoid-style strings and our columns are uuid.
//
// Ordering is per millisecond, not within one. The leading 48 bits are the
// timestamp, so ids cluster on insert and sort by creation time at millisecond
// granularity; ids minted inside the same millisecond order randomly against
// each other. That is the basic RFC 9562 form and it is fine for the two
// things we rely on: B-tree locality cares about the prefix, and cursor
// pagination orders on the (created_at, id) tuple regardless.

import { randomFillSync } from "node:crypto";

export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  randomFillSync(bytes);

  // 48-bit big-endian milliseconds since the epoch.
  const millis = Date.now();
  bytes[0] = (millis / 2 ** 40) & 0xff;
  bytes[1] = (millis / 2 ** 32) & 0xff;
  bytes[2] = (millis / 2 ** 24) & 0xff;
  bytes[3] = (millis / 2 ** 16) & 0xff;
  bytes[4] = (millis / 2 ** 8) & 0xff;
  bytes[5] = millis & 0xff;

  // Version 7 in the high nibble of byte 6, RFC 4122 variant in byte 8.
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
