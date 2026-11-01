// Ids minted in one millisecond used to order randomly against each other, so
// rows a test inserted in a loop could read back out of order, and a read that
// counts a range of ids counted one too many about half the time.

import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/uuid.js";

describe("uuidv7", () => {
  it("increases strictly, even inside one millisecond", () => {
    const ids = Array.from({ length: 5000 }, () => uuidv7());
    for (let i = 1; i < ids.length; i++) expect(ids[i]! > ids[i - 1]!, `${ids[i - 1]} then ${ids[i]}`).toBe(true);
  });

  it("keeps the version and variant bits", () => {
    for (const id of Array.from({ length: 100 }, () => uuidv7())) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
