// UUIDv7 in TypeScript, matching the uuid_v7() function in migration 0001.
//
// Two generators exist because two things create rows: Postgres defaults, and
// libraries that insist on supplying their own id. They must agree on the
// format or the column type rejects one of them, which is exactly how this
// came up: Better Auth generates nanoid-style strings and our columns are uuid.
//
// **Ordered within a millisecond too, in this process.** The leading 48 bits
// are the timestamp and the next 12 (`rand_a`) are a counter that starts at a
// random point each millisecond and counts up inside it (RFC 9562 method 1).
// It used to be random there, so ids minted in one millisecond ordered
// randomly against each other, and since 049 a thread's content page is
// ordered by id alone: a read through a row counted ids in a range and came
// back one long about half the time. The Postgres default is still random
// within a millisecond.

import { randomFillSync } from "node:crypto";

let lastMillis = -1;
let counter = 0;

export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  randomFillSync(bytes);

  let millis = Date.now();
  if (millis > lastMillis) {
    // A new millisecond starts the counter in its lower half, so it has room.
    counter = ((bytes[6]! << 8) | bytes[7]!) & 0x7ff;
    lastMillis = millis;
  } else {
    // The same millisecond, or a clock that stepped back: count on from the
    // last id, borrowing the next millisecond if the counter runs out.
    counter += 1;
    if (counter > 0xfff) {
      lastMillis += 1;
      counter = 0;
    }
    millis = lastMillis;
  }

  // 48-bit big-endian milliseconds since the epoch.
  bytes[0] = (millis / 2 ** 40) & 0xff;
  bytes[1] = (millis / 2 ** 32) & 0xff;
  bytes[2] = (millis / 2 ** 24) & 0xff;
  bytes[3] = (millis / 2 ** 16) & 0xff;
  bytes[4] = (millis / 2 ** 8) & 0xff;
  bytes[5] = millis & 0xff;

  // Version 7 in the high nibble of byte 6 over the counter, RFC 4122 variant
  // in byte 8.
  bytes[6] = 0x70 | (counter >> 8);
  bytes[7] = counter & 0xff;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
