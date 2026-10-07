// F4. Search finds a memory by the words the person reads, which are spoken
// to them, as well as by the words it is stored in, which are about them.

import { describe, expect, it } from "vitest";
import { matchesMemory, type MemoryView } from "../src/memories.js";

const memory = (text: string): MemoryView => ({
  id: "m1",
  kind: "people",
  text,
  origin: "stated",
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-01T09:00:00.000Z",
  changed: false,
  source: { type: "none" },
  place: null,
});

describe("matchesMemory", () => {
  it("finds a memory by the words it is read in", () => {
    expect(matchesMemory(memory("Their sister is Sara."), "your")).toBe(true);
    expect(matchesMemory(memory("They are allergic to penicillin."), "you are")).toBe(true);
  });

  it("still finds it by the words it is stored in", () => {
    expect(matchesMemory(memory("Their sister is Sara."), "their")).toBe(true);
    expect(matchesMemory(memory("Their sister is Sara."), "sara")).toBe(true);
  });

  it("matches everything on an empty query and nothing on words it does not say", () => {
    expect(matchesMemory(memory("Their sister is Sara."), "  ")).toBe(true);
    expect(matchesMemory(memory("Their sister is Sara."), "brother")).toBe(false);
  });
});
