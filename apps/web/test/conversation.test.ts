import { describe, expect, it } from "vitest";
import { lastSaidOf, STALE_MS, startsFresh } from "../src/lib/conversation";

// 30 September 2026: thirty minutes of silence ends a conversation on every
// surface. The server starts a new one; the open tab has to stop drawing the
// old one above it.
describe("startsFresh", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");

  it("keeps a conversation spoken to inside thirty minutes", () => {
    expect(startsFresh(now - STALE_MS + 1000, now)).toBe(false);
  });

  it("starts fresh after thirty minutes", () => {
    expect(STALE_MS).toBe(30 * 60 * 1000);
    expect(startsFresh(now - STALE_MS, now)).toBe(true);
  });

  it("has nothing to end when nothing was said", () => {
    expect(startsFresh(null, now)).toBe(false);
  });
});

describe("lastSaidOf", () => {
  it("is the newest message's time", () => {
    expect(lastSaidOf([{ createdAt: "2026-09-30T10:00:00Z" }, { createdAt: "2026-09-30T11:00:00Z" }])).toBe(
      Date.parse("2026-09-30T11:00:00Z"),
    );
  });

  it("is unknown for an empty tail or an API that sends no times", () => {
    expect(lastSaidOf([])).toBe(null);
    expect(lastSaidOf([{}])).toBe(null);
  });
});
