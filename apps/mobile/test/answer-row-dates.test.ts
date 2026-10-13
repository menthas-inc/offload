// 2026-10-13 (the owner). An answer's rows can share a title, eight glass
// blowing classes, and the date is what tells them apart: the phones' answer
// card draws the shared meta line under a dated row's title. Read from the
// source, since these tests render nothing.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("an answer's dated rows on the phones", () => {
  it("carry their dates over the wire", () => {
    const lib = read("lib/dump.ts");
    const found = lib.slice(lib.indexOf("export interface FoundRow"), lib.indexOf("}", lib.indexOf("export interface FoundRow")));
    for (const field of ["dueAt: string | null", "occursAt: string | null", "occursEndAt: string | null", "allDay: boolean", "rrule: string | null"]) {
      expect(found).toContain(field);
    }
  });

  it("draw the shared meta line under the title, in the account's clock", () => {
    const card = read("components/shell/AnswerResult.tsx");
    expect(card).toMatch(/foundMeta\(row, zone, today\)/);
    expect(card).toMatch(/useClock\(\)/);
  });
});
